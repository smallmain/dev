import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, stat } from "node:fs/promises";
import path from "node:path";
import spawn, { SubprocessError } from "nano-spawn";
import type { GitContext, StagedFile } from "./types.ts";

interface GitRunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: string;
}

export interface GitResult {
  code: number;
  stderr: string;
  stdout: string;
}

export interface RawDiffRecord {
  newMode: string;
  path: string;
  status: string;
}

export const gitOperationMetadataPaths = [
  "AM_HEAD",
  "AUTO_MERGE",
  "CHERRY_PICK_HEAD",
  "MERGE_HEAD",
  "MERGE_MODE",
  "MERGE_MSG",
  "REVERT_HEAD",
  "rebase-apply",
  "rebase-merge",
  "sequencer",
] as const;

export class GitCommandError extends Error {
  readonly args: string[];
  readonly result: GitResult;

  constructor(args: string[], result: GitResult) {
    const detail = result.stderr.trim();
    super(`git ${args.join(" ")} exited with code ${result.code}.${detail ? `\n${detail}` : ""}`);
    this.args = args;
    this.result = result;
  }
}

export async function runGit(args: string[], options: GitRunOptions = {}): Promise<string> {
  const result = await tryGit(args, options);

  if (result.code !== 0) {
    throw new GitCommandError(args, result);
  }

  return result.stdout;
}

export async function tryGit(args: string[], options: GitRunOptions = {}): Promise<GitResult> {
  try {
    const result = await spawn("git", args, {
      cwd: options.cwd,
      env: createEnvironment(options.env),
      stderr: "pipe",
      stdin: options.input === undefined ? "ignore" : { string: options.input },
      stdout: "pipe",
    });

    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    if (error instanceof SubprocessError) {
      return {
        code: error.exitCode ?? 1,
        stderr: error.stderr,
        stdout: error.stdout,
      };
    }

    throw error;
  }
}

export async function resolveGitContext(invocationCwd: string): Promise<GitContext> {
  await requireSupportedGit(invocationCwd);

  const insideWorktree = (
    await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: invocationCwd })
  ).trim();
  const bare = (await runGit(["rev-parse", "--is-bare-repository"], { cwd: invocationCwd })).trim();

  if (insideWorktree !== "true" || bare === "true") {
    throw new Error("staged-run requires a non-bare Git worktree.");
  }

  const repoRoot = path.resolve(
    (await runGit(["rev-parse", "--show-toplevel"], { cwd: invocationCwd })).trim(),
  );
  const gitDir = path.resolve(
    (await runGit(["rev-parse", "--absolute-git-dir"], { cwd: invocationCwd })).trim(),
  );
  const gitCommonDirOutput = (
    await runGit(["rev-parse", "--git-common-dir"], { cwd: invocationCwd })
  ).trim();
  const gitCommonDir = path.resolve(invocationCwd, gitCommonDirOutput);
  const defaultIndexOutput = (
    await runGit(["rev-parse", "--git-path", "index"], {
      cwd: invocationCwd,
      env: { GIT_INDEX_FILE: undefined },
    })
  ).trim();
  const defaultIndexPath = path.resolve(invocationCwd, defaultIndexOutput);
  const activeIndexPath = process.env.GIT_INDEX_FILE
    ? path.resolve(invocationCwd, process.env.GIT_INDEX_FILE)
    : defaultIndexPath;
  const defaultIndexLock = `${defaultIndexPath}.lock`;
  const activeBaseName = path.basename(activeIndexPath);
  const activeIsDefaultLock = activeIndexPath === defaultIndexLock;
  const activeIsNextIndex =
    activeBaseName.startsWith("next-index-") && activeBaseName.endsWith(".lock");
  const doubleWriteIndexPath =
    activeIsNextIndex && (await pathExists(defaultIndexLock)) ? defaultIndexLock : undefined;

  return {
    activeIndexPath,
    defaultIndexPath,
    doubleWriteIndexPath,
    gitCommonDir,
    gitDir,
    invocationCwd,
    parentManagedIndex: activeIsDefaultLock || activeIsNextIndex,
    repoRoot,
    worktreeId: createHash("sha256").update(gitDir).digest("hex").slice(0, 16),
  };
}

