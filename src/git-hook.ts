import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCommandOutput, runCommand } from "./command-utils.ts";

interface RawSetGitHookOptions {
  force?: boolean;
}

const managedPreCommitMarker = "# sm managed pre-commit hook";
const managedCommitMessageMarker = "# sm managed commit-msg hook";
const commitMessageHookContent = `#!/bin/sh
${managedCommitMessageMarker}
PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
sm check commit-message "$1"
`;

export async function runSetGitHookCommand(options: RawSetGitHookOptions): Promise<void> {
  if (!(await hasLocalGitDirectory())) {
    console.log("Skipping Git hook installation because .git is not in the current directory.");
    return;
  }

  const gitDir = await getGitDir();

  if (!gitDir) {
    console.log("Skipping Git hook installation because this is not a Git repository.");
    return;
  }

  const hooksPath = await getHooksPath();

  if (hooksPath && !isHuskyHooksPath(hooksPath) && options.force !== true) {
    throw new Error("Git core.hooksPath is set. Re-run with --force to use .git/hooks.");
  }

  const packageManager = await resolvePackageManager();

  await writeManagedHook({
    content: createPreCommitHookContent(packageManager),
    force: options.force === true,
    gitDir,
    marker: managedPreCommitMarker,
    name: "pre-commit",
  });
  await writeManagedHook({
    content: commitMessageHookContent,
    force: options.force === true,
    gitDir,
    marker: managedCommitMessageMarker,
    name: "commit-msg",
  });
  await resetHooksPath(hooksPath, options.force === true);
  console.log(`Installed ${path.join(gitDir, "hooks", "pre-commit")}`);
  console.log(`Installed ${path.join(gitDir, "hooks", "commit-msg")}`);
}

async function writeManagedHook(options: {
  content: string;
  force: boolean;
  gitDir: string;
  marker: string;
  name: string;
}): Promise<void> {
  const hookPath = path.join(options.gitDir, "hooks", options.name);
  const existingContent = await readOptionalFile(hookPath);

  if (
    existingContent !== undefined &&
    !existingContent.includes(options.marker) &&
    !options.force
  ) {
    throw new Error(
      `Existing ${options.name} hook is not managed by sm. Re-run with --force to overwrite it.`,
    );
  }

  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, options.content);
  await chmod(hookPath, 0o755);
}

async function hasLocalGitDirectory(): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), ".git"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function getGitDir(): Promise<string | undefined> {
  try {
    const output = await readCommandOutput("git", ["rev-parse", "--git-common-dir"], {
      stderr: "ignore",
    });

    return path.resolve(output.trim());
  } catch {
    return undefined;
  }
}

async function getHooksPath(): Promise<string | undefined> {
  try {
    const hooksPath = (
      await readCommandOutput("git", ["config", "--get", "core.hooksPath"])
    ).trim();

    return hooksPath.length > 0 ? hooksPath : undefined;
  } catch {
    return undefined;
  }
}

async function resetHooksPath(hooksPath: string | undefined, force: boolean): Promise<void> {
  if (hooksPath && (isHuskyHooksPath(hooksPath) || force)) {
    await runCommand("git", ["config", "--unset", "core.hooksPath"], { stdio: "ignore" });
  }
}

async function resolvePackageManager(): Promise<"npm" | "pnpm"> {
  const packageJson = await readOptionalPackageJson(path.join(process.cwd(), "package.json"));
  const packageManager = getDevEnginePackageManagerName(packageJson?.devEngines);

  return packageManager === "npm" ? "npm" : "pnpm";
}

function createPreCommitHookContent(packageManager: "npm" | "pnpm"): string {
  return `#!/bin/sh
${managedPreCommitMarker}
PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
sm staged-run "${packageManager} run check" "."
`;
}

async function readOptionalPackageJson(
  filePath: string,
): Promise<{ devEngines?: unknown } | undefined> {
  const content = await readOptionalFile(filePath);

  if (content === undefined) {
    return undefined;
  }

  return JSON.parse(content) as { devEngines?: unknown };
}

function getDevEnginePackageManagerName(devEngines: unknown): string | undefined {
  if (!isRecord(devEngines)) {
    return undefined;
  }

  const packageManagerDevEngine = devEngines.packageManager;

  if (Array.isArray(packageManagerDevEngine)) {
    return packageManagerDevEngine.map(getPackageManagerName).find(Boolean);
  }

  return getPackageManagerName(packageManagerDevEngine);
}

function getPackageManagerName(value: unknown): string | undefined {
  return isRecord(value) && typeof value.name === "string" ? value.name : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHuskyHooksPath(hooksPath: string): boolean {
  const normalizedHooksPath = hooksPath.replaceAll("\\", "/").replace(/^\.\//u, "");

  return normalizedHooksPath === ".husky" || normalizedHooksPath === ".husky/_";
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
