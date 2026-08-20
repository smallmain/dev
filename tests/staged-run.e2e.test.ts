import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  formatCommandFailure,
  initGitRepo,
  runCommand,
  runSm,
  testTimeoutMs,
  type CommandResult,
} from "./cli-e2e-utils.ts";

interface StagedRunFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const recorderScript = `console.log(JSON.stringify(process.argv.slice(2)));\n`;
const fixerScript = `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  const content = await readFile(file, "utf8");
  await writeFile(file, content.replace("STAGED", "FIXED"));
}
`;

async function withGitFixture(run: (fixture: StagedRunFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-staged-run-e2e-"));
  let passed = false;

  try {
    const env = await initGitRepo(cwd);

    await run({ cwd, env });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept staged-run e2e temp directory: ${cwd}`);
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

async function git(
  fixture: StagedRunFixture,
  args: string[],
  description = `git ${args.join(" ")}`,
): Promise<CommandResult> {
  const result = await runCommand("git", args, {
    cwd: fixture.cwd,
    env: fixture.env,
    timeoutMs: testTimeoutMs,
  });

  expect(result, formatCommandFailure(description, result)).toMatchObject({
    exitCode: 0,
    timedOut: false,
  });
  return result;
}

async function commitFile(
  fixture: StagedRunFixture,
  relativePath: string,
  contents: string,
): Promise<void> {
  await writeFixture(fixture.cwd, relativePath, contents);
  await git(fixture, ["add", "--", relativePath]);
  await git(fixture, ["commit", "-m", `add ${relativePath}`]);
}

async function runStaged(fixture: StagedRunFixture, args: string[]): Promise<CommandResult> {
  return runSm(["staged-run", ...args], { cwd: fixture.cwd, env: fixture.env });
}

test(
  "requires the new argv separator and is silent when no files match",
  async () => {
    await withGitFixture(async fixture => {
      const usage = await runStaged(fixture, []);

      expect(usage.exitCode).not.toBe(0);
      expect(usage.stderr).toContain("sm staged-run [--allow-empty] [pathspec...] --");

      await writeFixture(fixture.cwd, "recorder.mjs", recorderScript);
      const noMatch = await runStaged(fixture, ["--", process.execPath, "recorder.mjs"]);

      expect(noMatch, formatCommandFailure("staged-run no match", noMatch)).toMatchObject({
        exitCode: 0,
        stderr: "",
        stdout: "",
        timedOut: false,
      });
    });
  },
  testTimeoutMs,
);

test(
  "passes raw arguments and absolute staged paths without wrapper output on an unborn branch",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, "recorder.mjs", recorderScript);
      await writeFixture(fixture.cwd, "space name.txt", "value\n");
      await git(fixture, ["add", "--", "space name.txt"]);

      const result = await runStaged(fixture, [
        ".",
        "--",
        process.execPath,
        "recorder.mjs",
        "--literal",
        "$HOME",
        ";",
      ]);

      expect(result, formatCommandFailure("staged-run argv", result)).toMatchObject({
        exitCode: 0,
        stderr: "",
        timedOut: false,
      });
      expect(JSON.parse(result.stdout) as string[]).toEqual([
        "--literal",
        "$HOME",
        ";",
        path.join(await realpath(fixture.cwd), "space name.txt"),
      ]);

      const privateRefs = await git(fixture, [
        "for-each-ref",
        "--format=%(refname)",
        "refs/sm/staged-run",
      ]);
      expect(privateRefs.stdout).toBe("");
    });
  },
  testTimeoutMs,
);

test(
  "handles control characters and rename destinations while excluding deletions and symlinks",
  async () => {
    await withGitFixture(async fixture => {
      const specialName = "line\nbreak.txt";

      await writeFixture(fixture.cwd, "recorder.mjs", recorderScript);
      await writeFixture(fixture.cwd, specialName, "special\n");
      await git(fixture, ["add", "--", specialName]);
      const special = await runStaged(fixture, [".", "--", process.execPath, "recorder.mjs"]);

      expect(JSON.parse(special.stdout) as string[]).toEqual([
        path.join(await realpath(fixture.cwd), specialName),
      ]);
      await git(fixture, ["commit", "-m", "special"]);
      await git(fixture, ["mv", "--", specialName, "renamed.txt"]);
      const renamed = await runStaged(fixture, [
        "renamed.txt",
        "--",
        process.execPath,
        "recorder.mjs",
      ]);

      expect(JSON.parse(renamed.stdout) as string[]).toEqual([
        path.join(await realpath(fixture.cwd), "renamed.txt"),
      ]);
    });

    if (process.platform !== "win32") {
      await withGitFixture(async fixture => {
        await writeFixture(fixture.cwd, "deleted.txt", "deleted\n");
        await git(fixture, ["add", "deleted.txt"]);
        await git(fixture, ["commit", "-m", "base"]);
        await rm(path.join(fixture.cwd, "deleted.txt"));
        await symlink("target.txt", path.join(fixture.cwd, "link.txt"));
        await git(fixture, ["add", "-A"]);
        await writeFixture(fixture.cwd, "recorder.mjs", recorderScript);
        const excluded = await runStaged(fixture, [".", "--", process.execPath, "recorder.mjs"]);

        expect(excluded, formatCommandFailure("staged-run excluded files", excluded)).toMatchObject(
          {
            exitCode: 0,
            stderr: "",
            stdout: "",
          },
        );
      });
    }
  },
  testTimeoutMs,
);

test(
  "resolves a project-local executable before global PATH entries",
  async () => {
    if (process.platform === "win32") {
      return;
    }

    await withGitFixture(async fixture => {
      await writeFixture(
        fixture.cwd,
        "node_modules/.bin/local-recorder",
        `#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`,
      );
      await chmod(path.join(fixture.cwd, "node_modules/.bin/local-recorder"), 0o755);
      await writeFixture(fixture.cwd, "local.txt", "local\n");
      await git(fixture, ["add", "local.txt"]);

      const result = await runStaged(fixture, [".", "--", "local-recorder"]);

      expect(result, formatCommandFailure("staged-run local executable", result)).toMatchObject({
        exitCode: 0,
        stderr: "",
      });
      expect(JSON.parse(result.stdout) as string[]).toEqual([
        path.join(await realpath(fixture.cwd), "local.txt"),
      ]);
    });
  },
  testTimeoutMs,
);

