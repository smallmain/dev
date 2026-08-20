import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import lintCommitMessage from "@commitlint/lint";
import loadCommitlintConfig from "@commitlint/load";
import type { LintOptions } from "@commitlint/types";
import { readCommandOutput, runCommand } from "./command-utils.ts";
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

interface ProjectPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const stylelintDefaultPatterns = [
  "**/*.{css,scss,sass,less,pcss,html,ejs,vue,svelte,astro,md,mdx}",
];
const stylelintExtensions = new Set([
  ".astro",
  ".css",
  ".ejs",
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
  setExitCode(await runCheck(files, options));
}

export async function runCheckOrThrow(files: string[], options: RawCheckOptions): Promise<void> {
  const exitCode = await runCheck(files, options);

  if (exitCode !== 0) {
    throw new Error(`Project checks failed with exit code ${exitCode}.`);
  }
}

async function runCheck(files: string[], options: RawCheckOptions): Promise<number> {
  let exitCode = 0;

  if (options.lint !== false) {
    exitCode = await runAndMergeExitCode(exitCode, runLintCheck(files, options));
  }

  if (options.format !== false) {
    exitCode = await runAndMergeExitCode(exitCode, runFormatCheck(files, options));
  }

  return exitCode;
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
  const runners = (
    await Promise.all([
      createOxlintRunner(cwd, files, options),
      createStylelintRunner(cwd, files, options),
    ])
  ).filter((runner): runner is CheckRunner => runner !== undefined);

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
  if (!(await isPackageInstalled(cwd, "oxlint"))) {
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
  if (!(await isPackageInstalled(cwd, "stylelint"))) {
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
  if (!(await isPackageInstalled(cwd, "oxfmt"))) {
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

async function isPackageInstalled(cwd: string, packageName: string): Promise<boolean> {
  let packageJson: ProjectPackageJson;

  try {
    packageJson = JSON.parse(
      await readFile(path.join(cwd, "package.json"), "utf8"),
    ) as ProjectPackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }

  if (!dependencyFields.some(field => Object.hasOwn(packageJson[field] ?? {}, packageName))) {
    return false;
  }

  const require = createRequire(path.join(cwd, "package.json"));

  try {
    require.resolve(`${packageName}/package.json`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
      return false;
    }

    throw error;
  }
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
