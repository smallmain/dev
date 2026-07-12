import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { distDir, runOxlint, testTimeoutMs } from "./cli-e2e-utils.ts";

const pluginPath = path.join(distDir, "oxlint/plugins/consistent-esm-default-name.js");

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
      'import badReExport from "./re-export";',
      'import badIndex from "./components/Button/index";',
      'import badDir from ".";',
      'import badSubpath from "lodash/merge";',
      "console.log(badStyled, badFooBar, badUi, badScopedButton, badKebab, badAnon, badReExport, badIndex, badDir, badSubpath);",
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

      expect(run.exitCode).not.toBe(0);
      expect(run.stdout, "package default export declaration should win").toContain("styled");
      expect(run.stdout, "anonymous package default should fall back to package name").toContain(
        "fooBar",
      );
      expect(run.stdout, "scoped package default export declaration should win").toContain("UI");
      expect(run.stdout, "package subpath default export declaration should win").toContain(
        "Button",
      );
      expect(run.stdout, "relative import should use target default export declaration").toContain(
        "UserService",
      );
      expect(
        run.stdout,
        "anonymous relative default should fall back to module specifier",
      ).toContain("anonymousDefault");
      expect(run.stdout, "default re-export should follow target module").toContain("targetName");
      expect(run.stdout, "directory import should use target package name").toContain(
        "sourcePackage",
      );
      expect(run.stdout, "package subpath should be checked").toContain("merge");
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

      expect(run.exitCode).not.toBe(0);
      expect(run.stdout, "target default export should win over template").toContain("Wrong");
      expect(run.stdout, "target default export should win over suffix template").toContain(
        "wrongName",
      );
      expect(run.stdout, "fixed name template should be applied").toContain("fixedName");
      expect(run.stdout, "prefix should be applied").toContain("useCounter");
      expect(run.stdout, "custom ignored virtual specifier should be ignored").not.toContain(
        "virtual:routes",
      );
      expect(run.stdout, "custom ignored raw specifier should be ignored").not.toContain(
        "README.md?raw",
      );
      expect(run.stdout, "custom ignored target path should be ignored").not.toContain(
        "generated/client",
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

      expect(run.exitCode).not.toBe(0);
      expect(run.stdout, "export template suffix should be applied").toContain(
        "UserServiceService",
      );
      expect(run.stdout, "index export should expect parent directory").toContain("Button");
      expect(run.stdout, "anonymous and call expression exports should be ignored").not.toContain(
        "anonymous.ts",
      );
      expect(run.stdout, "call expression exports should be ignored").not.toContain(
        "call-expression.ts",
      );
      expect(run.stdout, "custom ignored export path should be ignored").not.toContain(
        "generated/client.ts",
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

      expect(fixRun.exitCode, "safe fixer should fix all issues").toBe(0);
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

      expect(fixFallbackRun.exitCode, "fallback safe fixer should fix all issues").toBe(0);
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

      expect(
        unsafeRun.exitCode,
        "unsafe fixer should keep reporting when a name conflicts",
      ).not.toBe(0);
      const fixedUnsafe = await readFile(path.join(cwd, "src/fix-unsafe.ts"), "utf8");
      expect(fixedUnsafe, "unsafe fixer should not rename conflicting binding").toContain(
        "import wrong",
      );
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

      expect(warmRun.exitCode, "cache warm fixture should pass before target changes").toBe(0);

      await writeFixture(cwd, "src/cache-target.ts", "export default function Beta() {}\n");

      const invalidationRun = await runOxlint({
        configPath: "default.config.json",
        cwd,
        targets: ["src/cache-import.ts"],
      });

      expect(
        invalidationRun.exitCode,
        "target source changes should invalidate parsed module cache",
      ).not.toBe(0);
      expect(
        invalidationRun.stdout,
        "cache invalidation should report the new default export name",
      ).toContain("Beta");
    });
  },
  testTimeoutMs,
);
