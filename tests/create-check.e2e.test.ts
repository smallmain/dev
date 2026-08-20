import { chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import {
  cliPath,
  formatCommandFailure,
  parseJson,
  parseOxlintReport,
  repoRoot,
  runCommand,
  runOxlint,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";
import { withInstalledCreateProject } from "./create-e2e-utils.ts";

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";

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
      await withInstalledCreateProject(
        async ({ projectDir, env }) => {
          const existingFormatPath = path.join(projectDir, "existing-format.ts");

          await writeFile(existingFormatPath, "export const values=[1,2,3]\n");
          const create = await runCommand(
            process.execPath,
            [cliPath, "create", "--yes", ...variant.args],
            { cwd: projectDir, env, timeoutMs: testTimeoutMs },
          );

          expect(create, formatCommandFailure("sm create --yes", create)).toMatchObject({
            exitCode: 0,
            timedOut: false,
          });
          expect(
            create.stdout.indexOf("Installing dependencies with pnpm..."),
          ).toBeGreaterThanOrEqual(0);
          expect(create.stdout.indexOf("Fixing and formatting files...")).toBeGreaterThan(
            create.stdout.indexOf("Installing dependencies with pnpm..."),
          );
          expect(create.stdout.indexOf("Created ")).toBeGreaterThan(
            create.stdout.indexOf("Fixing and formatting files..."),
          );
          await expect(readFile(existingFormatPath, "utf8")).resolves.toBe(
            "export const values = [1, 2, 3];\n",
          );

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
        },
        { stylelint: variant.runStylelint },
      );
    },
    testTimeoutMs,
  );
}