export async function preflightGit(context: GitContext): Promise<void> {
  const env = indexEnvironment(context.activeIndexPath);
  const unmerged = await runGit(["ls-files", "-u", "-z"], { cwd: context.repoRoot, env });

  if (unmerged.length > 0) {
    throw new Error("staged-run does not run with unmerged index entries.");
  }

  const status = await runGit(["status", "--porcelain=v2", "-z", "--untracked-files=no"], {
    cwd: context.repoRoot,
    env,
  });

  if (
    splitNul(status).some(entry => {
      const fields = entry.split(" ", 3);
      return (fields[0] === "1" || fields[0] === "2") && fields[1] === ".A";
    })
  ) {
    throw new Error("staged-run does not support intent-to-add index entries.");
  }

  const stagedEntries = await runGit(["ls-files", "--stage", "-z"], {
    cwd: context.repoRoot,
    env,
  });

  for (const entry of splitNul(stagedEntries)) {
    const tabIndex = entry.indexOf("\t");
    const fields = (tabIndex < 0 ? entry : entry.slice(0, tabIndex)).split(" ");
    const [mode, oid] = fields;

    if (oid && /^0+$/u.test(oid)) {
      throw new Error("staged-run does not support intent-to-add index entries.");
    }

    if (mode === "040000") {
      throw new Error("staged-run does not support a sparse index.");
    }
  }

  const taggedEntries = await runGit(["ls-files", "-v", "-z"], {
    cwd: context.repoRoot,
    env,
  });

  if (splitNul(taggedEntries).some(entry => entry.startsWith("S "))) {
    throw new Error("staged-run does not support skip-worktree index entries.");
  }

  for (const key of ["core.sparseCheckout", "core.sparseCheckoutCone"]) {
    const configured = await tryGit(["config", "--bool", "--get", key], {
      cwd: context.repoRoot,
    });

    if (configured.code === 0 && configured.stdout.trim() === "true") {
      throw new Error("staged-run does not support sparse-checkout.");
    }
  }
}

export async function discoverStagedFiles(
  context: GitContext,
  pathspecs: string[],
): Promise<StagedFile[]> {
  const output = await runGit(
    [
      "diff",
      "--cached",
      "--raw",
      "-z",
      "--no-abbrev",
      "--full-index",
      "--find-renames",
      "--find-copies",
      "--diff-filter=ACMR",
      "--",
      ...pathspecs,
    ],
    {
      cwd: context.invocationCwd,
      env: indexEnvironment(context.activeIndexPath),
    },
  );

  return parseRawDiff(output)
    .filter(record => record.newMode === "100644" || record.newMode === "100755")
    .map(record => ({
      absolutePath: resolveRepoPath(context.repoRoot, record.path),
      path: record.path,
      status: record.status as StagedFile["status"],
    }));
}

export async function getPartiallyStagedPaths(context: GitContext): Promise<string[]> {
  const env = indexEnvironment(context.activeIndexPath);
  const [stagedOutput, unstagedOutput, stagedEntries] = await Promise.all([
    runGit(["diff", "--cached", "--name-only", "-z"], {
      cwd: context.repoRoot,
      env,
    }),
    runGit(["diff", "--name-only", "-z", "--ignore-submodules=none"], {
      cwd: context.repoRoot,
      env,
    }),
    runGit(["ls-files", "--stage", "-z"], { cwd: context.repoRoot, env }),
  ]);
  const staged = new Set(splitNul(stagedOutput));
  const modes = parseIndexModes(stagedEntries);

  return splitNul(unstagedOutput).filter(
    filePath => staged.has(filePath) && modes.get(filePath) !== "160000",
  );
}

export async function getIndexPaths(context: GitContext, indexPath: string): Promise<string[]> {
  const output = await runGit(["ls-files", "-z"], {
    cwd: context.repoRoot,
    env: indexEnvironment(indexPath),
  });

  return splitNul(output);
}

