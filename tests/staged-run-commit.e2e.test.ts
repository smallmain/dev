import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

interface CommitFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

async function withCommitFixture(run: (fixture: CommitFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-staged-run-commit-e2e-"));
  let passed = false;

  try {
    const env = await initGitRepo(cwd);

    await run({ cwd, env });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept staged-run commit e2e temp directory: ${cwd}`);
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

async function git(fixture: CommitFixture, args: string[]): Promise<CommandResult> {
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

async function installDirectHook(fixture: CommitFixture): Promise<void> {
  await writeFixture(
    fixture.cwd,
    "fix-commit.mjs",
    `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2).filter(value => value !== "--")) {
  await writeFile(file, (await readFile(file, "utf8")).replace("NEEDS_FIX", "FIXED"));
}
`,
  );
  await writeFixture(
    fixture.cwd,
    ".git/hooks/pre-commit",
    `#!/bin/sh
exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} staged-run . -- ${shellQuote(process.execPath)} fix-commit.mjs
`,
  );
  await chmod(path.join(fixture.cwd, ".git/hooks/pre-commit"), 0o755);
}

test(
  "keeps HEAD, the real index, and the worktree synchronized for pathspec commits",
  async () => {
    await withCommitFixture(async fixture => {
      await writeFixture(fixture.cwd, "selected.txt", "base\nsecond\nthird\n");
      await writeFixture(fixture.cwd, "unrelated.txt", "unrelated base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      await installDirectHook(fixture);
      await writeFixture(fixture.cwd, "selected.txt", "NEEDS_FIX selected\nsecond\nthird\n");
      await writeFixture(fixture.cwd, "unrelated.txt", "unrelated staged\n");
      await git(fixture, ["add", "selected.txt", "unrelated.txt"]);
      await writeFixture(fixture.cwd, "selected.txt", "NEEDS_FIX selected\nsecond\nUNSTAGED\n");

      await git(fixture, ["commit", "-m", "selected", "--", "selected.txt"]);

      expect((await git(fixture, ["show", "HEAD:selected.txt"])).stdout).toBe(
        "FIXED selected\nsecond\nUNSTAGED",
      );
      expect((await git(fixture, ["show", ":selected.txt"])).stdout).toBe(
        "FIXED selected\nsecond\nUNSTAGED",
      );
      expect(await readFile(path.join(fixture.cwd, "selected.txt"), "utf8")).toBe(
        "FIXED selected\nsecond\nUNSTAGED\n",
      );
      expect((await git(fixture, ["show", ":unrelated.txt"])).stdout).toBe("unrelated staged");
      expect((await git(fixture, ["status", "--short", "selected.txt"])).stdout).toBe("");
    });
  },
  testTimeoutMs,
);

test(
  "supports default commits and commit -a candidate indexes",
  async () => {
    await withCommitFixture(async fixture => {
      await writeFixture(fixture.cwd, "tracked.txt", "base\nsecond\nthird\n");
      await git(fixture, ["add", "tracked.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await installDirectHook(fixture);

      await writeFixture(fixture.cwd, "tracked.txt", "NEEDS_FIX default\nsecond\nthird\n");
      await git(fixture, ["add", "tracked.txt"]);
      await writeFixture(fixture.cwd, "tracked.txt", "NEEDS_FIX default\nsecond\nUNSTAGED\n");
      await git(fixture, ["commit", "-m", "default"]);
      expect((await git(fixture, ["show", "HEAD:tracked.txt"])).stdout).toBe(
        "FIXED default\nsecond\nthird",
      );
      expect((await git(fixture, ["show", ":tracked.txt"])).stdout).toBe(
        "FIXED default\nsecond\nthird",
      );
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"), "utf8")).toBe(
        "FIXED default\nsecond\nUNSTAGED\n",
      );
      expect((await git(fixture, ["status", "--short", "tracked.txt"])).stdout).toBe(
        " M tracked.txt",
      );

      await writeFixture(fixture.cwd, "tracked.txt", "NEEDS_FIX all\n");
      await git(fixture, ["commit", "-am", "all"]);
      expect((await git(fixture, ["show", "HEAD:tracked.txt"])).stdout).toBe("FIXED all");
      expect((await git(fixture, ["show", ":tracked.txt"])).stdout).toBe("FIXED all");
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"), "utf8")).toBe("FIXED all\n");
      expect((await git(fixture, ["status", "--short", "tracked.txt"])).stdout).toBe("");
    });
  },
  testTimeoutMs,
);

test(
  "rolls back child and parent-index-lock failures during real commits",
  async () => {
    await withCommitFixture(async fixture => {
      await writeFixture(fixture.cwd, "selected.txt", "base\n");
      await writeFixture(fixture.cwd, "unrelated.txt", "unrelated base\n");
      await git(fixture, ["add", "."]);
      await git(fixture, ["commit", "-m", "base"]);
      await installDirectHook(fixture);
      await writeFixture(fixture.cwd, "selected.txt", "NEEDS_FIX selected\n");
      await writeFixture(fixture.cwd, "unrelated.txt", "unrelated staged\n");
      await git(fixture, ["add", "selected.txt", "unrelated.txt"]);
      const headBefore = (await git(fixture, ["rev-parse", "HEAD"])).stdout;
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "selected.txt"));
      const parentLockFailure = await runCommand(
        "git",
        ["commit", "-m", "must abort", "--", "selected.txt"],
        {
          cwd: fixture.cwd,
          env: { ...fixture.env, SM_STAGED_RUN_TEST_FAULT: "after-stage-parent" },
          timeoutMs: testTimeoutMs,
        },
      );

      expect(parentLockFailure.exitCode).not.toBe(0);
      expect(parentLockFailure.stderr).toContain(
        "Injected staged-run test fault: after-stage-parent",
      );
      expect((await git(fixture, ["rev-parse", "HEAD"])).stdout).toBe(headBefore);
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "selected.txt"))).toEqual(worktreeBefore);

      await writeFixture(
        fixture.cwd,
        ".git/hooks/pre-commit",
        `#!/bin/sh
