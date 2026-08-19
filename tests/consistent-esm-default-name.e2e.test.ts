import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import {
  type CommandResult,
  distDir,
  formatCommandFailure,
  type OxlintJsonReport,
  parseOxlintReport,
  runOxlint,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const pluginPath = path.join(distDir, "oxlint/plugins/consistent-esm-default-name.js");
const importRuleCode = "consistent-esm-default-name(default-import-name)";
const exportRuleCode = "consistent-esm-default-name(default-export-name)";

interface PluginFixture {
  cwd: string;
}

async function withPluginFixture(run: (fixture: PluginFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-consistent-esm-e2e-"));
  let passed = false;

  try {
    await writeFixtures(cwd);
    await run({ cwd });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept consistent-esm e2e temp directory: ${cwd}`);
    } else {
      await rm(cwd, { force: true, recursive: true });
    }
  }
}

async function writeFixture(cwd: string, relativePath: string, contents: string): Promise<void> {
  const filePath = path.join(cwd, relativePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function writeConfig(
  cwd: string,
  relativePath: string,
  rules: Record<string, string>,
  settings?: Record<string, unknown>,
): Promise<void> {
  await writeFixture(
    cwd,
    relativePath,
    `${JSON.stringify(
      {
        jsPlugins: [pathToFileURL(pluginPath).href],
        ...(settings ? { settings } : {}),
        rules,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeFixtures(cwd: string): Promise<void> {
  await writeConfig(cwd, "default.config.json", {
    "consistent-esm-default-name/default-import-name": "error",
    "consistent-esm-default-name/default-export-name": "error",
  });
  await writeConfig(
    cwd,
    "custom.config.json",
    {
      "consistent-esm-default-name/default-import-name": "error",
      "consistent-esm-default-name/default-export-name": "error",
    },
    {
      "consistent-esm-default-name": {
        ignorePaths: ["src/generated/**"],
        ignoreSpecifiers: ["^virtual:", "\\?raw$"],
        template: [
          { format: "pascal", match: "\\.react\\.tsx$", strip: "\\.react$" },
          { format: "pascal", match: "\\.service\\.ts$", suffix: "Service" },
          { match: "\\.fixed\\.ts$", name: "fixedName" },
          { format: "pascal", match: "\\.prefix\\.ts$", prefix: "use", strip: "\\.prefix$" },
          { format: "camel", match: ".*" },
        ],
      },
    },
  );

  await writeFixture(cwd, "package.json", '{"name":"fixture-root"}\n');
  await writeFixture(cwd, "src/package.json", '{"name":"@demo/source-package"}\n');
  await writeFixture(
    cwd,
    "node_modules/styled-components/package.json",
    '{"name":"styled-components","types":"index.d.ts"}\n',
  );
  await writeFixture(
    cwd,
    "node_modules/styled-components/index.d.ts",
    "declare const styled: any;\nexport default styled;\n",
  );
  await writeFixture(
    cwd,
    "node_modules/foo-bar/package.json",
    '{"name":"foo-bar","exports":{".":{"types":"./index.d.ts","default":"./index.js"}},"types":"index.d.ts"}\n',
  );
  await writeFixture(cwd, "node_modules/foo-bar/index.d.ts", "export default {};\n");
  await writeFixture(
    cwd,
    "node_modules/@scope/ui/package.json",
    '{"name":"@scope/ui","exports":{".":"./index.d.ts","./button":"./button.d.ts"}}\n',
  );
  await writeFixture(
    cwd,
    "node_modules/@scope/ui/index.d.ts",
    "declare const UI: any;\nexport default UI;\n",
  );
  await writeFixture(cwd, "node_modules/@scope/ui/button.d.ts", "export default class Button {}\n");
  await writeFixture(cwd, "node_modules/lodash/package.json", '{"name":"lodash"}\n');
  await writeFixture(
    cwd,
    "node_modules/lodash/merge.d.ts",
    "declare function merge(): void;\nexport default merge;\n",
  );
  await writeFixture(
    cwd,
    "src/imports.tsx",
    [
      'import badStyled from "styled-components";',
      'import badFooBar from "foo-bar";',
      'import badUi from "@scope/ui";',
      'import badScopedButton from "@scope/ui/button";',
      'import badKebab from "./user-service";',
      'import badAnon from "./anonymous-default";',
      'import badLeadingDigit from "./123abc";',
      'import badReExport from "./re-export";',
      'import badIndex from "./components/Button/index";',
      'import badDir from ".";',
      'import badSubpath from "lodash/merge";',
      "console.log(badStyled, badFooBar, badUi, badScopedButton, badKebab, badAnon, badLeadingDigit, badReExport, badIndex, badDir, badSubpath);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/custom.ts",
    [
      'import ignoredVirtual from "virtual:routes";',
      'import ignoredRaw from "./README.md?raw";',
      'import ignoredGenerated from "./generated/client";',
      'import badReact from "./Button.react.tsx";',
      'import badService from "./user.service.ts";',
      'import badFixed from "./whatever.fixed.ts";',
      'import badPrefix from "./counter.prefix.ts";',
      "console.log(ignoredVirtual, ignoredRaw, ignoredGenerated, badReact, badService, badFixed, badPrefix);",
      "",
    ].join("\n"),
  );
  await writeFixture(cwd, "src/user-service.ts", "export default class UserService {}\n");
  await writeFixture(cwd, "src/anonymous-default.ts", "export default {};\n");
  await writeFixture(cwd, "src/123abc.ts", "export default {};\n");
  await writeFixture(cwd, "src/re-export.ts", 'export { default } from "./target";\n');
  await writeFixture(cwd, "src/target.ts", "export default function targetName() {}\n");
  await writeFixture(
    cwd,
    "src/generated/client.ts",
    "export default function wrongGenerated() {}\n",
  );
  await writeFixture(cwd, "src/user.service.ts", "export default class wrongName {}\n");
  await writeFixture(
    cwd,
    "src/components/Button/index.ts",
    "export default function wrongName() {}\n",
  );
  await writeFixture(cwd, "src/Button.react.tsx", "export default function Wrong() {}\n");
  await writeFixture(cwd, "src/anonymous.ts", "export default { ok: true };\n");
  await writeFixture(cwd, "src/call-expression.ts", "export default createStore();\n");
  await writeFixture(
    cwd,
    "src/fix-safe.ts",
    [
      'import wrong from "./user-service";',
      "const result = wrong + wrong;",
      "console.log(result);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/fix-unsafe.ts",
    [
      'import wrong from "./user-service";',
      "const UserService = 1;",
      "console.log(wrong, UserService);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/fix-fallback.ts",
    [
      'import wrong from "./anonymous-default";',
      "const result = wrong;",
      "console.log(result);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/cache-import.ts",
    'import Alpha from "./cache-target";\nconsole.log(Alpha);\n',
  );
  await writeFixture(cwd, "src/cache-target.ts", "export default function Alpha() {}\n");
  await writeFixture(
    cwd,
    "src/ExportClass.ts",
    [
      "export default class wrongClass {",
      "  static create(): wrongClass {",
      "    return new wrongClass();",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/export-function.ts",
    ["export default function wrongFunction(): unknown {", "  return wrongFunction;", "}", ""].join(
      "\n",
    ),
  );
  await writeFixture(
    cwd,
    "src/export-binding.ts",
    [
      "const wrongBinding = 1;",
      "console.log(wrongBinding);",
      "export default wrongBinding;",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/export-specifier.ts",
    [
      "const wrongSpecifier = 1;",
      "console.log(wrongSpecifier);",
      "export { wrongSpecifier as default };",
      "",
    ].join("\n"),
  );
  await writeFixture(
    cwd,
    "src/export-conflict.ts",
    [
      "const exportConflict = 1;",
      "const wrongConflict = 2;",
      "console.log(exportConflict, wrongConflict);",
      "export default wrongConflict;",
      "",
    ].join("\n"),
  );
}

test(
  "default import names resolve the target module or fall back to the specifier",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const run = await runOxlint({
        configPath: "default.config.json",
        cwd,
        targets: ["src/imports.tsx"],
      });

      const report = parseFailedOxlintReport(run);
      const expectedImports = [
        ["badStyled", "styled", "styled-components"],
        ["badFooBar", "fooBar", "foo-bar"],
        ["badUi", "UI", "@scope/ui"],
        ["badScopedButton", "Button", "@scope/ui/button"],
        ["badKebab", "UserService", "./user-service"],
        ["badAnon", "anonymousDefault", "./anonymous-default"],
        ["badLeadingDigit", "_123abc", "./123abc"],
        ["badReExport", "targetName", "./re-export"],
        ["badIndex", "wrongName", "./components/Button/index"],
        ["badDir", "sourcePackage", "."],
        ["badSubpath", "merge", "lodash/merge"],
      ];

      expectDiagnostics(
        report,
        importRuleCode,
        expectedImports.map(([actual, expected, specifier]) => ({
          filename: "src/imports.tsx",
          message: `Default import name '${actual}' should be '${expected}' for '${specifier}'.`,
        })),
      );
    });
  },
  testTimeoutMs,
);

test(
  "custom template settings, ignoreSpecifiers, and ignorePaths are honored",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const run = await runOxlint({
        configPath: "custom.config.json",
        cwd,
        targets: ["src/custom.ts"],
      });

      const report = parseFailedOxlintReport(run);
      const expectedImports = [
        ["badReact", "Wrong", "./Button.react.tsx"],
        ["badService", "wrongName", "./user.service.ts"],
        ["badFixed", "fixedName", "./whatever.fixed.ts"],
        ["badPrefix", "useCounter", "./counter.prefix.ts"],
      ];

      expectDiagnostics(
        report,
        importRuleCode,
        expectedImports.map(([actual, expected, specifier]) => ({
          filename: "src/custom.ts",
          message: `Default import name '${actual}' should be '${expected}' for '${specifier}'.`,
        })),
      );
    });
  },
  testTimeoutMs,
);

test(
  "named default exports must match the expected name and skip anonymous exports",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const run = await runOxlint({
        configPath: "custom.config.json",
        cwd,
        targets: [
          "src/user.service.ts",
          "src/components/Button/index.ts",
          "src/Button.react.tsx",
          "src/anonymous.ts",
          "src/call-expression.ts",
          "src/generated/client.ts",
        ],
      });

      const report = parseFailedOxlintReport(run);
      const expectedExports = [
        ["src/user.service.ts", "wrongName", "UserServiceService"],
        ["src/Button.react.tsx", "Wrong", "Button"],
        ["src/components/Button/index.ts", "wrongName", "button"],
      ];

      expect(report.number_of_files).toBe(6);
      expectDiagnostics(
        report,
        exportRuleCode,
        expectedExports.map(([filename, actual, expected]) => ({
          filename,
          message: `Default export name '${actual}' should be '${expected}' for this file.`,
        })),
      );
    });
  },
  testTimeoutMs,
);

test(
  "the fixer renames safe bindings and keeps reporting on conflicts",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const fixRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        fix: true,
        targets: ["src/fix-safe.ts"],
      });

      expectSuccessfulOxlintReport(fixRun);
      const fixedSafe = await readFile(path.join(cwd, "src/fix-safe.ts"), "utf8");
      expect(fixedSafe, "safe fixer should rename import binding").toContain("import UserService");
      expect(fixedSafe, "safe fixer should rename references").toContain(
        "UserService + UserService",
      );

      const fixFallbackRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        fix: true,
        targets: ["src/fix-fallback.ts"],
      });

      expectSuccessfulOxlintReport(fixFallbackRun);
      const fixedFallback = await readFile(path.join(cwd, "src/fix-fallback.ts"), "utf8");
      expect(fixedFallback, "fallback safe fixer should use TypeScript fallback name").toContain(
        "import anonymousDefault",
      );

      const unsafeRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        fix: true,
        targets: ["src/fix-unsafe.ts"],
      });

      const unsafeReport = parseFailedOxlintReport(unsafeRun);

      expectDiagnostics(unsafeReport, importRuleCode, [
        {
          filename: "src/fix-unsafe.ts",
          message: "Default import name 'wrong' should be 'UserService' for './user-service'.",
        },
      ]);
      const fixedUnsafe = await readFile(path.join(cwd, "src/fix-unsafe.ts"), "utf8");
      expect(fixedUnsafe, "unsafe fixer should not rename conflicting binding").toContain(
        "import wrong",
      );
    });
  },
  testTimeoutMs,
);

