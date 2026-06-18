import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCommandOutput, runCommand } from "./command-utils.ts";

interface RawSetGitHookOptions {
  force?: boolean;
}

const managedMarker = "# sm managed pre-commit hook";
const hookContent = `#!/bin/sh
${managedMarker}
PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
sm staged-run "pnpm run lint" "."
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

  const hookPath = path.join(gitDir, "hooks", "pre-commit");
  const existingContent = await readOptionalFile(hookPath);
  const hooksPath = await getHooksPath();

  if (
    existingContent !== undefined &&
    !existingContent.includes(managedMarker) &&
    options.force !== true
  ) {
    throw new Error("Existing pre-commit hook is not managed by sm. Re-run with --force to overwrite it.");
  }

  if (hooksPath && !isHuskyHooksPath(hooksPath) && options.force !== true) {
    throw new Error("Git core.hooksPath is set. Re-run with --force to use .git/hooks.");
  }

  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, hookContent);
  await chmod(hookPath, 0o755);
  await resetHooksPath(hooksPath, options.force === true);
  console.log(`Installed ${hookPath}`);
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
    const hooksPath = (await readCommandOutput("git", ["config", "--get", "core.hooksPath"])).trim();

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