test(
  "interprets default and magic pathspecs from the invocation directory",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, "recorder.mjs", recorderScript);
      await writeFixture(fixture.cwd, "src/one.ts", "one\n");
      await writeFixture(fixture.cwd, "src/nested/two.ts", "two\n");
      await writeFixture(fixture.cwd, "other/three.ts", "three\n");
      await git(fixture, ["add", "."]);
      const invocationCwd = path.join(fixture.cwd, "src");
      const scriptPath = path.join(fixture.cwd, "recorder.mjs");
      const defaultResult = await runSm(["staged-run", "--", process.execPath, scriptPath], {
        cwd: invocationCwd,
        env: fixture.env,
      });

      expect(JSON.parse(defaultResult.stdout) as string[]).toEqual([
        path.join(await realpath(fixture.cwd), "src/nested/two.ts"),
        path.join(await realpath(fixture.cwd), "src/one.ts"),
      ]);

      const magicResult = await runSm(
        ["staged-run", ":(glob)nested/*.ts", "--", process.execPath, scriptPath],
        { cwd: invocationCwd, env: fixture.env },
      );

      expect(JSON.parse(magicResult.stdout) as string[]).toEqual([
        path.join(await realpath(fixture.cwd), "src/nested/two.ts"),
      ]);
    });
  },
  testTimeoutMs,
);