test(
  "create fails when the generated project does not pass its final checks",
  async () => {
    await withInstalledCreateProject(async ({ projectDir, env }) => {
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

test(
  "create retries dependency installation until it succeeds",
  async () => {
    await withInstalledCreateProject(
      async ({ env, installAttemptsPath, installLogPath, projectDir, ttyPreloadPath }) => {
        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create"],
          {
            cwd: projectDir,
            env: {
              ...env,
              SM_CREATE_INSTALL_FAILURES: "2",
              SM_CREATE_RETRY_MARKER: path.join(projectDir, "README.md"),
              SM_CREATE_TTY_AFTER_FILE: path.join(projectDir, "package.json"),
            },
            stdin: "yes\ny\n",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result, formatCommandFailure("interactive sm create", result)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });
        await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("3\n");
        await expect(readFile(installLogPath, "utf8")).resolves.toBe(
          "pnpm install\npnpm install\npnpm install\n",
        );
        expect(countOccurrences(result.stdout, "Retry dependency installation? [y/N]")).toBe(2);
        expect(countOccurrences(result.stdout, "Retrying dependencies with pnpm...")).toBe(2);
        expect(result.stdout).toContain("Fixing and formatting files...");
        expect(result.stdout).toContain("Created ");
        await expect(readFile(path.join(projectDir, "README.md"), "utf8")).resolves.toContain(
          "retry marker",
        );
      },
    );
  },
  testTimeoutMs,
);

test(
  "create stops when an installation retry is declined",
  async () => {
    await withInstalledCreateProject(
      async ({ env, installAttemptsPath, projectDir, ttyPreloadPath }) => {
        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create"],
          {
            cwd: projectDir,
            env: {
              ...env,
              SM_CREATE_INSTALL_FAILURES: "1",
              SM_CREATE_TTY_AFTER_FILE: path.join(projectDir, "package.json"),
            },
            stdin: "n\n",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result.exitCode).not.toBe(0);
        await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("1\n");
        expect(result.stdout).toContain("Retry dependency installation? [y/N]");
        expect(result.stdout).not.toContain("Fixing and formatting files...");
        expect(result.stdout).not.toContain("Created ");
        expect(result.stderr).toContain("pnpm install exited with code 17.");
      },
    );
  },
  testTimeoutMs,
);

test(
  "create stops when the installation retry prompt is cancelled",
  async () => {
    await withInstalledCreateProject(
      async ({ env, installAttemptsPath, projectDir, ttyPreloadPath }) => {
        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create"],
          {
            cwd: projectDir,
            env: {
              ...env,
              SM_CREATE_INSTALL_FAILURES: "1",
              SM_CREATE_TTY_AFTER_FILE: path.join(projectDir, "package.json"),
            },
            stdin: "",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result.exitCode).not.toBe(0);
        await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("1\n");
        expect(result.stdout).toContain("Retry dependency installation? [y/N]");
        expect(result.stdout).not.toContain("Fixing and formatting files...");
        expect(result.stdout).not.toContain("Created ");
        expect(result.stderr).toContain("pnpm install exited with code 17.");
      },
    );
  },
  testTimeoutMs,
);

test(
  "create --yes does not prompt after a retryable installation failure",
  async () => {
    await withInstalledCreateProject(
      async ({ env, installAttemptsPath, projectDir, ttyPreloadPath }) => {
        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create", "--yes"],
          {
            cwd: projectDir,
            env: { ...env, SM_CREATE_INSTALL_FAILURES: "1" },
            stdin: "y\n",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result.exitCode).not.toBe(0);
        await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("1\n");
        expect(result.stdout).not.toContain("Retry dependency installation?");
        expect(result.stdout).not.toContain("Fixing and formatting files...");
        expect(result.stdout).not.toContain("Created ");
        expect(result.stderr).toContain("pnpm install exited with code 17.");
      },
    );
  },
  testTimeoutMs,
);

test(
  "create does not prompt after a non-interactive installation failure",
  async () => {
    await withInstalledCreateProject(async ({ env, installAttemptsPath, projectDir }) => {
      const result = await runCommand(process.execPath, [cliPath, "create"], {
        cwd: projectDir,
        env: { ...env, SM_CREATE_INSTALL_FAILURES: "1" },
        timeoutMs: testTimeoutMs,
      });

      expect(result.exitCode).not.toBe(0);
      await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("1\n");
      expect(result.stdout).not.toContain("Retry dependency installation?");
      expect(result.stdout).not.toContain("Fixing and formatting files...");
      expect(result.stdout).not.toContain("Created ");
      expect(result.stderr).toContain("pnpm install exited with code 17.");
    });
  },
  testTimeoutMs,
);

test(
  "create does not prompt after an interrupted installation",
  async () => {
    await withInstalledCreateProject(
      async ({ env, installAttemptsPath, projectDir, ttyPreloadPath }) => {
        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create"],
          {
            cwd: projectDir,
            env: {
              ...env,
              SM_CREATE_INSTALL_SIGNAL: "TERM",
              SM_CREATE_TTY_AFTER_FILE: path.join(projectDir, "package.json"),
            },
            stdin: "y\n",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result.exitCode).not.toBe(0);
        await expect(readFile(installAttemptsPath, "utf8")).resolves.toBe("1\n");
        expect(result.stdout).not.toContain("Retry dependency installation?");
        expect(result.stdout).not.toContain("Fixing and formatting files...");
        expect(result.stdout).not.toContain("Created ");
        expect(result.stderr).toContain("pnpm install terminated by SIGTERM.");
      },
    );
  },
  testTimeoutMs,
);

test(
  "create does not prompt when the package-manager command cannot start",
  async () => {
    await withInstalledCreateProject(
      async ({ env, fakeBinDir, installAttemptsPath, projectDir, ttyPreloadPath }) => {
        const fakeGitPath = path.join(fakeBinDir, "git");

        await writeFile(fakeGitPath, "#!/bin/sh\nexit 0\n");
        await chmod(fakeGitPath, 0o755);
        await unlink(path.join(fakeBinDir, "pnpm"));

        const result = await runCommand(
          process.execPath,
          ["--import", ttyPreloadPath, cliPath, "create"],
          {
            cwd: projectDir,
            env: {
              ...env,
              [pathEnvKey]: fakeBinDir,
              SM_CREATE_TTY_AFTER_FILE: path.join(projectDir, "package.json"),
            },
            stdin: "y\n",
            timeoutMs: testTimeoutMs,
          },
        );

        expect(result.exitCode).not.toBe(0);
        await expect(readFile(installAttemptsPath, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(result.stdout).toContain("Installing dependencies with pnpm...");
        expect(result.stdout).not.toContain("Retry dependency installation?");
        expect(result.stdout).not.toContain("Fixing and formatting files...");
        expect(result.stdout).not.toContain("Created ");
      },
    );
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

function countOccurrences(content: string, value: string): number {
  return content.split(value).length - 1;
}