export async function getTreePaths(context: GitContext, tree: string): Promise<string[]> {
  return splitNul(
    await runGit(["ls-tree", "-r", "-z", "--name-only", tree], { cwd: context.repoRoot }),
  );
}

export async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

export async function hashOperationMetadata(context: GitContext): Promise<string> {
  const hash = createHash("sha256");

  for (const relativePath of gitOperationMetadataPaths) {
    await hashPath(hash, context.gitDir, relativePath);
  }

  return hash.digest("hex");
}

export function indexEnvironment(indexPath: string): Record<string, string> {
  return { GIT_INDEX_FILE: indexPath };
}

export function splitNul(output: string): string[] {
  const values = output.split("\0");

  if (values.at(-1) === "") {
    values.pop();
  }

  return values;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function parseRawDiff(output: string): RawDiffRecord[] {
  const values = splitNul(output);
  const records: RawDiffRecord[] = [];

  for (let index = 0; index < values.length; ) {
    const header = values[index++];

    if (!header?.startsWith(":")) {
      throw new Error("Unexpected output from git diff --raw.");
    }

    const fields = header.slice(1).split(" ");
    const newMode = fields[1];
    const statusField = fields.at(-1);
    const status = statusField?.[0];

    if (!newMode || !status || !["A", "C", "M", "R"].includes(status)) {
      throw new Error("Unexpected staged diff record.");
    }

    if (status === "C" || status === "R") {
      index += 1;
    }

    const filePath = values[index++];

    if (filePath === undefined) {
      throw new Error("Staged diff record is missing a path.");
    }

    records.push({ newMode, path: filePath, status });
  }

  return records;
}

function parseIndexModes(output: string): Map<string, string> {
  const modes = new Map<string, string>();

  for (const entry of splitNul(output)) {
    const tabIndex = entry.indexOf("\t");

    if (tabIndex < 0) {
      continue;
    }

    const mode = entry.slice(0, tabIndex).split(" ")[0];
    const filePath = entry.slice(tabIndex + 1);

    if (mode) {
      modes.set(filePath, mode);
    }
  }

  return modes;
}

function resolveRepoPath(repoRoot: string, filePath: string): string {
  const absolutePath = path.resolve(repoRoot, filePath);
  const relativePath = path.relative(repoRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Git returned a path outside the worktree: ${filePath}`);
  }

  return absolutePath;
}

async function requireSupportedGit(cwd: string): Promise<void> {
  const versionOutput = (await runGit(["--version"], { cwd })).trim();
  const [major, minor] = parseGitVersion(versionOutput);

  if (major < 2 || (major === 2 && minor < 32)) {
    throw new Error(`staged-run requires Git 2.32 or later; found ${versionOutput}.`);
  }
}

export function parseGitVersion(versionOutput: string): [major: number, minor: number] {
  const match = /(?:^|\s)(\d+)\.(\d+)(?:\.(\d+))?/u.exec(versionOutput);

  if (!match) {
    throw new Error(`Unable to parse Git version: ${versionOutput}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  return [major, minor];
}

function createEnvironment(
  overrides: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const environment = { ...process.env } as Record<string, string | undefined>;

  for (const [key, value] of Object.entries(overrides ?? {})) {
    environment[key] = value;
  }

  // Node omits undefined environment values. Keeping the key here is required to
  // override nano-spawn's inherited process environment.
  return environment as Record<string, string>;
}

async function hashPath(
  hash: ReturnType<typeof createHash>,
  root: string,
  relativePath: string,
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  let info;

  try {
    info = await lstat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      hash.update(`missing\0${relativePath}\0`);
      return;
    }

    throw error;
  }

  hash.update(`${info.mode}\0${relativePath}\0`);

  if (info.isDirectory()) {
    const entries = (await readdir(absolutePath)).sort();

    for (const entry of entries) {
      await hashPath(hash, root, path.join(relativePath, entry));
    }

    return;
  }

  if (info.isSymbolicLink()) {
    hash.update(await readlink(absolutePath));
    return;
  }

  hash.update(await readFile(absolutePath));
}
