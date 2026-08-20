import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import spawn, { SubprocessError } from "nano-spawn";
import { expect, test } from "vitest";
import {
  cliPath,
  formatCommandFailure,
  initGitRepo,
  runCommand,
  runSm,
  testTimeoutMs,
  type CommandResult,
} from "./cli-e2e-utils.ts";

interface GitStateFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

async function withGitStateFixture(
  run: (fixture: GitStateFixture) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-staged-run-git-state-e2e-"));
  let passed = false;

  try {
    const env = await initGitRepo(cwd);

    await run({ cwd, env });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept staged-run Git-state e2e temp directory: ${cwd}`);
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

async function git(fixture: GitStateFixture, args: string[]): Promise<CommandResult> {
  const result = await runCommand("git", args, {
    cwd: fixture.cwd,
    env: fixture.env,
    timeoutMs: testTimeoutMs,
  });

  expect(result, formatCommandFailure(`git ${args.join(" ")}`, result)).toMatchObject({
    exitCode: 0,
    timedOut: false,
  });
  return result;
}

test(
  "rejects an unmerged index and preserves resolved merge metadata",
  async () => {
    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "format.txt", "format base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      const mainBranch = (await git(fixture, ["branch", "--show-current"])).stdout;

      await git(fixture, ["checkout", "-b", "feature"]);
      await writeFixture(fixture.cwd, "conflict.txt", "feature\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "feature"]);
      await git(fixture, ["checkout", mainBranch]);
      await writeFixture(fixture.cwd, "conflict.txt", "main\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "main"]);

      const conflictedMerge = await runCommand("git", ["merge", "feature"], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });
      expect(conflictedMerge.exitCode).not.toBe(0);
      const conflictedIndex = await readFile(path.join(fixture.cwd, ".git/index"));
      const rejected = await runSm(
        ["staged-run", ".", "--", process.execPath, "-e", "process.exit(0)"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.stderr).toContain("unmerged index entries");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(conflictedIndex);

      await writeFixture(fixture.cwd, "conflict.txt", "resolved\n");
      await writeFixture(fixture.cwd, "format.txt", "NEEDS_FIX\n");
      await git(fixture, ["add", "conflict.txt", "format.txt"]);
      await writeFixture(
        fixture.cwd,
        "fix.mjs",
        `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  await writeFile(file, (await readFile(file, "utf8")).replace("NEEDS_FIX", "FIXED"));
}
`,
      );
      const mergeHeadBefore = await readFile(path.join(fixture.cwd, ".git/MERGE_HEAD"));
      const mergeMessageBefore = await readFile(path.join(fixture.cwd, ".git/MERGE_MSG"));
      const fixed = await runSm(["staged-run", ".", "--", process.execPath, "fix.mjs"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(fixed, formatCommandFailure("staged-run resolved merge", fixed)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect((await git(fixture, ["show", ":format.txt"])).stdout).toBe("FIXED");
      expect(await readFile(path.join(fixture.cwd, ".git/MERGE_HEAD"))).toEqual(mergeHeadBefore);
      expect(await readFile(path.join(fixture.cwd, ".git/MERGE_MSG"))).toEqual(mergeMessageBefore);

      const repairedIndex = await readFile(path.join(fixture.cwd, ".git/index"));
      const repairedConflict = await readFile(path.join(fixture.cwd, "conflict.txt"));
      const repairedFormat = await readFile(path.join(fixture.cwd, "format.txt"));

      await writeFixture(
        fixture.cwd,
        "mutate-operation.mjs",
        `
import { appendFile, writeFile } from "node:fs/promises";
const [metadata, ...files] = process.argv.slice(2);
await writeFile(metadata, "mutated metadata\\n");
for (const file of files) await appendFile(file, "child mutation\\n");
`,
      );
      const metadataMutation = await runSm(
        [
          "staged-run",
          ".",
          "--",
          process.execPath,
          "mutate-operation.mjs",
          path.join(fixture.cwd, ".git/MERGE_MSG"),
        ],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(metadataMutation.exitCode).not.toBe(0);
      expect(metadataMutation.stderr).toContain("Git operation metadata changed");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(repairedIndex);
      expect(await readFile(path.join(fixture.cwd, "conflict.txt"))).toEqual(repairedConflict);
      expect(await readFile(path.join(fixture.cwd, "format.txt"))).toEqual(repairedFormat);
      expect(await readFile(path.join(fixture.cwd, ".git/MERGE_HEAD"))).toEqual(mergeHeadBefore);
      expect(await readFile(path.join(fixture.cwd, ".git/MERGE_MSG"))).toEqual(mergeMessageBefore);

      await writeFixture(
        fixture.cwd,
        "restore-first-parent.mjs",
        `
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
for (const file of process.argv.slice(2)) {
  const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
  await writeFile(file, execFileSync("git", ["show", "HEAD:" + relative]));
}
`,
      );
      const firstParentResult = await runSm(
        ["staged-run", ".", "--", process.execPath, "restore-first-parent.mjs"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(
        firstParentResult,
        formatCommandFailure("staged-run merge first-parent result", firstParentResult),
      ).toMatchObject({ exitCode: 0, timedOut: false });
      expect((await git(fixture, ["write-tree"])).stdout).toBe(
        (await git(fixture, ["rev-parse", "HEAD^{tree}"])).stdout,
      );
    });
  },
  testTimeoutMs,
);

test(
  "isolates transactions and indexes between linked worktrees",
  async () => {
    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "shared.txt", "base\n");
      await git(fixture, ["add", "shared.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "shared.txt", "MAIN-STAGED\n");
      await git(fixture, ["add", "shared.txt"]);
      const linkedPath = `${fixture.cwd}-linked`;

      try {
        await git(fixture, ["worktree", "add", "-b", "linked", linkedPath]);
        await writeFixture(linkedPath, "shared.txt", "LINK-STAGED\n");
        const linkedFixture = { ...fixture, cwd: linkedPath };

        await git(linkedFixture, ["add", "shared.txt"]);
        await writeFixture(
          linkedPath,
          "fix.mjs",
          `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  await writeFile(file, (await readFile(file, "utf8")).replace("LINK-STAGED", "LINK-FIXED"));
}
`,
        );
        const result = await runSm(["staged-run", ".", "--", process.execPath, "fix.mjs"], {
          cwd: linkedPath,
          env: fixture.env,
        });

        expect(result, formatCommandFailure("staged-run linked worktree", result)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });
        expect((await git(linkedFixture, ["show", ":shared.txt"])).stdout).toBe("LINK-FIXED");
        expect((await git(fixture, ["show", ":shared.txt"])).stdout).toBe("MAIN-STAGED");
      } finally {
        await runCommand("git", ["worktree", "remove", "--force", linkedPath], {
          cwd: fixture.cwd,
          env: fixture.env,
          timeoutMs: testTimeoutMs,
        });
        await rm(linkedPath, { force: true, recursive: true });
      }
    });
  },
  testTimeoutMs,
);

test(
  "preserves resolved cherry-pick and revert metadata byte-for-byte",
  async () => {
    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "format.txt", "format base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      const mainBranch = (await git(fixture, ["branch", "--show-current"])).stdout;

      await git(fixture, ["checkout", "-b", "pick-topic"]);
      await writeFixture(fixture.cwd, "conflict.txt", "topic\n");
      await writeFixture(fixture.cwd, "format.txt", "NEEDS_FIX cherry\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "topic"]);
      await git(fixture, ["checkout", mainBranch]);
      await writeFixture(fixture.cwd, "conflict.txt", "main\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "main"]);
      const cherryPick = await runCommand("git", ["cherry-pick", "pick-topic"], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });

      expect(cherryPick.exitCode).not.toBe(0);
      await writeFixture(fixture.cwd, "conflict.txt", "RESOLVE cherry\n");
      await git(fixture, ["add", "conflict.txt"]);
      await writeOperationFixer(fixture.cwd);
      const cherryMetadata = await snapshotOperationMetadata(fixture.cwd, [
        "CHERRY_PICK_HEAD",
        "MERGE_MSG",
        "sequencer",
      ]);
      const fixedCherry = await runSm(
        ["staged-run", ".", "--", process.execPath, "operation-fix.mjs"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(
        fixedCherry,
        formatCommandFailure("staged-run cherry-pick", fixedCherry),
      ).toMatchObject({ exitCode: 0, timedOut: false });
      expect(
        await snapshotOperationMetadata(fixture.cwd, [
          "CHERRY_PICK_HEAD",
          "MERGE_MSG",
          "sequencer",
        ]),
      ).toEqual(cherryMetadata);
      expect((await git(fixture, ["show", ":format.txt"])).stdout).toBe("FIXED cherry");
      expect((await git(fixture, ["show", ":conflict.txt"])).stdout).toBe("RESOLVED cherry");
    });

    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "stable.txt", "stable\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "conflict.txt", "target\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "target"]);
      const target = (await git(fixture, ["rev-parse", "HEAD"])).stdout;

      await writeFixture(fixture.cwd, "conflict.txt", "later\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "later"]);
      const revert = await runCommand("git", ["revert", "--no-edit", target], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });

      expect(revert.exitCode).not.toBe(0);
      await writeFixture(fixture.cwd, "conflict.txt", "RESOLVE revert\n");
      await git(fixture, ["add", "conflict.txt"]);
      await writeOperationFixer(fixture.cwd);
      const revertMetadata = await snapshotOperationMetadata(fixture.cwd, [
        "REVERT_HEAD",
        "MERGE_MSG",
        "sequencer",
      ]);
      const fixedRevert = await runSm(
        ["staged-run", ".", "--", process.execPath, "operation-fix.mjs"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(fixedRevert, formatCommandFailure("staged-run revert", fixedRevert)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(
        await snapshotOperationMetadata(fixture.cwd, ["REVERT_HEAD", "MERGE_MSG", "sequencer"]),
      ).toEqual(revertMetadata);
      expect((await git(fixture, ["show", ":conflict.txt"])).stdout).toBe("RESOLVED revert");
    });
  },
  testTimeoutMs,
);

test(
  "preserves resolved rebase and am state byte-for-byte",
  async () => {
    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "format.txt", "format base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      const mainBranch = (await git(fixture, ["branch", "--show-current"])).stdout;

      await git(fixture, ["checkout", "-b", "rebase-topic"]);
      await writeFixture(fixture.cwd, "conflict.txt", "topic\n");
      await writeFixture(fixture.cwd, "format.txt", "NEEDS_FIX rebase\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "topic"]);
      await git(fixture, ["checkout", mainBranch]);
      await writeFixture(fixture.cwd, "conflict.txt", "main\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "main"]);
      await git(fixture, ["checkout", "rebase-topic"]);
      const rebase = await runCommand("git", ["rebase", mainBranch], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });

      expect(rebase.exitCode).not.toBe(0);
      await writeFixture(fixture.cwd, "conflict.txt", "RESOLVE rebase\n");
      await git(fixture, ["add", "conflict.txt"]);
      await writeOperationFixer(fixture.cwd);
      const rebaseMetadata = await snapshotOperationMetadata(fixture.cwd, ["rebase-merge"]);
      const fixedRebase = await runSm(
        ["staged-run", ".", "--", process.execPath, "operation-fix.mjs"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(fixedRebase, formatCommandFailure("staged-run rebase", fixedRebase)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(await snapshotOperationMetadata(fixture.cwd, ["rebase-merge"])).toEqual(
        rebaseMetadata,
      );
      expect((await git(fixture, ["show", ":format.txt"])).stdout).toBe("FIXED rebase");
    });

    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "format.txt", "format base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      const mainBranch = (await git(fixture, ["branch", "--show-current"])).stdout;

      await git(fixture, ["checkout", "-b", "am-topic"]);
      await writeFixture(fixture.cwd, "conflict.txt", "topic\n");
      await writeFixture(fixture.cwd, "format.txt", "NEEDS_FIX am\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "mail topic"]);
      const patchOutput = (await git(fixture, ["format-patch", "-1", "--stdout"])).stdout;

      await writeFixture(fixture.cwd, "topic.patch", `${patchOutput}\n`);
      await git(fixture, ["checkout", mainBranch]);
      await writeFixture(fixture.cwd, "conflict.txt", "main\n");
      await git(fixture, ["add", "conflict.txt"]);
      await git(fixture, ["commit", "-m", "main"]);
      const am = await runCommand("git", ["am", "--3way", "topic.patch"], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });

      expect(am.exitCode).not.toBe(0);
      await writeFixture(fixture.cwd, "conflict.txt", "RESOLVE am\n");
      await git(fixture, ["add", "conflict.txt"]);
      await writeOperationFixer(fixture.cwd);
      const amMetadata = await snapshotOperationMetadata(fixture.cwd, ["AM_HEAD", "rebase-apply"]);
      const fixedAm = await runSm(
        ["staged-run", ".", "--", process.execPath, "operation-fix.mjs"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(fixedAm, formatCommandFailure("staged-run am", fixedAm)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(await snapshotOperationMetadata(fixture.cwd, ["AM_HEAD", "rebase-apply"])).toEqual(
        amMetadata,
      );
      expect((await git(fixture, ["show", ":format.txt"])).stdout).toBe("FIXED am");
    });
  },
  testTimeoutMs,
);

test.each(["SIGINT", "SIGTERM"] as const)(
  "terminates the child process group and rolls back on %s",
  async signal => {
    if (process.platform === "win32") {
      return;
    }

    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "signal.txt", "base\n");
      await git(fixture, ["add", "signal.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "signal.txt", "staged\n");
      await git(fixture, ["add", "signal.txt"]);
      await writeFixture(fixture.cwd, "signal.txt", "staged\nunstaged\n");
      await writeFixture(
        fixture.cwd,
        "wait.mjs",
        `
