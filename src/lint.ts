import { readFile } from "node:fs/promises";
import path from "node:path";
import { isCommandAvailable, runCommand } from "./command-utils.ts";

interface RawLintOptions {
  fix?: boolean;
}

const oxlintConfigFiles = [
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.cjs",
  "oxlint.config.ts",
  ".oxlintrc.json",
  ".oxlintrc.jsonc",
];
const stylelintConfigFiles = [
  "stylelint.config.js",
  "stylelint.config.mjs",
  "stylelint.config.cjs",
  "stylelint.config.ts",
  ".stylelintrc",
  ".stylelintrc.json",
  ".stylelintrc.yaml",
  ".stylelintrc.yml",
  ".stylelintrc.js",
  ".stylelintrc.mjs",
  ".stylelintrc.cjs",
  ".stylelintrc.ts",
];
const stylelintDefaultPatterns = [
  "**/*.{css,scss,sass,less,pcss,html,vue,svelte,astro,md,mdx}",
];
const stylelintExtensions = new Set([
  ".astro",
  ".css",
  ".html",
  ".less",
  ".md",
  ".mdx",
  ".pcss",
  ".sass",
  ".scss",
  ".svelte",
  ".vue",
]);

export async function runLintCommand(files: string[], options: RawLintOptions): Promise<void> {
  const cwd = process.cwd();
  const runners = [
    await createOxlintRunner(cwd, files, options),
    await createStylelintRunner(cwd, files, options),
  ].filter((runner): runner is LintRunner => runner !== undefined);

  if (runners.length === 0) {
    return;
  }

  let exitCode = 0;

  for (const runner of runners) {
    const result = await runCommand(runner.command, runner.args, { cwd });

    if (result.code !== 0) {
      exitCode = result.code;
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

interface LintRunner {
  command: string;
  args: string[];
}

async function createOxlintRunner(
  cwd: string,
  files: string[],
  options: RawLintOptions,
): Promise<LintRunner | undefined> {
  if (!(await isCommandAvailable("oxlint")) || !(await usesTool(cwd, oxlintConfigFiles, "oxlint"))) {
    return undefined;
  }

  return {
    command: "oxlint",
    args: [
      "--no-error-on-unmatched-pattern",
      ...(options.fix ? ["--fix"] : []),
      ...files,
    ],
  };
}

async function createStylelintRunner(
  cwd: string,
  files: string[],
  options: RawLintOptions,
): Promise<LintRunner | undefined> {
  if (!(await isCommandAvailable("stylelint")) || !(await usesTool(cwd, stylelintConfigFiles, "stylelint"))) {
    return undefined;
  }

  const stylelintFiles = files.length > 0 ? files.filter(isStylelintFile) : stylelintDefaultPatterns;

  if (stylelintFiles.length === 0) {
    return undefined;
  }

  return {
    command: "stylelint",
    args: [
      "--allow-empty-input",
      ...(options.fix ? ["--fix"] : []),
      ...stylelintFiles,
    ],
  };
}

async function usesTool(cwd: string, configFiles: string[], packageJsonField: string): Promise<boolean> {
  for (const configFile of configFiles) {
    if (await fileExists(path.join(cwd, configFile))) {
      return true;
    }
  }

  try {
    const packageJson = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;

    return packageJson[packageJsonField] !== undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isStylelintFile(file: string): boolean {
  return stylelintExtensions.has(path.extname(file).toLowerCase());
}
