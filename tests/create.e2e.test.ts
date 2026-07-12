import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  cliPath,
  formatCommandFailure,
  repoRoot,
  runCommand,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";

test(
  "creates a package with the default options",
  async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "sm-create-e2e-"));
    const installLogPath = path.join(projectDir, "install.log");
    let passed = false;

    try {
      const fakeBinDir = await createFakePackageManagers(projectDir);
      const result = await runCommand(process.execPath, [cliPath, "create", "--yes"], {
        cwd: projectDir,
        env: createFakePackageManagerEnv(fakeBinDir, installLogPath),
        timeoutMs: testTimeoutMs,
      });
      const expectedName = toPackageName(path.basename(projectDir));

      expect(result, formatCommandFailure("sm create --yes", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      await expectPathExists(path.join(projectDir, "package.json"));
      await expectPathExists(path.join(projectDir, ".git/HEAD"));
      await expectPathExists(path.join(projectDir, ".vscode/settings.json"));
      await expectPathExists(path.join(projectDir, "README.md"));

      const packageJson = await readJson<{
        name?: string;
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      }>(path.join(projectDir, "package.json"));
      const extensionsJson = await readJson<{ recommendations?: string[] }>(
        path.join(projectDir, ".vscode/extensions.json"),
      );
      const oxlintConfig = await readFile(path.join(projectDir, "oxlint.config.ts"), "utf8");

      expect(packageJson.name).toBe(expectedName);
      expect(packageJson.scripts?.check).toBe("sm check");
      expect(packageJson.scripts?.["check:fix"]).toBe("sm check --fix");
      expect(packageJson.scripts?.prepare).toBe("sm set-git-hook");
      expect(packageJson.scripts?.test).toBe("vitest");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(extensionsJson.recommendations).toContain("vitest.explorer");
      expect(oxlintConfig).toContain("{ vitest }");
      expect(oxlintConfig).toContain("extends: [generic, vitest]");
      await expectPathExists(path.join(projectDir, "vitest.config.ts"));
      await expectPathMissing(path.join(projectDir, "stylelint.config.ts"));
      await expectFileContent(installLogPath, "pnpm install\n");
      expect(result.stdout).toContain(`Created ${expectedName} in `);

      passed = true;
    } finally {
      await cleanupProjectDir(projectDir, passed);
    }
  },
  testTimeoutMs,
);

test(
  "creates a package with nodejs runtime, npm, and css modules",
  async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "sm-create-e2e-"));
    const installLogPath = path.join(projectDir, "install.log");
    let passed = false;

    try {
      const fakeBinDir = await createFakePackageManagers(projectDir);
      const result = await runCommand(
        process.execPath,
        [
          cliPath,
          "create",
          "--yes",
          "--runtime",
          "nodejs",
          "--node-version",
          "^24",
          "--component",
          "css",
          "--css",
          "css-modules",
          "--package-manager",
          "npm",
        ],
        {
          cwd: projectDir,
          env: createFakePackageManagerEnv(fakeBinDir, installLogPath),
          timeoutMs: testTimeoutMs,
        },
      );

      expect(result, formatCommandFailure("sm create custom", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });

      const packageJson = await readJson<{
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        devEngines?: { packageManager?: { name?: string } };
        engines?: { node?: string };
      }>(path.join(projectDir, "package.json"));
      const stylelintConfig = await readFile(path.join(projectDir, "stylelint.config.ts"), "utf8");
      const oxlintConfig = await readFile(path.join(projectDir, "oxlint.config.ts"), "utf8");
      const extensionsJson = await readJson<{ recommendations?: string[] }>(
        path.join(projectDir, ".vscode/extensions.json"),
      );

      expect(packageJson.scripts?.prepare).toBeUndefined();
      expect(packageJson.scripts?.check).toBe("sm check");
      expect(packageJson.scripts?.["check:fix"]).toBe("sm check --fix");
      expect(packageJson.scripts?.test).toBe("vitest");
      expect(packageJson.devDependencies).toHaveProperty("@types/node");
      expect(packageJson.devDependencies).toHaveProperty("stylelint");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(packageJson.devEngines?.packageManager?.name).toBe("npm");
      expect(packageJson.engines?.node).toBe("^24");
      expect(stylelintConfig).toContain("@smallmains/dev/stylelint/css-modules.js");
      expect(oxlintConfig).toContain("{ nodejs, vitest }");
      expect(oxlintConfig).toContain("extends: [generic, nodejs, vitest]");
      expect(extensionsJson.recommendations).toEqual(
        expect.arrayContaining(["stylelint.vscode-stylelint", "vitest.explorer"]),
      );
      await expectPathExists(path.join(projectDir, "stylelint.config.ts"));
      await expectPathExists(path.join(projectDir, "vitest.config.ts"));
      await expectFileContent(installLogPath, "npm install\n");

      passed = true;
    } finally {
      await cleanupProjectDir(projectDir, passed);
    }
  },
  testTimeoutMs,
);

test(
  "validates the create command public options",
  async () => {
    const helpResult = await runCommand(process.execPath, [cliPath, "create", "--help"], {
      cwd: repoRoot,
      timeoutMs: testTimeoutMs,
    });

    expect(helpResult, formatCommandFailure("sm create --help", helpResult)).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expect(helpResult.stdout).not.toContain("--stack");
    expect(helpResult.stdout).not.toContain("vitest");

    const projectDir = await mkdtemp(path.join(tmpdir(), "sm-create-e2e-"));
    let passed = false;

    try {
      const result = await runCommand(
        process.execPath,
        [cliPath, "create", "--yes", "--component", "vitest"],
        {
          cwd: projectDir,
          timeoutMs: testTimeoutMs,
        },
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unsupported component: vitest.");
      passed = true;
    } finally {
      await cleanupProjectDir(projectDir, passed);
    }
  },
  testTimeoutMs,
);

async function expectPathExists(filePath: string): Promise<void> {
  await expect(stat(filePath)).resolves.toBeDefined();
}

async function expectPathMissing(filePath: string): Promise<void> {
  await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function expectFileContent(filePath: string, expectedContent: string): Promise<void> {
  await expect(readFile(filePath, "utf8")).resolves.toBe(expectedContent);
}

async function createFakePackageManagers(projectDir: string): Promise<string> {
  const fakeBinDir = path.join(projectDir, ".fake-bin");

  await mkdir(fakeBinDir);
  await Promise.all(
    ["npm", "pnpm"].map(async packageManager => {
      const filePath = path.join(fakeBinDir, packageManager);

      await writeFile(
        filePath,
        [
          "#!/bin/sh",
          'printf "%s %s\\n" "$(basename "$0")" "$*" >> "$SM_CREATE_INSTALL_LOG"',
          "",
        ].join("\n"),
      );
      await chmod(filePath, 0o755);
    }),
  );

  return fakeBinDir;
}

function createFakePackageManagerEnv(
  fakeBinDir: string,
  installLogPath: string,
): NodeJS.ProcessEnv {
  return {
    [pathEnvKey]: [fakeBinDir, process.env[pathEnvKey] ?? ""].filter(Boolean).join(path.delimiter),
    SM_CREATE_INSTALL_LOG: installLogPath,
  };
}

async function cleanupProjectDir(projectDir: string, passed: boolean): Promise<void> {
  if (!passed || process.env.KEEP_TEST_TEMP === "1") {
    console.info(`Kept create e2e temp directory: ${projectDir}`);
    return;
  }

  await rm(projectDir, { force: true, recursive: true });
}

function toPackageName(value: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._~-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalizedValue || "my-package";
}