import { writeFile } from "node:fs/promises";
await writeFile(process.argv[2], "ready");
setInterval(() => {}, 1000);
`,
      );
      const marker = path.join(fixture.cwd, "ready.marker");
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "signal.txt"));
      const subprocess = spawn(
        process.execPath,
        [cliPath, "staged-run", "signal.txt", "--", process.execPath, "wait.mjs", marker],
        {
          cwd: fixture.cwd,
          env: fixture.env as Record<string, string>,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const child = await subprocess.nodeChildProcess;

      await waitForFile(marker);
      child.kill(signal);

      try {
        await subprocess;
        throw new Error("Expected staged-run to exit after SIGINT.");
      } catch (error) {
        expect(error).toBeInstanceOf(SubprocessError);
        expect((error as SubprocessError).exitCode).toBe(signal === "SIGINT" ? 130 : 143);
      }

      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "signal.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "refuses concurrent execution and recovery while a transaction is live",
  async () => {
    if (process.platform === "win32") {
      return;
    }

    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "live.txt", "live\n");
      await git(fixture, ["add", "live.txt"]);
      await writeFixture(
        fixture.cwd,
        "wait-live.mjs",
        `
import { writeFile } from "node:fs/promises";
await writeFile(process.argv[2], "ready");
setInterval(() => {}, 1000);
`,
      );
      const marker = path.join(fixture.cwd, "live.marker");
      const subprocess = spawn(
        process.execPath,
        [cliPath, "staged-run", "live.txt", "--", process.execPath, "wait-live.mjs", marker],
        {
          cwd: fixture.cwd,
          env: fixture.env as Record<string, string>,
          stderr: "pipe",
          stdout: "pipe",
        },
      );
      const child = await subprocess.nodeChildProcess;

      await waitForFile(marker);
      const concurrent = await runSm(
        ["staged-run", "live.txt", "--", process.execPath, "-e", "process.exit(0)"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(concurrent.exitCode).not.toBe(0);
      expect(concurrent.stderr).toContain("is still running with process");
      const listed = await runSm(["staged-run", "--list-recoveries"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const id = listed.stdout.trim().split("\t")[0];
      const liveDiscard = await runSm(["staged-run", "--discard-recovery", id, "--force"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(liveDiscard.exitCode).not.toBe(0);
      expect(liveDiscard.stderr).toContain("is still running with process");
      child.kill("SIGINT");

      try {
        await subprocess;
        throw new Error("Expected the live staged-run process to stop.");
      } catch (error) {
        expect(error).toBeInstanceOf(SubprocessError);
        expect((error as SubprocessError).exitCode).toBe(130);
      }

      expect(
        (
          await runSm(["staged-run", "--list-recoveries"], {
            cwd: fixture.cwd,
            env: fixture.env,
          })
        ).stdout,
      ).toBe("");
    });
  },
  testTimeoutMs,
);

test(
  "reclaims an orphaned compare-and-swap lock with no transaction assets",
  async () => {
    await withGitStateFixture(async fixture => {
      await writeFixture(fixture.cwd, "orphan.txt", "orphan\n");
      await git(fixture, ["add", "orphan.txt"]);
      const gitDir = (await git(fixture, ["rev-parse", "--absolute-git-dir"])).stdout;
      const worktreeId = createHash("sha256")
        .update(path.resolve(gitDir))
        .digest("hex")
        .slice(0, 16);
      const lockRef = `refs/sm/staged-run/${worktreeId}/lock`;
      const orphanDirectory = path.join(gitDir, "sm/staged-run/transactions/orphan-directory");
      const lockObject = await runCommand("git", ["hash-object", "-w", "--stdin"], {
        cwd: fixture.cwd,
        env: fixture.env,
        stdin: `${JSON.stringify({ id: "orphan", pid: 999_999_999 })}\n`,
        timeoutMs: testTimeoutMs,
      });

      expect(lockObject.exitCode).toBe(0);
      await mkdir(orphanDirectory, { recursive: true });
      expect(
        (
          await runSm(["staged-run", "--list-recoveries"], {
            cwd: fixture.cwd,
            env: fixture.env,
          })
        ).stdout,
      ).toBe("");
      await git(fixture, ["update-ref", lockRef, lockObject.stdout]);
      const result = await runSm(
        ["staged-run", "orphan.txt", "--", process.execPath, "-e", "process.exit(0)"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(result, formatCommandFailure("staged-run orphan lock", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      const missingLock = await runCommand("git", ["rev-parse", "--verify", lockRef], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });

      expect(missingLock.exitCode).not.toBe(0);
      await expect(access(orphanDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    });
  },
  testTimeoutMs,
);

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${filePath}.`);
}