test(
  "runs recursively split argument chunks in order and rolls back a later chunk failure",
  async () => {
    await withGitFixture(async fixture => {
      for (const name of ["a.txt", "b.txt", "c.txt"]) {
        await writeFixture(fixture.cwd, name, `STAGED ${name}\n`);
      }

      await git(fixture, ["add", "a.txt", "b.txt", "c.txt"]);
      await writeFixture(
        fixture.cwd,
        "chunk.mjs",
        `
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const [log, failAt, ...files] = process.argv.slice(2);
for (const file of files) {
  const name = path.basename(file);
  await appendFile(log, name + "\\n");
  await writeFile(file, (await readFile(file, "utf8")).replace("STAGED", "FIXED"));
  if (name === failAt) process.exit(7);
}
`,
      );
      const logPath = path.join(fixture.cwd, "chunks.log");
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const splitEnv = {
        ...fixture.env,
        SM_STAGED_RUN_TEST_MAX_PATHS_PER_CHUNK: "1",
      };
      const failed = await runSm(
        ["staged-run", ".", "--", process.execPath, "chunk.mjs", logPath, "b.txt"],
        { cwd: fixture.cwd, env: splitEnv },
      );

      expect(failed.exitCode).toBe(7);
      expect(await readFile(logPath, "utf8")).toBe("a.txt\nb.txt\n");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "a.txt"), "utf8")).toBe("STAGED a.txt\n");

      await writeFile(logPath, "");
      const succeeded = await runSm(
        ["staged-run", ".", "--", process.execPath, "chunk.mjs", logPath, "never"],
        { cwd: fixture.cwd, env: splitEnv },
      );

      expect(succeeded.exitCode).toBe(0);
      expect(await readFile(logPath, "utf8")).toBe("a.txt\nb.txt\nc.txt\n");
      expect((await git(fixture, ["show", ":a.txt"])).stdout).toBe("FIXED a.txt");
      expect((await git(fixture, ["show", ":b.txt"])).stdout).toBe("FIXED b.txt");
      expect((await git(fixture, ["show", ":c.txt"])).stdout).toBe("FIXED c.txt");
    });
  },
  testTimeoutMs,
);

test(
  "preserves partially staged binary content while staging matched binary fixes",
  async () => {
    if (process.platform === "win32") {
      return;
    }

    await withGitFixture(async fixture => {
      const fullPath = path.join(fixture.cwd, "full.bin");
      const partialPath = path.join(fixture.cwd, "partial.bin");

      await writeFile(fullPath, Buffer.from([0, 66, 65, 83, 69]));
      await writeFile(partialPath, Buffer.from([0, 66, 65, 83, 69]));
      await git(fixture, ["add", "full.bin", "partial.bin"]);
      await git(fixture, ["commit", "-m", "binary base"]);
      await writeFile(fullPath, Buffer.from([0, 83, 84, 65, 71, 69, 68]));
      await writeFile(partialPath, Buffer.from([0, 83, 84, 65, 71, 69, 68]));
      await git(fixture, ["add", "full.bin", "partial.bin"]);
      const unstagedPartial = Buffer.from([0, 85, 78, 83, 84, 65, 71, 69, 68]);

      await writeFile(partialPath, unstagedPartial);
      await writeFixture(
        fixture.cwd,
        "binary-fix.mjs",
        `
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
for (const file of process.argv.slice(2)) {
  if (path.basename(file) === "full.bin") {
    await writeFile(file, Buffer.from([0, 70, 73, 88, 69, 68]));
  } else {
    await chmod(file, 0o755);
  }
}
`,
      );
      const result = await runStaged(fixture, ["*.bin", "--", process.execPath, "binary-fix.mjs"]);

      expect(result, formatCommandFailure("staged-run binary", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect((await git(fixture, ["show", ":full.bin"])).stdout).toBe("\0FIXED");
      expect((await git(fixture, ["show", ":partial.bin"])).stdout).toBe("\0STAGED");
      expect(await readFile(partialPath)).toEqual(unstagedPartial);
      expect((await git(fixture, ["ls-files", "--stage", "partial.bin"])).stdout).toMatch(
        /^100755 /u,
      );
    });
  },
  testTimeoutMs,
);

test(
  "leaves untracked and ignored child output outside both success and rollback",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, ".gitignore", "ignored.txt\n");
      await writeFixture(fixture.cwd, "tracked.txt", "base\n");
      await git(fixture, ["add", ".gitignore", "tracked.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "tracked.txt", "STAGED\n");
      await git(fixture, ["add", "tracked.txt"]);
      await writeFixture(
        fixture.cwd,
        "outside-scope.mjs",
        `
import { writeFile } from "node:fs/promises";
const [exitCode, untracked, ignored, ...files] = process.argv.slice(2);
await writeFile(untracked, "untracked child\\n");
await writeFile(ignored, "ignored child\\n");
for (const file of files) await writeFile(file, "FIXED\\n");
process.exit(Number(exitCode));
`,
      );
      const untrackedPath = path.join(fixture.cwd, "untracked.txt");
      const ignoredPath = path.join(fixture.cwd, "ignored.txt");
      const failed = await runStaged(fixture, [
        "tracked.txt",
        "--",
        process.execPath,
        "outside-scope.mjs",
        "5",
        untrackedPath,
        ignoredPath,
      ]);

      expect(failed.exitCode).toBe(5);
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"), "utf8")).toBe("STAGED\n");
      expect(await readFile(untrackedPath, "utf8")).toBe("untracked child\n");
      expect(await readFile(ignoredPath, "utf8")).toBe("ignored child\n");

      const succeeded = await runStaged(fixture, [
        "tracked.txt",
        "--",
        process.execPath,
        "outside-scope.mjs",
        "0",
        untrackedPath,
        ignoredPath,
      ]);

      expect(succeeded.exitCode).toBe(0);
      expect((await git(fixture, ["show", ":tracked.txt"])).stdout).toBe("FIXED");
      expect((await git(fixture, ["ls-files", "--", "untracked.txt", "ignored.txt"])).stdout).toBe(
        "",
      );
    });
  },
  testTimeoutMs,
);

