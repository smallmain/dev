import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
const expectedSourceContent = `/**
 * This is a useful module.
 *
 * @module
 * @public
 */

/**
 * This is a useful value.
 */
export const value = "hello world.";
`;
const expectedUnitTestContent = `import { expect, test } from "vitest";
import { value } from "./index.ts";

test("exports a useful value", () => {
  expect(value).toBe("hello world.");
});
`;

test(
  "creates a package with the default options",
  async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "sm-create-e2e-"));
    const installLogPath = path.join(projectDir, "install.log");
    let passed = false;

    try {
      const fakeBinDir = await createFakePackageManagers(projectDir);
      await writeExistingExampleFiles(projectDir);
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
      await expectPathExists(path.join(projectDir, ".editorconfig"));
      await expectPathExists(path.join(projectDir, ".gitignore"));
      await expectPathExists(path.join(projectDir, "README.md"));

      const packageJson = await readJson<{
        exports?: string;
        name?: string;
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        devEngines?: { packageManager?: { name?: string } };
        engines?: { node?: string };
      }>(path.join(projectDir, "package.json"));
      const extensionsJson = await readJson<{ recommendations?: string[] }>(
        path.join(projectDir, ".vscode/extensions.json"),
      );
      const settingsJson = await readJson<Record<string, unknown>>(
        path.join(projectDir, ".vscode/settings.json"),
      );
      const oxlintConfig = await readFile(path.join(projectDir, "oxlint.config.ts"), "utf8");

      expect(packageJson.name).toBe(expectedName);
      expect(packageJson.exports).toBe("./src/index.ts");
      expect(packageJson.scripts?.check).toBe("sm check");
      expect(packageJson.scripts?.["check:fix"]).toBe("sm check --fix");
      expect(packageJson.scripts?.prepare).toBe("sm set-git-hook");
      expect(packageJson.scripts?.test).toBe("vitest");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(packageJson.devDependencies?.["@vitest/coverage-v8"]).toBe(
        packageJson.devDependencies?.vitest,
      );
      expect(packageJson.devDependencies).not.toHaveProperty("stylelint");
      expect(packageJson.devDependencies).not.toHaveProperty("@types/node");
      expect(packageJson.devEngines?.packageManager?.name).toBe("pnpm");
      expect(packageJson.engines).toBeUndefined();
      expect(extensionsJson.recommendations).toContain("vitest.explorer");
      expect(extensionsJson.recommendations).not.toContain("stylelint.vscode-stylelint");
      expect(settingsJson["[html][css][scss][less]"]).toBeDefined();
      expect(settingsJson["[vue]"]).toBeDefined();
      expect(settingsJson["stylelint.validate"]).toBeUndefined();
      expect(oxlintConfig).toContain("{ vitest }");
      expect(oxlintConfig).toContain("extends: [generic, vitest]");
      expect(oxlintConfig).toContain("oxc-project/oxc#24337");
      expect(oxlintConfig).toContain("settings: generic.settings");
      expect(oxlintConfig).not.toContain("<%");
      await expectJsonFileFormatted(path.join(projectDir, "package.json"));
      await expectJsonFileFormatted(path.join(projectDir, ".vscode/settings.json"));
      await expectJsonFileFormatted(path.join(projectDir, ".vscode/extensions.json"));
      await expectPathExists(path.join(projectDir, "vitest.config.ts"));
      await expectPathMissing(path.join(projectDir, "stylelint.config.ts"));
      await expectGeneratedExample(projectDir, expectedName);
      expect(await readFile(path.join(projectDir, ".gitignore"), "utf8")).toContain("\ncoverage\n");
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
    const description = 'Template & "JSON" <text>.';
    const packageName = "@fixture/create-example";
    let passed = false;

    try {
      const fakeBinDir = await createFakePackageManagers(projectDir);
      const result = await runCommand(
        process.execPath,
        [
          cliPath,
          "create",
          "--yes",
          "--name",
          packageName,
          "--description",
          description,
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
        description?: string;
        exports?: string;
        name?: string;
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
      const settingsJson = await readJson<Record<string, unknown>>(
        path.join(projectDir, ".vscode/settings.json"),
      );
      const readme = await readFile(path.join(projectDir, "README.md"), "utf8");
      const zhReadme = await readFile(path.join(projectDir, "README.zh.md"), "utf8");

      expect(packageJson.description).toBe(description);
      expect(packageJson.name).toBe(packageName);
      expect(packageJson.exports).toBe("./src/index.ts");
      expect(packageJson.scripts?.prepare).toBeUndefined();
      expect(packageJson.scripts?.check).toBe("sm check");
      expect(packageJson.scripts?.["check:fix"]).toBe("sm check --fix");
      expect(packageJson.scripts?.test).toBe("vitest");
      expect(packageJson.devDependencies).toHaveProperty("@types/node");
      expect(packageJson.devDependencies).toHaveProperty("stylelint");
      expect(packageJson.devDependencies).toHaveProperty("vitest");
      expect(packageJson.devDependencies?.["@vitest/coverage-v8"]).toBe(
        packageJson.devDependencies?.vitest,
      );
      expect(packageJson.devEngines?.packageManager?.name).toBe("npm");
      expect(packageJson.engines?.node).toBe("^24");
      expect(stylelintConfig).toContain("@smallmains/dev/stylelint/css-modules.js");
      expect(oxlintConfig).toContain("{ nodejs, vitest }");
      expect(oxlintConfig).toContain("extends: [generic, nodejs, vitest]");
      expect(oxlintConfig).toContain("oxc-project/oxc#24337");
      expect(oxlintConfig).toContain("settings: generic.settings");
      expect(extensionsJson.recommendations).toEqual(
        expect.arrayContaining(["stylelint.vscode-stylelint", "vitest.explorer"]),
      );
      expect(settingsJson["[html][css][scss][less]"]).toBeDefined();
      expect(settingsJson["[vue]"]).toBeDefined();
      expect(settingsJson["stylelint.validate"]).toEqual(
        expect.arrayContaining(["css", "html", "vue", "markdown", "mdx"]),
      );
      expect(readme).toContain(description);
      expect(readme).not.toContain("&amp;");
      expect(readme).toContain("<span>English</span> |");
      expect(readme).toContain('<a href="./README.zh.md">简体中文</a>');
      expect(readme).not.toContain("English | [简体中文]");
      expect(zhReadme).toContain('<a href="./README.md">English</a> |');
      expect(zhReadme).toContain("<span>简体中文</span>");
      expect(zhReadme).not.toContain("[English](README.md) | 简体中文");
      expect(stylelintConfig).not.toContain("<%");
      expect(oxlintConfig).not.toContain("<%");
      await expectJsonFileFormatted(path.join(projectDir, "package.json"));
      await expectJsonFileFormatted(path.join(projectDir, ".vscode/settings.json"));
      await expectJsonFileFormatted(path.join(projectDir, ".vscode/extensions.json"));
      await expectPathExists(path.join(projectDir, "stylelint.config.ts"));
      await expectPathExists(path.join(projectDir, "vitest.config.ts"));
      await expectGeneratedExample(projectDir, packageName);
      await expectFileContent(installLogPath, "npm install\n");

      passed = true;
    } finally {
      await cleanupProjectDir(projectDir, passed);
    }
  },
  testTimeoutMs,
);

test("uses the .ejs extension for every create template", async () => {
  const templateFiles = await collectFiles(path.join(repoRoot, "templates"));
  const unexpectedFiles = templateFiles
    .filter(filePath => !filePath.endsWith(".ejs"))
    .map(filePath => path.relative(repoRoot, filePath));

  expect(templateFiles.length).toBeGreaterThan(0);
  expect(unexpectedFiles).toEqual([]);
});

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

async function expectJsonFileFormatted(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");

  expect(content).not.toContain("<%");
  expect(content).toBe(`${JSON.stringify(JSON.parse(content), null, 2)}\n`);
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(dir, entry.name);

      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
    }),
  );

  return files.flat();
}

async function expectFileContent(filePath: string, expectedContent: string): Promise<void> {
  await expect(readFile(filePath, "utf8")).resolves.toBe(expectedContent);
}

async function expectGeneratedExample(projectDir: string, packageName: string): Promise<void> {
  await Promise.all([
    expectFileContent(path.join(projectDir, "src/index.ts"), expectedSourceContent),
    expectFileContent(path.join(projectDir, "src/index.test.ts"), expectedUnitTestContent),
    expectFileContent(
      path.join(projectDir, "tests/index.test.ts"),
      `import { expect, test } from "vitest";
import { value } from ${JSON.stringify(packageName)};

test("exposes a useful value from the package", () => {
  expect(value).toBe("hello world.");
});
`,
    ),
  ]);
}

async function writeExistingExampleFiles(projectDir: string): Promise<void> {
  await Promise.all([
    mkdir(path.join(projectDir, "src"), { recursive: true }),
    mkdir(path.join(projectDir, "tests"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(projectDir, "src/index.ts"), "existing source\n"),
    writeFile(path.join(projectDir, "src/index.test.ts"), "existing unit test\n"),
    writeFile(path.join(projectDir, "tests/index.test.ts"), "existing integration test\n"),
  ]);
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
