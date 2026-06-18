import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { outDir, rootDir } from "./build.js";

const oxlintBin = path.join(rootDir, "node_modules/.bin/oxlint");
const pluginPath = path.join(outDir, "oxlint/plugins/consistent-esm-default-name.js");
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "consistent-esm-default-name-"));

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("exit", code => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writeFixture(relativePath, contents) {
  const filePath = path.join(fixtureRoot, relativePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function writeConfig(relativePath, rules, settings) {
  await writeFixture(
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runOxlint(configPath, targetPath, fix = false) {
  const targetPaths = Array.isArray(targetPath) ? targetPath : [targetPath];

  return runCommand(
    oxlintBin,
    [
      "-c",
      configPath,
      "--disable-nested-config",
      "--format",
      "json",
      ...(fix ? ["--fix"] : []),
      ...targetPaths,
    ],
    fixtureRoot,
  );
}

try {
  await writeConfig("default.config.json", {
    "consistent-esm-default-name/default-import-name": "error",
    "consistent-esm-default-name/default-export-name": "error",
  });
  await writeConfig("custom.config.json", {
    "consistent-esm-default-name/default-import-name": "error",
    "consistent-esm-default-name/default-export-name": "error",
  }, {
    "consistent-esm-default-name": {
      ignorePaths: ["src/generated/**"],
      ignoreSpecifiers: ["^virtual:", "\\?raw$"],
      template: [
        { match: "\\.react\\.tsx$", strip: "\\.react$", format: "pascal" },
        { match: "\\.service\\.ts$", format: "pascal", suffix: "Service" },
        { match: "\\.fixed\\.ts$", name: "fixedName" },
        { match: "\\.prefix\\.ts$", strip: "\\.prefix$", format: "pascal", prefix: "use" },
        { match: ".*", format: "camel" },
      ],
    },
  });

  await writeFixture("package.json", "{\"name\":\"fixture-root\"}\n");
  await writeFixture("src/package.json", "{\"name\":\"@demo/source-package\"}\n");
  await writeFixture(
    "node_modules/styled-components/package.json",
    "{\"name\":\"styled-components\",\"types\":\"index.d.ts\"}\n",
  );
  await writeFixture("node_modules/styled-components/index.d.ts", "declare const styled: any;\nexport default styled;\n");
  await writeFixture(
    "node_modules/foo-bar/package.json",
    "{\"name\":\"foo-bar\",\"exports\":{\".\":{\"types\":\"./index.d.ts\",\"default\":\"./index.js\"}},\"types\":\"index.d.ts\"}\n",
  );
  await writeFixture("node_modules/foo-bar/index.d.ts", "export default {};\n");
  await writeFixture(
    "node_modules/@scope/ui/package.json",
    "{\"name\":\"@scope/ui\",\"exports\":{\".\":\"./index.d.ts\",\"./button\":\"./button.d.ts\"}}\n",
  );
  await writeFixture("node_modules/@scope/ui/index.d.ts", "declare const UI: any;\nexport default UI;\n");
  await writeFixture("node_modules/@scope/ui/button.d.ts", "export default class Button {}\n");
  await writeFixture(
    "node_modules/lodash/package.json",
    "{\"name\":\"lodash\"}\n",
  );
  await writeFixture("node_modules/lodash/merge.d.ts", "declare function merge(): void;\nexport default merge;\n");
  await writeFixture(
    "src/imports.tsx",
    [
      "import badStyled from \"styled-components\";",
      "import badFooBar from \"foo-bar\";",
      "import badUi from \"@scope/ui\";",
      "import badScopedButton from \"@scope/ui/button\";",
      "import badKebab from \"./user-service\";",
      "import badAnon from \"./anonymous-default\";",
      "import badReExport from \"./re-export\";",
      "import badIndex from \"./components/Button/index\";",
      "import badDir from \".\";",
      "import badSubpath from \"lodash/merge\";",
      "console.log(badStyled, badFooBar, badUi, badScopedButton, badKebab, badAnon, badReExport, badIndex, badDir, badSubpath);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    "src/custom.ts",
    [
      "import ignoredVirtual from \"virtual:routes\";",
      "import ignoredRaw from \"./README.md?raw\";",
      "import ignoredGenerated from \"./generated/client\";",
      "import badReact from \"./Button.react.tsx\";",
      "import badService from \"./user.service.ts\";",
      "import badFixed from \"./whatever.fixed.ts\";",
      "import badPrefix from \"./counter.prefix.ts\";",
      "console.log(ignoredVirtual, ignoredRaw, ignoredGenerated, badReact, badService, badFixed, badPrefix);",
      "",
    ].join("\n"),
  );
  await writeFixture("src/user-service.ts", "export default class UserService {}\n");
  await writeFixture("src/anonymous-default.ts", "export default {};\n");
  await writeFixture("src/re-export.ts", "export { default } from \"./target\";\n");
  await writeFixture("src/target.ts", "export default function targetName() {}\n");
  await writeFixture("src/generated/client.ts", "export default function wrongGenerated() {}\n");
  await writeFixture("src/user.service.ts", "export default class wrongName {}\n");
  await writeFixture("src/components/Button/index.ts", "export default function wrongName() {}\n");
  await writeFixture("src/Button.react.tsx", "export default function Wrong() {}\n");
  await writeFixture("src/anonymous.ts", "export default { ok: true };\n");
  await writeFixture("src/call-expression.ts", "export default createStore();\n");
  await writeFixture(
    "src/fix-safe.ts",
    [
      "import wrong from \"./user-service\";",
      "const result = wrong + wrong;",
      "console.log(result);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    "src/fix-unsafe.ts",
    [
      "import wrong from \"./user-service\";",
      "const UserService = 1;",
      "console.log(wrong, UserService);",
      "",
    ].join("\n"),
  );
  await writeFixture(
    "src/fix-fallback.ts",
    [
      "import wrong from \"./anonymous-default\";",
      "const result = wrong;",
      "console.log(result);",
      "",
    ].join("\n"),
  );

  const defaultRun = await runOxlint("default.config.json", "src/imports.tsx");
  assert(defaultRun.code !== 0, "default fixture should report lint errors");
  assert(defaultRun.stdout.includes("styled"), "package default export declaration should win");
  assert(defaultRun.stdout.includes("fooBar"), "anonymous package default should fall back to package name");
  assert(defaultRun.stdout.includes("UI"), "scoped package default export declaration should win");
  assert(defaultRun.stdout.includes("Button"), "package subpath default export declaration should win");
  assert(defaultRun.stdout.includes("UserService"), "relative import should use target default export declaration");
  assert(defaultRun.stdout.includes("anonymousDefault"), "anonymous relative default should fall back to module specifier");
  assert(defaultRun.stdout.includes("targetName"), "default re-export should follow target module");
  assert(defaultRun.stdout.includes("sourcePackage"), "directory import should use target package name");
  assert(defaultRun.stdout.includes("merge"), "package subpath should be checked");

  const customRun = await runOxlint("custom.config.json", "src/custom.ts");
  assert(customRun.code !== 0, "custom fixture should report lint errors");
  assert(customRun.stdout.includes("Wrong"), "target default export should win over template");
  assert(customRun.stdout.includes("wrongName"), "target default export should win over suffix template");
  assert(customRun.stdout.includes("fixedName"), "fixed name template should be applied");
  assert(customRun.stdout.includes("useCounter"), "prefix should be applied");
  assert(!customRun.stdout.includes("virtual:routes"), "custom ignored virtual specifier should be ignored");
  assert(!customRun.stdout.includes("README.md?raw"), "custom ignored raw specifier should be ignored");
  assert(!customRun.stdout.includes("generated/client"), "custom ignored target path should be ignored");

  const exportRun = await runOxlint(
    "custom.config.json",
    [
      "src/user.service.ts",
      "src/components/Button/index.ts",
      "src/Button.react.tsx",
      "src/anonymous.ts",
      "src/call-expression.ts",
      "src/generated/client.ts",
    ],
  );
  assert(exportRun.code !== 0, "export fixture should report named default export mismatches");
  assert(exportRun.stdout.includes("UserServiceService"), "export template suffix should be applied");
  assert(exportRun.stdout.includes("Button"), "index export should expect parent directory");
  assert(!exportRun.stdout.includes("anonymous.ts"), "anonymous and call expression exports should be ignored");
  assert(!exportRun.stdout.includes("call-expression.ts"), "call expression exports should be ignored");
  assert(!exportRun.stdout.includes("generated/client.ts"), "custom ignored export path should be ignored");

  const fixRun = await runOxlint("default.config.json", "src/fix-safe.ts", true);
  assert(fixRun.code === 0, "safe fixer should fix all issues");
  const fixedSafe = await readFile(path.join(fixtureRoot, "src/fix-safe.ts"), "utf8");
  assert(fixedSafe.includes("import UserService"), "safe fixer should rename import binding");
  assert(fixedSafe.includes("UserService + UserService"), "safe fixer should rename references");

  const fixFallbackRun = await runOxlint("default.config.json", "src/fix-fallback.ts", true);
  assert(fixFallbackRun.code === 0, "fallback safe fixer should fix all issues");
  const fixedFallback = await readFile(path.join(fixtureRoot, "src/fix-fallback.ts"), "utf8");
  assert(fixedFallback.includes("import anonymousDefault"), "fallback safe fixer should use TypeScript fallback name");

  const unsafeRun = await runOxlint("default.config.json", "src/fix-unsafe.ts", true);
  assert(unsafeRun.code !== 0, "unsafe fixer should keep reporting when a name conflicts");
  const fixedUnsafe = await readFile(path.join(fixtureRoot, "src/fix-unsafe.ts"), "utf8");
  assert(fixedUnsafe.includes("import wrong"), "unsafe fixer should not rename conflicting binding");

  await writeFixture("src/cache-import.ts", "import Alpha from \"./cache-target\";\nconsole.log(Alpha);\n");
  await writeFixture("src/cache-target.ts", "export default function Alpha() {}\n");
  const cacheWarmRun = await runOxlint("default.config.json", "src/cache-import.ts");
  assert(cacheWarmRun.code === 0, "cache warm fixture should pass before target changes");
  await writeFixture("src/cache-target.ts", "export default function Beta() {}\n");
  const cacheInvalidationRun = await runOxlint("default.config.json", "src/cache-import.ts");
  assert(cacheInvalidationRun.code !== 0, "target source changes should invalidate parsed module cache");
  assert(cacheInvalidationRun.stdout.includes("Beta"), "cache invalidation should report the new default export name");

  console.log("consistent-esm-default-name fixtures passed");
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}