test(
  "stages fixes and restores non-conflicting unstaged hunks, then rolls back child failure exactly",
  async () => {
    await withGitFixture(async fixture => {
      await commitFile(fixture, "partial.txt", "line one\nline two\nline three\n");
      await writeFixture(fixture.cwd, "fixer.mjs", fixerScript);
      await writeFixture(fixture.cwd, "partial.txt", "STAGED\nline two\nline three\n");
      await git(fixture, ["add", "--", "partial.txt"]);
      await writeFixture(fixture.cwd, "partial.txt", "STAGED\nline two\nUNSTAGED\n");

      const fixed = await runStaged(fixture, ["partial.txt", "--", process.execPath, "fixer.mjs"]);

      expect(fixed, formatCommandFailure("staged-run partial fix", fixed)).toMatchObject({
        exitCode: 0,
        stderr: "",
        stdout: "",
      });
      expect((await git(fixture, ["show", ":partial.txt"])).stdout).toBe(
        "FIXED\nline two\nline three",
      );
      expect(await readFile(path.join(fixture.cwd, "partial.txt"), "utf8")).toBe(
        "FIXED\nline two\nUNSTAGED\n",
      );

      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "partial.txt"));
      const failed = await runStaged(fixture, [
        "partial.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(3)",
      ]);

      expect(failed.exitCode).toBe(3);
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "partial.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "rolls back when a hidden hunk conflicts with a child fix",
  async () => {
    await withGitFixture(async fixture => {
      await commitFile(fixture, "conflict.txt", "base\n");
      await writeFixture(fixture.cwd, "fixer.mjs", fixerScript);
      await writeFixture(fixture.cwd, "conflict.txt", "STAGED\n");
      await git(fixture, ["add", "--", "conflict.txt"]);
      await writeFixture(fixture.cwd, "conflict.txt", "STAGED\nUNSTAGED\n");
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "conflict.txt"));

      const result = await runStaged(fixture, [
        "conflict.txt",
        "--",
        process.execPath,
        "fixer.mjs",
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unable to restore partially staged");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "conflict.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "hides unmatched partial files globally and leaves successful unmatched edits unstaged",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, "matched.txt", "a one\na two\na three\n");
      await writeFixture(fixture.cwd, "unmatched.txt", "b one\nb two\nb three\n");
      await git(fixture, ["add", "--", "matched.txt", "unmatched.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "matched.txt", "A-STAGED\na two\na three\n");
      await writeFixture(fixture.cwd, "unmatched.txt", "B-STAGED\nb two\nb three\n");
      await git(fixture, ["add", "--", "matched.txt", "unmatched.txt"]);
      await writeFixture(fixture.cwd, "unmatched.txt", "B-STAGED\nb two\nB-UNSTAGED\n");
      await writeFixture(
        fixture.cwd,
        "edit-unmatched.mjs",
        `
import { readFile, writeFile } from "node:fs/promises";
const [unmatched, ...matched] = process.argv.slice(2);
await writeFile(unmatched, (await readFile(unmatched, "utf8")).replace("B-STAGED", "B-CHILD"));
for (const file of matched) {
  await writeFile(file, (await readFile(file, "utf8")).replace("A-STAGED", "A-FIXED"));
}
`,
      );

      const result = await runStaged(fixture, [
        "matched.txt",
        "--",
        process.execPath,
        "edit-unmatched.mjs",
        path.join(fixture.cwd, "unmatched.txt"),
      ]);

      expect(result, formatCommandFailure("staged-run unmatched", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect((await git(fixture, ["show", ":matched.txt"])).stdout).toContain("A-FIXED");
      expect((await git(fixture, ["show", ":unmatched.txt"])).stdout).toContain("B-STAGED");
      expect(await readFile(path.join(fixture.cwd, "unmatched.txt"), "utf8")).toBe(
        "B-CHILD\nb two\nB-UNSTAGED\n",
      );
    });
  },
  testTimeoutMs,
);

test(
  "rejects direct child index mutation and restores the exact index",
  async () => {
    await withGitFixture(async fixture => {
      await commitFile(fixture, "tracked.txt", "base\n");
      await writeFixture(fixture.cwd, "tracked.txt", "staged\n");
      await git(fixture, ["add", "--", "tracked.txt"]);
      await writeFixture(
        fixture.cwd,
        "mutate-index.mjs",
        `
import { execFileSync } from "node:child_process";
import path from "node:path";
const relative = path.relative(process.cwd(), process.argv[2]);
execFileSync("git", ["update-index", "--chmod=+x", relative]);
`,
      );
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));

      const result = await runStaged(fixture, [
        "tracked.txt",
        "--",
        process.execPath,
        "mutate-index.mjs",
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("modified the active Git index");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"), "utf8")).toBe("staged\n");
    });
  },
  testTimeoutMs,
);

test(
  "rolls back an empty result unless --allow-empty is specified",
  async () => {
    await withGitFixture(async fixture => {
      await commitFile(fixture, "empty.txt", "base\n");
      await writeFixture(fixture.cwd, "empty.txt", "changed\n");
      await git(fixture, ["add", "--", "empty.txt"]);
      await writeFixture(
        fixture.cwd,
        "restore-head.mjs",
        `
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
for (const file of process.argv.slice(2)) {
  const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
  await writeFile(file, execFileSync("git", ["show", \`HEAD:\${relative}\`]));
}
`,
      );
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));

      const rejected = await runStaged(fixture, [
        "empty.txt",
        "--",
        process.execPath,
        "restore-head.mjs",
      ]);

      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.stderr).toContain("empty commit");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);

      const allowed = await runStaged(fixture, [
        "--allow-empty",
        "empty.txt",
        "--",
        process.execPath,
        "restore-head.mjs",
      ]);

      expect(allowed, formatCommandFailure("staged-run --allow-empty", allowed)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      const emptyDiff = await runCommand("git", ["diff", "--cached", "--quiet"], {
        cwd: fixture.cwd,
        env: fixture.env,
        timeoutMs: testTimeoutMs,
      });
      expect(emptyDiff.exitCode).toBe(0);
    });
  },
  testTimeoutMs,
);

test(
  "rejects unsupported index modes before mutating files",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, "intent.txt", "intent\n");
      await git(fixture, ["add", "-N", "--", "intent.txt"]);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));

      const intent = await runStaged(fixture, [
        "intent.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ]);

      expect(intent.exitCode).not.toBe(0);
      expect(intent.stderr).toContain("intent-to-add");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "intent.txt"), "utf8")).toBe("intent\n");
    });

    await withGitFixture(async fixture => {
      await commitFile(fixture, "skipped.txt", "base\n");
      await writeFixture(fixture.cwd, "candidate.txt", "candidate\n");
      await git(fixture, ["add", "--", "candidate.txt"]);
      await git(fixture, ["update-index", "--skip-worktree", "skipped.txt"]);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));

      const skipped = await runStaged(fixture, [
        "candidate.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ]);

      expect(skipped.exitCode).not.toBe(0);
      expect(skipped.stderr).toContain("skip-worktree");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
    });
  },
  testTimeoutMs,
);

