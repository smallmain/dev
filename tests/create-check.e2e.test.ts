import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  cliPath,
  distDir,
  formatCommandFailure,
  repoRoot,
  runCommand,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
const symlinkDirType = process.platform === "win32" ? "junction" : "dir";

interface InstalledProject {
  projectDir: string;
  env: NodeJS.ProcessEnv;
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

const variants: { label: string; args: string[] }[] = [
  { label: "default", args: [] },
  { label: "css-modules", args: ["--component", "css", "--css", "css-modules"] },
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
        const output = `${check.stdout}${check.stderr}`;

        expect(check.exitCode, formatCommandFailure("sm check", check)).toBe(0);
        expect(output).not.toContain("Format issues");
        expect(output.toLowerCase(), output).not.toContain("warning");
      });
    },
    testTimeoutMs,
  );
}