async function writeOperationFixer(cwd: string): Promise<void> {
  await writeFixture(
    cwd,
    "operation-fix.mjs",
    `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  const content = await readFile(file, "utf8");
  await writeFile(file, content.replace("NEEDS_FIX", "FIXED").replace("RESOLVE", "RESOLVED"));
}
`,
  );
}

async function snapshotOperationMetadata(
  cwd: string,
  relativePaths: string[],
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  const gitDirectory = path.join(cwd, ".git");

  for (const relativePath of relativePaths) {
    await snapshotPath(gitDirectory, relativePath, snapshot);
  }

  return snapshot;
}

async function snapshotPath(
  root: string,
  relativePath: string,
  snapshot: Record<string, string>,
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  let info;

  try {
    info = await lstat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      snapshot[relativePath] = "missing";
      return;
    }

    throw error;
  }

  if (info.isDirectory()) {
    snapshot[relativePath] = `directory:${info.mode}`;

    for (const entry of (await readdir(absolutePath)).sort()) {
      await snapshotPath(root, path.join(relativePath, entry), snapshot);
    }

    return;
  }

  if (info.isSymbolicLink()) {
    snapshot[relativePath] = `symlink:${info.mode}:${await readlink(absolutePath)}`;
    return;
  }

  snapshot[relativePath] = `file:${info.mode}:${(await readFile(absolutePath)).toString("base64")}`;
}