test(
  "rejects sparse checkout, bare repositories, and unsupported Git versions before mutation",
  async () => {
    await withGitFixture(async fixture => {
      await writeFixture(fixture.cwd, "src/visible.txt", "base\n");
      await writeFixture(fixture.cwd, "outside.txt", "outside\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "sparse base"]);
      await git(fixture, ["sparse-checkout", "init", "--cone", "--sparse-index"]);
      await git(fixture, ["sparse-checkout", "set", "src"]);
      await writeFixture(fixture.cwd, "src/visible.txt", "candidate\n");
      await git(fixture, ["add", "src/visible.txt"]);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const sparse = await runStaged(fixture, [
        "src/visible.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ]);

      expect(sparse.exitCode).not.toBe(0);
      expect(sparse.stderr).toMatch(/sparse|skip-worktree/u);
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "src/visible.txt"), "utf8")).toBe("candidate\n");
    });

    await withGitFixture(async fixture => {
      const barePath = path.join(fixture.cwd, "bare.git");

      await git(fixture, ["init", "--bare", barePath]);
      const bare = await runSm(
        ["staged-run", ".", "--", process.execPath, "-e", "process.exit(0)"],
        { cwd: barePath, env: fixture.env },
      );

      expect(bare.exitCode).not.toBe(0);
      expect(bare.stderr).toContain("non-bare Git worktree");
    });

    if (process.platform !== "win32") {
      await withGitFixture(async fixture => {
        const fakeBin = path.join(fixture.cwd, "fake-bin");

        await writeFixture(fakeBin, "git", "#!/bin/sh\necho 'git version 2.31.9'\n");
        await chmod(path.join(fakeBin, "git"), 0o755);
        const oldGit = await runSm(
          ["staged-run", ".", "--", process.execPath, "-e", "process.exit(0)"],
          {
            cwd: fixture.cwd,
            env: {
              ...fixture.env,
              PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
            },
          },
        );

        expect(oldGit.exitCode).not.toBe(0);
        expect(oldGit.stderr).toContain("requires Git 2.32 or later");
      });
    }
  },
  testTimeoutMs,
);

