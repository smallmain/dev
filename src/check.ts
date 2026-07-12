import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import lintCommitMessage from "@commitlint/lint";
import loadCommitlintConfig from "@commitlint/load";
import type { LintOptions } from "@commitlint/types";
import { isCommandAvailable, readCommandOutput, runCommand } from "./command-utils.ts";
import { packageRootDir } from "./package-info.ts";

interface RawCheckOptions {
  lint?: boolean;
  format?: boolean;
  fix?: boolean;
}

interface RawLintOptions {
  fix?: boolean;
}

interface RawFormatOptions {
  fix?: boolean;
}

interface RawCommitMessageOptions {
  text?: string;
}

interface CheckRunner {
  command: string;
  args: string[];
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
const oxfmtConfigFiles = [
  "oxfmt.config.js",
  "oxfmt.config.mjs",
  "oxfmt.config.cjs",
  "oxfmt.config.ts",
  "oxfmt.config.mts",
  "oxfmt.config.cts",
  ".oxfmtrc.json",
  ".oxfmtrc.jsonc",
];
const stylelintDefaultPatterns = ["**/*.{css,scss,sass,less,pcss,html,vue,svelte,astro,md,mdx}"];
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

export async function runCheckCommand(files: string[], options: RawCheckOptions): Promise<void> {
  let exitCode = 0;

  if (options.lint !== false) {
    exitCode = await runAndMergeExitCode(exitCode, runLintCheck(files, options));
  }

  if (options.format !== false) {
    exitCode = await runAndMergeExitCode(exitCode, runFormatCheck(files, options));
  }

  setExitCode(exitCode);
}

export async function runCheckLintCommand(files: string[], options: RawLintOptions): Promise<void> {
  setExitCode(await runLintCheck(files, options));
}

export async function runCheckFormatCommand(
  files: string[],
  options: RawFormatOptions,
): Promise<void> {
  setExitCode(await runFormatCheck(files, options));
}

export async function runCheckCommitMessageCommand(
  file: string | undefined,
  options: RawCommitMessageOptions,
): Promise<void> {
  if (file !== undefined && options.text !== undefined) {
    throw new Error("Pass either a commit message file or --text, not both.");
  }

  const message =
    options.text ??
    (await readFile(file ?? (await findDefaultCommitMessageFile(process.cwd())), "utf8"));

  if (!(await lintCommitMessageText(message))) {
    process.exitCode = 1;
  }
}

async function runLintCheck(files: string[], options: RawLintOptions): Promise<number> {
  const cwd = process.cwd();
  const runners = [
    await createOxlintRunner(cwd, files, options),
    await createStylelintRunner(cwd, files, options),
  ].filter((runner): runner is CheckRunner => runner !== undefined);

  return runRunners(cwd, runners);
}

async function runFormatCheck(files: string[], options: RawFormatOptions): Promise<number> {
  const cwd = process.cwd();
  const runner = await createOxfmtRunner(cwd, files, options);

  return runner ? runRunners(cwd, [runner]) : 0;
}

async function runRunners(cwd: string, runners: CheckRunner[]): Promise<number> {
  let exitCode = 0;

  for (const runner of runners) {
    const result = await runCommand(runner.command, runner.args, { cwd, preferLocal: true });

    if (result.code !== 0) {
      exitCode = result.code;
    }
  }

  return exitCode;
}

async function runAndMergeExitCode(
  currentExitCode: number,
  nextExitCodePromise: Promise<number>,
): Promise<number> {
  const nextExitCode = await nextExitCodePromise;

  return nextExitCode === 0 ? currentExitCode : nextExitCode;
}

function setExitCode(exitCode: number): void {
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

async function lintCommitMessageText(message: string): Promise<boolean> {
  const config = await loadCommitlintConfig(
    { extends: ["@commitlint/config-conventional"] },
    { cwd: packageRootDir },
  );
  const lintOptions: LintOptions = {
    parserOpts: config.parserPreset?.parserOpts as LintOptions["parserOpts"],
  };
  const result = await lintCommitMessage(message, config.rules, {
    parserOpts: lintOptions.parserOpts,
  });

  for (const warning of result.warnings) {
    console.warn(`commit-message warning: ${warning.message}`);
  }

  for (const error of result.errors) {
    console.error(`commit-message error: ${error.message}`);
  }

  return result.valid;
}

async function createOxlintRunner(
  cwd: string,
  files: string[],
  options: RawLintOptions,
): Promise<CheckRunner | undefined> {
  if (
    !(await isCommandAvailable("oxlint", { cwd, preferLocal: true })) ||
    !(await usesTool(cwd, oxlintConfigFiles, "oxlint"))
  ) {
    return undefined;
  }

  return {
    command: "oxlint",
    args: ["--no-error-on-unmatched-pattern", ...(options.fix ? ["--fix"] : []), ...files],
  };
}

async function createStylelintRunner(
  cwd: string,
  files: string[],
  options: RawLintOptions,
): Promise<CheckRunner | undefined> {
  if (
    !(await isCommandAvailable("stylelint", { cwd, preferLocal: true })) ||
    !(await usesTool(cwd, stylelintConfigFiles, "stylelint"))
  ) {
    return undefined;
  }

  const stylelintFiles =
    files.length > 0 ? files.filter(isStylelintFile) : stylelintDefaultPatterns;

  if (stylelintFiles.length === 0) {
    return undefined;
  }

  return {
    command: "stylelint",
    args: ["--allow-empty-input", ...(options.fix ? ["--fix"] : []), ...stylelintFiles],
  };
}

async function createOxfmtRunner(
  cwd: string,
  files: string[],
  options: RawFormatOptions,
): Promise<CheckRunner | undefined> {
  if (
    !(await isCommandAvailable("oxfmt", { cwd, preferLocal: true })) ||
    !(await usesTool(cwd, oxfmtConfigFiles, "oxfmt"))
  ) {
    return undefined;
  }

  return {
    command: "oxfmt",
    args: ["--no-error-on-unmatched-pattern", options.fix ? "--write" : "--check", ...files],
  };
}

async function findDefaultCommitMessageFile(cwd: string): Promise<string> {
  const gitPathCommitMessageFile = await findGitPathCommitMessageFile(cwd);

  if (gitPathCommitMessageFile) {
    return gitPathCommitMessageFile;
  }

  const gitDir = await findNearestGitDir(cwd);

  if (gitDir) {
    return path.join(gitDir, "COMMIT_EDITMSG");
  }

  throw new Error("Could not find .git/COMMIT_EDITMSG. Pass a file or --text.");
}

async function findGitPathCommitMessageFile(cwd: string): Promise<string | undefined> {
  try {
    const output = await readCommandOutput("git", ["rev-parse", "--git-path", "COMMIT_EDITMSG"], {
      cwd,
      stderr: "ignore",
    });
    const filePath = output.trim();

    return filePath.length > 0 ? path.resolve(cwd, filePath) : undefined;
  } catch {
    return undefined;
  }
}

async function findNearestGitDir(cwd: string): Promise<string | undefined> {
  let currentDir = path.resolve(cwd);

  while (true) {
    const gitPath = path.join(currentDir, ".git");
    const gitPathStat = await statOptional(gitPath);

    if (gitPathStat?.isDirectory()) {
      return gitPath;
    }

    if (gitPathStat?.isFile()) {
      const gitDir = parseGitDirFile(await readFile(gitPath, "utf8"));

      return gitDir ? path.resolve(currentDir, gitDir) : undefined;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

function parseGitDirFile(content: string): string | undefined {
  const match = /^gitdir:\s*(?<gitDir>.+?)\s*$/imu.exec(content);

  return match?.groups?.gitDir;
}

async function usesTool(
  cwd: string,
  configFiles: string[],
  packageJsonField: string,
): Promise<boolean> {
  for (const configFile of configFiles) {
    if (await fileExists(path.join(cwd, configFile))) {
      return true;
    }
  }

  try {
    const packageJson = JSON.parse(
      await readFile(path.join(cwd, "package.json"), "utf8"),
    ) as Record<string, unknown>;

    return packageJson[packageJsonField] !== undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return (await statOptional(filePath)) !== undefined;
}

async function statOptional(
  filePath: string,
): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isStylelintFile(file: string): boolean {
  return stylelintExtensions.has(path.extname(file).toLowerCase());
}
