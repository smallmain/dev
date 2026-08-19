import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  cliPath,
  distDir,
  formatCommandFailure,
  parseJson,
  parseOxlintReport,
  repoRoot,
  runCommand,
  runOxlint,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
const symlinkDirType = process.platform === "win32" ? "junction" : "dir";

interface InstalledProject {
  projectDir: string;
  env: NodeJS.ProcessEnv;
}

interface StylelintJsonResult {
  deprecations?: unknown[];
  invalidOptionWarnings?: unknown[];
  parseErrors?: unknown[];
  warnings?: unknown[];
}

interface VitestJsonReport {
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numTotalTests: number;
  success: boolean;
  testResults: { status: "failed" | "passed" }[];
}

// Recreates a realistic post-install layout without hitting the network: the
// freshly built package is linked as `@smallmains/dev`, and the repo's own
// dependencies are resolvable from a parent `node_modules` (so plugins declared
// by the shared configs, e.g. `@e18e/eslint-plugin`, resolve). Package-manager
// installs are stubbed so `sm create` does not perform a real install.
async function withInstalledProject(
  run: (project: InstalledProject) => Promise<void>,
): Promise<void> {
  const workDir = await mkdtemp(path.join(tmpdir(), "sm-create-check-e2e-"));
  let passed = false;

  try {
    await symlink(
      path.join(repoRoot, "node_modules"),
      path.join(workDir, "node_modules"),
      symlinkDirType,
    );

    const projectDir = path.join(workDir, "project");
    await mkdir(path.join(projectDir, "node_modules", "@smallmains"), { recursive: true });
    await symlink(
      distDir,
      path.join(projectDir, "node_modules", "@smallmains", "dev"),
      symlinkDirType,
    );
    // Type-aware linting resolves test imports from the generated project's
    // installation, so mirror the direct Vitest dependency instead of relying
    // on the parent fixture's hoisted dependency fallback.
    await symlink(
      path.join(repoRoot, "node_modules/vitest"),
      path.join(projectDir, "node_modules/vitest"),
      symlinkDirType,
    );

    const fakeBinDir = await createFakePackageManagers(workDir);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [pathEnvKey]: [fakeBinDir, process.env[pathEnvKey] ?? ""]
        .filter(Boolean)
        .join(path.delimiter),
    };

    await run({ projectDir, env });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept create-check e2e temp directory: ${workDir}`);
    } else {
      await rm(workDir, { force: true, recursive: true });
    }
  }
}

async function createFakePackageManagers(dir: string): Promise<string> {
  const fakeBinDir = path.join(dir, ".fake-bin");

  await mkdir(fakeBinDir, { recursive: true });
  await Promise.all(
    ["npm", "pnpm"].map(async packageManager => {
      const filePath = path.join(fakeBinDir, packageManager);

      await writeFile(filePath, "#!/bin/sh\ntrue\n");
      await chmod(filePath, 0o755);
    }),
  );

  return fakeBinDir;
}

const variants: {
  label: string;
  args: string[];
  runStylelint?: boolean;
  runTests?: boolean;
}[] = [
  { label: "default", args: [], runTests: true },
  {
    label: "css-modules",
    args: ["--component", "css", "--css", "css-modules"],
    runStylelint: true,
  },
];

for (const variant of variants) {
  test(
    `the ${variant.label} scaffold passes sm check out of the box`,
    async () => {
      await withInstalledProject(async ({ projectDir, env }) => {
        const create = await runCommand(
          process.execPath,
          [cliPath, "create", "--yes", ...variant.args],
          { cwd: projectDir, env, timeoutMs: testTimeoutMs },
        );

        expect(create, formatCommandFailure("sm create --yes", create)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });

        const check = await runCommand(process.execPath, [cliPath, "check"], {
          cwd: projectDir,
          env,
          timeoutMs: testTimeoutMs,
        });

        expect(check, formatCommandFailure("sm check", check)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });
        await expectNoOxlintDiagnostics(projectDir);

        if (variant.runStylelint) {
          await expectNoStylelintDiagnostics(projectDir, env);
        }

        if (variant.runTests) {
          const reportPath = path.join(projectDir, ".vitest-report.json");
          const testRun = await runCommand(
            process.execPath,
            [
              path.join(repoRoot, "node_modules/vitest/vitest.mjs"),
              "run",
              "--reporter",
              "json",
              "--outputFile",
              reportPath,
            ],
            { cwd: projectDir, env, timeoutMs: testTimeoutMs },
          );

          expect(testRun, formatCommandFailure("vitest run", testRun)).toMatchObject({
            exitCode: 0,
            timedOut: false,
          });
          const report = parseJson<VitestJsonReport>(
            await readFile(reportPath, "utf8"),
            `Vitest JSON report: ${reportPath}`,
          );

          expect(report).toMatchObject({
            numFailedTests: 0,
            numPassedTests: 2,
            numPendingTests: 0,
            numTodoTests: 0,
            numTotalTests: 2,
            success: true,
          });
          expect(report.testResults).toHaveLength(2);
          expect(report.testResults.every(result => result.status === "passed")).toBe(true);
          expect((await stat(path.join(projectDir, "coverage"))).isDirectory()).toBe(true);
        }
      });
    },
    testTimeoutMs,
  );
}

test(
  "create fails when the generated project does not pass its final checks",
  async () => {
    await withInstalledProject(async ({ projectDir, env }) => {
      await mkdir(path.join(projectDir, "src"), { recursive: true });
      await writeFile(
        path.join(projectDir, "src/missing-description.ts"),
        "/* oxlint-disable no-console */\nexport const value = 1;\n",
      );

      const create = await runCommand(process.execPath, [cliPath, "create", "--yes"], {
        cwd: projectDir,
        env,
        timeoutMs: testTimeoutMs,
      });

      expect(create.exitCode).not.toBe(0);
      expect(create.stdout).not.toContain("Created ");
      expect(create.stderr).toContain("Project checks failed with exit code");
    });
  },
  testTimeoutMs,
);

async function expectNoOxlintDiagnostics(projectDir: string): Promise<void> {
  const result = await runOxlint({
    configPath: path.join(projectDir, "oxlint.config.ts"),
    cwd: projectDir,
    targets: ["."],
  });

  expect(result, formatCommandFailure("oxlint --format json", result)).toMatchObject({
    exitCode: 0,
    timedOut: false,
  });
  const report = parseOxlintReport(result);

  expect(report.number_of_files).toBeGreaterThan(0);
  expect(report.diagnostics).toEqual([]);
}

async function expectNoStylelintDiagnostics(
  projectDir: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const reportPath = path.join(projectDir, ".stylelint-report.json");
  const result = await runCommand(
    process.execPath,
    [
      path.join(repoRoot, "node_modules/stylelint/bin/stylelint.mjs"),
      "--allow-empty-input",
      "--formatter",
      "json",
      "--output-file",
      reportPath,
      "**/*.{css,scss,sass,less,pcss,html,ejs,vue,svelte,astro,md,mdx}",
    ],
    { cwd: projectDir, env, timeoutMs: testTimeoutMs },
  );

  expect(result, formatCommandFailure("stylelint --formatter json", result)).toMatchObject({
    exitCode: 0,
    timedOut: false,
  });
  const report = parseJson<StylelintJsonResult[]>(
    await readFile(reportPath, "utf8"),
    `Stylelint JSON report: ${reportPath}`,
  );
  const diagnostics = report.flatMap(file => [
    ...(file.deprecations ?? []),
    ...(file.invalidOptionWarnings ?? []),
    ...(file.parseErrors ?? []),
    ...(file.warnings ?? []),
  ]);

  expect(report.length).toBeGreaterThan(0);
  expect(diagnostics).toEqual([]);
}