test(
  "persists an interrupted transaction and performs reversible explicit recovery",
  async () => {
    if (process.platform === "win32") {
      return;
    }

    await withGitFixture(async fixture => {
      await commitFile(fixture, "recover.txt", "line one\nline two\nline three\n");
      await writeFixture(fixture.cwd, "recover.txt", "STAGED\nline two\nline three\n");
      await git(fixture, ["add", "--", "recover.txt"]);
      await writeFixture(fixture.cwd, "recover.txt", "STAGED\nline two\nUNSTAGED\n");
      await writeFixture(
        fixture.cwd,
        "kill-parent.mjs",
        `process.kill(process.ppid, "SIGKILL");\n`,
      );
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));

      const killed = await runStaged(fixture, [
        "recover.txt",
        "--",
        process.execPath,
        "kill-parent.mjs",
      ]);

      expect(killed.signal).toBe("SIGKILL");
      expect(await readFile(path.join(fixture.cwd, "recover.txt"), "utf8")).toBe(
        "STAGED\nline two\nline three\n",
      );

      const blocked = await runStaged(fixture, [
        "recover.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ]);
      expect(blocked.exitCode).not.toBe(0);
      expect(blocked.stderr).toContain("unfinished transaction");

      const listed = await runStaged(fixture, ["--list-recoveries"]);
      const recoveryId = listed.stdout.trim().split("\t")[0];

      expect(recoveryId).toMatch(/^[0-9a-f-]+$/u);
      const recovered = await runStaged(fixture, ["--recover", recoveryId]);
      const undoId = /Undo recovery: ([0-9a-f-]+)/u.exec(recovered.stdout)?.[1];

      expect(recovered, formatCommandFailure("staged-run recovery", recovered)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(undoId).toBeTruthy();
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "recover.txt"), "utf8")).toBe(
        "STAGED\nline two\nUNSTAGED\n",
      );

      const stillRunnable = await runStaged(fixture, [
        "recover.txt",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ]);
      expect(stillRunnable.exitCode).toBe(0);

      const missingForce = await runStaged(fixture, ["--discard-recovery", undoId ?? ""]);
      expect(missingForce.exitCode).not.toBe(0);
      const discarded = await runStaged(fixture, ["--discard-recovery", undoId ?? "", "--force"]);
      expect(discarded.exitCode).toBe(0);
      expect((await runStaged(fixture, ["--list-recoveries"])).stdout).toBe("");
    });
  },
  testTimeoutMs,
);