test(
  "the default export fixer renames declarations, bindings, and references safely",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const fixRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        fix: true,
        targets: [
          "src/ExportClass.ts",
          "src/export-function.ts",
          "src/export-binding.ts",
          "src/export-specifier.ts",
        ],
      });

      expectSuccessfulOxlintReport(fixRun);

      const fixedClass = await readFile(path.join(cwd, "src/ExportClass.ts"), "utf8");
      expect(fixedClass).toContain("export default class ExportClass");
      expect(fixedClass).toContain("static create(): ExportClass");
      expect(fixedClass).toContain("return new ExportClass()");

      const fixedFunction = await readFile(path.join(cwd, "src/export-function.ts"), "utf8");
      expect(fixedFunction).toContain("export default function exportFunction()");
      expect(fixedFunction).toContain("return exportFunction;");

      const fixedBinding = await readFile(path.join(cwd, "src/export-binding.ts"), "utf8");
      expect(fixedBinding).toContain("const exportBinding = 1;");
      expect(fixedBinding).toContain("console.log(exportBinding);");
      expect(fixedBinding).toContain("export default exportBinding;");

      const fixedSpecifier = await readFile(path.join(cwd, "src/export-specifier.ts"), "utf8");
      expect(fixedSpecifier).toContain("const exportSpecifier = 1;");
      expect(fixedSpecifier).toContain("console.log(exportSpecifier);");
      expect(fixedSpecifier).toContain("export { exportSpecifier as default };");

      const conflictRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        fix: true,
        targets: ["src/export-conflict.ts"],
      });

      const conflictReport = parseFailedOxlintReport(conflictRun);

      expect(conflictReport.diagnostics).toEqual([
        expect.objectContaining({
          code: exportRuleCode,
          filename: "src/export-conflict.ts",
          severity: "error",
        }),
      ]);
      const conflictedExport = await readFile(path.join(cwd, "src/export-conflict.ts"), "utf8");
      expect(conflictedExport).toContain("export default wrongConflict;");
    });
  },
  testTimeoutMs,
);

