import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  type CommandResult,
  formatCommandFailure,
  repoRoot,
  runSm,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

interface CheckFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
  path: typeof fixturePaths;
}

interface InstalledToolFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
  installed: boolean;
  sourcePath: string;
}

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
const symlinkDirType = process.platform === "win32" ? "junction" : "dir";
const fixturePaths = {
  badCss: "styles/bad.css",
  badFormat: "src/bad-format.ts",
  badTs: "src/bad.ts",
  goodCss: "styles/good.css",
  goodFormat: "src/good-format.ts",
  goodTs: "src/good.ts",
  ignoredText: "notes/ignored.txt",
} as const;

test(
  "check help exposes the new command tree",
  async () => {
    const result = await runSm(["check", "--help"], { cwd: repoRoot });

    expect(result, formatCommandFailure("sm check --help", result)).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expect(result.stdout).toContain("--no-lint");
    expect(result.stdout).toContain("--no-format");
    expect(result.stdout).toContain("--fix");
    expect(result.stdout).toContain("lint [options] [files...]");
    expect(result.stdout).toContain("format [options] [files...]");
    expect(result.stdout).toContain("commit-message [options] [file]");
    expect(result.stdout).not.toContain("--commit-message");
  },
  testTimeoutMs,
);

test(
  "check succeeds when all configured tools pass",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const result = await runSm(["check"], { cwd: fixture.cwd, env: fixture.env });

      expect(result, formatCommandFailure("sm check", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check runs installed Oxfmt with its default configuration",
  async () => {
    const originalSource = "export const values=[1,2,3]\n";

    await withInstalledToolToggle("oxfmt", "value.ts", originalSource, async fixture => {
      const result = await runSm(["check", "format", "--fix"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(result, formatCommandFailure("sm check format --fix", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      await expect(readFile(fixture.sourcePath, "utf8")).resolves.toBe(
        fixture.installed ? "export const values = [1, 2, 3];\n" : originalSource,
      );
    });
  },
  testTimeoutMs,
);

test(
  "check runs installed Oxlint with its default configuration",
  async () => {
    await withInstalledToolToggle(
      "oxlint",
      "invalid.ts",
      "export const value = ;\n",
      async fixture => {
        const result = await runSm(["check", "lint", "invalid.ts"], {
          cwd: fixture.cwd,
          env: fixture.env,
        });

        if (fixture.installed) {
          expectCommandFailed("sm check lint invalid.ts", result);
        } else {
          expect(result, formatCommandFailure("sm check lint invalid.ts", result)).toMatchObject({
            exitCode: 0,
            timedOut: false,
          });
        }
      },
    );
  },
  testTimeoutMs,
);

test(
  "check runs installed Stylelint with its default configuration",
  async () => {
    await withInstalledToolToggle("stylelint", "invalid.css", ".invalid {\n", async fixture => {
      const result = await runSm(["check", "lint", "invalid.css"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      if (fixture.installed) {
        expectCommandFailed("sm check lint invalid.css", result);
      } else {
        expect(result, formatCommandFailure("sm check lint invalid.css", result)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });
      }
    });
  },
  testTimeoutMs,
);

test(
  "check skips resolvable tools that are not declared by the project",
  async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "sm-check-undeclared-e2e-"));
    const sources = {
      "bad-format.ts": "export const values=[1,2,3]\n",
      "invalid.css": ".invalid {\n",
      "invalid.ts": "export const value = ;\n",
    };
    let passed = false;

    try {
      await mkdir(path.join(cwd, "node_modules"));
      await Promise.all([
        ...["oxfmt", "oxlint", "stylelint"].map(packageName =>
          symlink(
            path.join(repoRoot, "node_modules", packageName),
            path.join(cwd, "node_modules", packageName),
            symlinkDirType,
          ),
        ),
        writeFile(path.join(cwd, "package.json"), '{"type":"module"}\n'),
        ...Object.entries(sources).map(([file, content]) =>
          writeFile(path.join(cwd, file), content),
        ),
      ]);

      const result = await runSm(["check", "--fix", ...Object.keys(sources)], {
        cwd,
        env: createRealToolEnv(),
      });

      expect(
        result,
        formatCommandFailure("sm check --fix with undeclared tools", result),
      ).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      await Promise.all(
        Object.entries(sources).map(async ([file, content]) => {
          await expect(readFile(path.join(cwd, file), "utf8")).resolves.toBe(content);
        }),
      );
      passed = true;
    } finally {
      await cleanupFixture(cwd, passed);
    }
  },
  testTimeoutMs,
);

test(
  "check reports Oxlint failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: true }, async fixture => {
      const result = await runSm(["check", "--no-format"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check --no-format", result);
    });
  },
  testTimeoutMs,
);

test(
  "check reports Stylelint failures",
  async () => {
    await withCheckFixture({ badCss: true, badFormat: false, badTs: false }, async fixture => {
      const result = await runSm(["check", "--no-format"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check --no-format", result);
    });
  },
  testTimeoutMs,
);

test(
  "check respects Stylelint ignoreFiles for discovered and explicit files",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const ignoredCss = "dist/invalid.css";

      await mkdir(path.dirname(path.join(fixture.cwd, ignoredCss)), { recursive: true });
      await Promise.all([
        writeFile(path.join(fixture.cwd, ignoredCss), createBadCss()),
        writeFile(
          path.join(fixture.cwd, "stylelint.config.ts"),
          createStylelintConfig(["**/dist/**"]),
        ),
      ]);

      const discoveredResult = await runSm(["check", "lint"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const explicitResult = await runSm(["check", "lint", ignoredCss], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(
        discoveredResult,
        formatCommandFailure("sm check lint", discoveredResult),
      ).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(
        explicitResult,
        formatCommandFailure(`sm check lint ${ignoredCss}`, explicitResult),
      ).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check lint includes EJS files by default and when explicitly provided",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const ejsPath = "views/bad.ejs";

      await mkdir(path.dirname(path.join(fixture.cwd, ejsPath)), { recursive: true });
      await writeFile(path.join(fixture.cwd, ejsPath), createBadCss());

      const defaultResult = await runSm(["check", "lint"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const explicitResult = await runSm(["check", "lint", ejsPath], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expectCommandFailed("sm check lint", defaultResult);
      expectCommandFailed(`sm check lint ${ejsPath}`, explicitResult);
    });
  },
  testTimeoutMs,
);

test(
  "check reports Oxfmt failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: true, badTs: false }, async fixture => {
      const result = await runSm(["check", "--no-lint"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check --no-lint", result);
    });
  },
  testTimeoutMs,
);

test(
  "check --fix repairs Oxfmt failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: true, badTs: false }, async fixture => {
      const beforeFix = await readFixtureFile(fixture, fixture.path.badFormat);
      const fixResult = await runSm(["check", "--fix", "--no-lint"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const afterFix = await readFixtureFile(fixture, fixture.path.badFormat);
      const checkResult = await runSm(["check", "--no-lint"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(fixResult, formatCommandFailure("sm check --fix --no-lint", fixResult)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(afterFix).not.toBe(beforeFix);
      expect(checkResult, formatCommandFailure("sm check --no-lint", checkResult)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check lint succeeds when Oxlint and Stylelint pass",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: true, badTs: false }, async fixture => {
      const result = await runSm(["check", "lint"], { cwd: fixture.cwd, env: fixture.env });

      expect(result, formatCommandFailure("sm check lint", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check lint help exposes lint-only options",
  async () => {
    const result = await runSm(["check", "lint", "--help"], { cwd: repoRoot });

    expect(result, formatCommandFailure("sm check lint --help", result)).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expect(result.stdout).toContain("Usage: sm check lint [options] [files...]");
    expect(result.stdout).toContain("--fix");
    expect(result.stdout).not.toContain("--no-lint");
    expect(result.stdout).not.toContain("--no-format");
  },
  testTimeoutMs,
);

test(
  "check lint reports Oxlint failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: true }, async fixture => {
      const result = await runSm(["check", "lint"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check lint", result);
    });
  },
  testTimeoutMs,
);

test(
  "check lint reports Stylelint failures",
  async () => {
    await withCheckFixture({ badCss: true, badFormat: false, badTs: false }, async fixture => {
      const result = await runSm(["check", "lint"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check lint", result);
    });
  },
  testTimeoutMs,
);

test(
  "check lint filters files per linter",
  async () => {
    await withCheckFixture({ badCss: true, badFormat: false, badTs: true }, async fixture => {
      const tsOnlyResult = await runSm(["check", "lint", fixture.path.goodTs], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const cssOnlyResult = await runSm(["check", "lint", fixture.path.goodCss], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(
        tsOnlyResult,
        formatCommandFailure("sm check lint goodTs", tsOnlyResult),
      ).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(
        cssOnlyResult,
        formatCommandFailure("sm check lint goodCss", cssOnlyResult),
      ).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check format succeeds when Oxfmt passes",
  async () => {
    await withCheckFixture({ badCss: true, badFormat: false, badTs: true }, async fixture => {
      const result = await runSm(["check", "format"], { cwd: fixture.cwd, env: fixture.env });

      expect(result, formatCommandFailure("sm check format", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check format help exposes format-only options",
  async () => {
    const result = await runSm(["check", "format", "--help"], { cwd: repoRoot });

    expect(result, formatCommandFailure("sm check format --help", result)).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expect(result.stdout).toContain("Usage: sm check format [options] [files...]");
    expect(result.stdout).toContain("--fix");
    expect(result.stdout).not.toContain("--no-lint");
    expect(result.stdout).not.toContain("--no-format");
  },
  testTimeoutMs,
);

test(
  "check format reports Oxfmt failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: true, badTs: false }, async fixture => {
      const result = await runSm(["check", "format"], { cwd: fixture.cwd, env: fixture.env });

      expectCommandFailed("sm check format", result);
    });
  },
  testTimeoutMs,
);

test(
  "check format --fix repairs Oxfmt failures",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: true, badTs: false }, async fixture => {
      const beforeFix = await readFixtureFile(fixture, fixture.path.badFormat);
      const fixResult = await runSm(["check", "format", "--fix"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const afterFix = await readFixtureFile(fixture, fixture.path.badFormat);
      const checkResult = await runSm(["check", "format"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(fixResult, formatCommandFailure("sm check format --fix", fixResult)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(afterFix).not.toBe(beforeFix);
      expect(checkResult, formatCommandFailure("sm check format", checkResult)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check commit-message validates text",
  async () => {
    const validResult = await runSm(
      ["check", "commit-message", "--text", "feat: add check command"],
      { cwd: repoRoot },
    );
    const invalidResult = await runSm(["check", "commit-message", "--text", "bad"], {
      cwd: repoRoot,
    });

    expect(
      validResult,
      formatCommandFailure("sm check commit-message valid", validResult),
    ).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expectCommandFailed("sm check commit-message invalid", invalidResult);
    expect(invalidResult.stderr).toContain("commit-message error:");
  },
  testTimeoutMs,
);

test(
  "check commit-message validates files",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const messagePath = path.join(fixture.cwd, "message.txt");

      await writeFile(messagePath, "fix: repair check command\n");
      const result = await runSm(["check", "commit-message", messagePath], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(result, formatCommandFailure("sm check commit-message file", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "check commit-message finds the default Git commit message file",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const childDir = path.join(fixture.cwd, "packages/app");

      await mkdir(path.join(fixture.cwd, ".git"), { recursive: true });
      await mkdir(childDir, { recursive: true });
      await writeFile(path.join(fixture.cwd, ".git/COMMIT_EDITMSG"), "chore: update checks\n");
      const result = await runSm(["check", "commit-message"], {
        cwd: childDir,
        env: fixture.env,
      });

      expect(result, formatCommandFailure("sm check commit-message default", result)).toMatchObject(
        {
          exitCode: 0,
          timedOut: false,
        },
      );
    });
  },
  testTimeoutMs,
);

test(
  "check commit-message rejects file and text together",
  async () => {
    await withCheckFixture({ badCss: false, badFormat: false, badTs: false }, async fixture => {
      const messagePath = path.join(fixture.cwd, "message.txt");

      await writeFile(messagePath, "fix: repair check command\n");
      const result = await runSm(
        ["check", "commit-message", messagePath, "--text", "fix: repair check command"],
        {
          cwd: fixture.cwd,
          env: fixture.env,
        },
      );

      expectCommandFailed("sm check commit-message file and text", result);
      expect(result.stderr).toContain("Pass either a commit message file or --text, not both.");
    });
  },
  testTimeoutMs,
);

test(
  "legacy lint command is not registered",
  async () => {
    const result = await runSm(["--help"], { cwd: repoRoot });

    expect(result, formatCommandFailure("sm --help", result)).toMatchObject({
      exitCode: 0,
      timedOut: false,
    });
    expect(result.stdout).not.toContain("lint [options]");
    expect(result.stdout).not.toContain("Run project lint tools.");
  },
  testTimeoutMs,
);

async function withInstalledToolToggle(
  packageName: "oxfmt" | "oxlint" | "stylelint",
  sourceName: string,
  sourceContent: string,
  run: (fixture: InstalledToolFixture) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-check-installed-e2e-"));
  const env = createRealToolEnv();
  const sourcePath = path.join(cwd, sourceName);
  let passed = false;

  try {
    await writeFile(
      path.join(cwd, "package.json"),
      `${JSON.stringify({ type: "module", devDependencies: { [packageName]: "*" } })}\n`,
    );
    await writeFile(sourcePath, sourceContent);
    await run({ cwd, env, installed: false, sourcePath });

    await mkdir(path.join(cwd, "node_modules"));
    await symlink(
      path.join(repoRoot, "node_modules", packageName),
      path.join(cwd, "node_modules", packageName),
      symlinkDirType,
    );
    await run({ cwd, env, installed: true, sourcePath });
    passed = true;
  } finally {
    await cleanupFixture(cwd, passed);
  }
}

async function withCheckFixture(
  options: { badCss: boolean; badFormat: boolean; badTs: boolean },
  run: (fixture: CheckFixture) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-check-e2e-"));
  const fixture: CheckFixture = {
    cwd,
    env: createRealToolEnv(),
    path: fixturePaths,
  };
  let passed = false;

  try {
    await mkdir(path.join(cwd, "node_modules"));
    await Promise.all(
      ["oxfmt", "oxlint", "stylelint"].map(packageName =>
        symlink(
          path.join(repoRoot, "node_modules", packageName),
          path.join(cwd, "node_modules", packageName),
          symlinkDirType,
        ),
      ),
    );
    await writeCheckFixture(fixture, options);
    await run(fixture);
    passed = true;
  } finally {
    await cleanupFixture(cwd, passed);
  }
}

async function writeCheckFixture(
  fixture: CheckFixture,
  options: { badCss: boolean; badFormat: boolean; badTs: boolean },
): Promise<void> {
  await mkdir(path.join(fixture.cwd, "src"), { recursive: true });
  await mkdir(path.join(fixture.cwd, "styles"), { recursive: true });
  await mkdir(path.join(fixture.cwd, "notes"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(fixture.cwd, "package.json"),
      `${JSON.stringify(
        {
          type: "module",
          devDependencies: {
            oxfmt: "*",
            oxlint: "*",
            stylelint: "*",
          },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(path.join(fixture.cwd, ".gitignore"), "node_modules\n"),
    writeFile(path.join(fixture.cwd, ".oxlintrc.json"), createOxlintConfig()),
    writeFile(path.join(fixture.cwd, "stylelint.config.ts"), createStylelintConfig()),
    writeFile(path.join(fixture.cwd, ".oxfmtrc.json"), createOxfmtConfig()),
    writeFile(path.join(fixture.cwd, fixture.path.goodTs), createGoodTypeScript()),
    writeFile(
      path.join(fixture.cwd, fixture.path.badTs),
      options.badTs ? createBadTypeScript() : createGoodTypeScript(),
    ),
    writeFile(path.join(fixture.cwd, fixture.path.goodCss), createGoodCss()),
    writeFile(
      path.join(fixture.cwd, fixture.path.badCss),
      options.badCss ? createBadCss() : createGoodCss(),
    ),
    writeFile(path.join(fixture.cwd, fixture.path.goodFormat), createGoodFormattedTypeScript()),
    writeFile(
      path.join(fixture.cwd, fixture.path.badFormat),
      options.badFormat ? createBadFormattedTypeScript() : createGoodFormattedTypeScript(),
    ),
    writeFile(
      path.join(fixture.cwd, fixture.path.ignoredText),
      "this file is intentionally ignored\n",
    ),
  ]);
}

function createRealToolEnv(): NodeJS.ProcessEnv {
  return {
    [pathEnvKey]: [path.join(repoRoot, "node_modules/.bin"), process.env[pathEnvKey] ?? ""]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function createOxlintConfig(): string {
  return `${JSON.stringify(
    {
      rules: {
        "no-unused-vars": "error",
      },
    },
    null,
    2,
  )}\n`;
}

function createStylelintConfig(ignoreFiles?: string[]): string {
  return [
    "export default {",
    ...(ignoreFiles ? [`  ignoreFiles: ${JSON.stringify(ignoreFiles)},`] : []),
    "  rules: {",
    '    "color-no-invalid-hex": true,',
    "  },",
    "};",
    "",
  ].join("\n");
}

function createOxfmtConfig(): string {
  return `${JSON.stringify(
    {
      arrowParens: "avoid",
    },
    null,
    2,
  )}\n`;
}

function createGoodTypeScript(): string {
  return [
    "const usedValue = 1;",
    "",
    "export function readUsedValue(): number {",
    "  return usedValue;",
    "}",
    "",
  ].join("\n");
}

function createBadTypeScript(): string {
  return ["const unusedValue = 1;", "", "export const usedValue = 2;", ""].join("\n");
}

function createGoodCss(): string {
  return [".valid {", "  color: #ffffff;", "}", ""].join("\n");
}

function createBadCss(): string {
  return [".invalid {", "  color: #fffffg;", "}", ""].join("\n");
}

function createGoodFormattedTypeScript(): string {
  return [
    "export const numbers = [1, 2, 3];",
    "",
    "export const doubledNumbers = numbers.map(number => number * 2);",
    "",
  ].join("\n");
}

function createBadFormattedTypeScript(): string {
  return "export const numbers=[1,2,3]\nexport const doubledNumbers=numbers.map((number)=>number*2)\n";
}

async function readFixtureFile(fixture: CheckFixture, filePath: string): Promise<string> {
  return readFile(path.join(fixture.cwd, filePath), "utf8");
}

function expectCommandFailed(command: string, result: CommandResult): void {
  const context = formatCommandFailure(command, result);

  expect(result.timedOut, context).toBe(false);
  expect(result.exitCode, context).not.toBe(0);
}

async function cleanupFixture(cwd: string, passed: boolean): Promise<void> {
  if (!passed || process.env.KEEP_TEST_TEMP === "1") {
    console.info(`Kept check e2e temp directory: ${cwd}`);
    return;
  }

  await rm(cwd, { force: true, recursive: true });
}