exec ${shellQuote(process.execPath)} ${shellQuote(cliPath)} staged-run . -- ${shellQuote(process.execPath)} -e 'process.exit(9)'
`,
      );
      await chmod(path.join(fixture.cwd, ".git/hooks/pre-commit"), 0o755);
      const childFailure = await runCommand(
        "git",
        ["commit", "-m", "must also abort", "--", "selected.txt"],
        {
          cwd: fixture.cwd,
          env: fixture.env,
          timeoutMs: testTimeoutMs,
        },
      );

      expect(childFailure.exitCode).not.toBe(0);
      expect((await git(fixture, ["rev-parse", "HEAD"])).stdout).toBe(headBefore);
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "selected.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "executes the generated pnpm pre-commit hook with the new staged-run syntax",
  async () => {
    await withCommitFixture(async fixture => {
      await writeFixture(
        fixture.cwd,
        "package.json",
        `${JSON.stringify(
          {
            devEngines: { packageManager: { name: "pnpm" } },
            scripts: { check: `${process.execPath} check-fix.mjs` },
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(
        fixture.cwd,
        "check-fix.mjs",
        `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2).filter(value => value !== "--")) {
  await writeFile(file, (await readFile(file, "utf8")).replace("NEEDS_FIX", "FIXED"));
}
`,
      );
      await mkdir(path.join(fixture.cwd, "node_modules/.bin"), { recursive: true });
      await symlink(cliPath, path.join(fixture.cwd, "node_modules/.bin/sm"));
      const hookResult = await runSm(["set-git-hook"], { cwd: fixture.cwd, env: fixture.env });

      expect(hookResult, formatCommandFailure("sm set-git-hook", hookResult)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(await readFile(path.join(fixture.cwd, ".git/hooks/pre-commit"), "utf8")).toContain(
        "sm staged-run . -- pnpm run check --",
      );

      await writeFixture(fixture.cwd, "generated.txt", "NEEDS_FIX generated\n");
      await git(fixture, ["add", "generated.txt"]);
      await git(fixture, ["commit", "-m", "feat: generated hook"]);
      expect((await git(fixture, ["show", "HEAD:generated.txt"])).stdout).toBe("FIXED generated");
      expect((await git(fixture, ["status", "--short", "generated.txt"])).stdout).toBe("");
    });
  },
  testTimeoutMs,
);

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