test(
  "target source changes invalidate the parsed module cache",
  async () => {
    await withPluginFixture(async ({ cwd }) => {
      const warmRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        targets: ["src/cache-import.ts"],
      });

      expectSuccessfulOxlintReport(warmRun);

      await writeFixture(cwd, "src/cache-target.ts", "export default function Beta() {}\n");

      const invalidationRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        targets: ["src/cache-import.ts"],
      });

      const report = parseFailedOxlintReport(invalidationRun);

      expectDiagnostics(report, importRuleCode, [
        {
          filename: "src/cache-import.ts",
          message: "Default import name 'Alpha' should be 'Beta' for './cache-target'.",
        },
      ]);
    });
  },
  testTimeoutMs,
);

function parseFailedOxlintReport(result: CommandResult): OxlintJsonReport {
  expect(result.timedOut, formatCommandFailure("oxlint --format json", result)).toBe(false);
  expect(result.exitCode, formatCommandFailure("oxlint --format json", result)).not.toBe(0);

  return parseOxlintReport(result);
}

function expectSuccessfulOxlintReport(result: CommandResult): void {
  expect(result, formatCommandFailure("oxlint --format json", result)).toMatchObject({
    exitCode: 0,
    timedOut: false,
  });
  expect(parseOxlintReport(result).diagnostics).toEqual([]);
}

function expectDiagnostics(
  report: OxlintJsonReport,
  code: string,
  expected: { filename: string; message: string }[],
): void {
  expect(report.diagnostics).toHaveLength(expected.length);
  expect(report.diagnostics).toEqual(
    expect.arrayContaining(
      expected.map(diagnostic =>
        expect.objectContaining({ ...diagnostic, code, severity: "error" }),
      ),
    ),
  );
}
