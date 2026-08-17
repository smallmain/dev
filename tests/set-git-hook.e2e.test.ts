import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  createGitEnv,
  formatCommandFailure,
  initGitRepo,
  runCommand,
  runSm,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

interface GitFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

async function withGitRepo(run: (fixture: GitFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-set-git-hook-e2e-"));
  let passed = false;

  try {
    const env = await initGitRepo(cwd);

    await run({ cwd, env });
    passed = true;
  } finally {
    await cleanup(cwd, passed);
  }
}

async function withBareDirectory(run: (fixture: GitFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-set-git-hook-e2e-"));
  let passed = false;

  try {
    await run({ cwd, env: createGitEnv(cwd) });
    passed = true;
  } finally {
    await cleanup(cwd, passed);
  }
}

async function cleanup(cwd: string, passed: boolean): Promise<void> {
  if (!passed || process.env.KEEP_TEST_TEMP === "1") {
    console.info(`Kept set-git-hook e2e temp directory: ${cwd}`);
    return;
  }

  await rm(cwd, { force: true, recursive: true });
}

async function setHooksPath(fixture: GitFixture, hooksPath: string): Promise<void> {
  await runCommand("git", ["config", "core.hooksPath", hooksPath], {
    cwd: fixture.cwd,
    env: fixture.env,
    timeoutMs: testTimeoutMs,
  });
}

test(
  "installs managed pre-commit and commit-msg hooks",
  async () => {
    await withGitRepo(async ({ cwd, env }) => {
      const result = await runSm(["set-git-hook"], { cwd, env });

      expect(result, formatCommandFailure("sm set-git-hook", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });

      const preCommit = await readFile(path.join(cwd, ".git/hooks/pre-commit"), "utf8");
      const commitMsg = await readFile(path.join(cwd, ".git/hooks/commit-msg"), "utf8");

      expect(preCommit).toContain("# sm managed pre-commit hook");
      expect(preCommit).toContain('sm staged-run "pnpm run check" "."');
      expect(commitMsg).toContain("# sm managed commit-msg hook");
      expect(commitMsg).toContain('sm check commit-message "$1"');
      expect(result.stdout).toContain("Installed");
    });
  },
  testTimeoutMs,
);

test(
  "skips installation when .git is absent",
  async () => {
    await withBareDirectory(async ({ cwd, env }) => {
      const result = await runSm(["set-git-hook"], { cwd, env });

      expect(result, formatCommandFailure("sm set-git-hook no-git", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(result.stdout).toContain(
        "Skipping Git hook installation because .git is not in the current directory.",
      );
    });
  },
  testTimeoutMs,
);

test(
  "overwrites unmanaged hooks by default",
  async () => {
    await withGitRepo(async ({ cwd, env }) => {
      await writeFile(path.join(cwd, ".git/hooks/pre-commit"), "#!/bin/sh\necho custom\n");
      await writeFile(path.join(cwd, ".git/hooks/commit-msg"), "#!/bin/sh\necho custom\n");

      const result = await runSm(["set-git-hook"], { cwd, env });

      expect(result, formatCommandFailure("sm set-git-hook", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });

      const preCommit = await readFile(path.join(cwd, ".git/hooks/pre-commit"), "utf8");
      const commitMsg = await readFile(path.join(cwd, ".git/hooks/commit-msg"), "utf8");

      expect(preCommit).toContain("# sm managed pre-commit hook");
      expect(commitMsg).toContain("# sm managed commit-msg hook");
      expect(preCommit).not.toContain("echo custom");
      expect(commitMsg).not.toContain("echo custom");
    });
  },
  testTimeoutMs,
);

test(
  "unsets core.hooksPath and installs hooks",
  async () => {
    for (const hooksPath of [".config/hooks", ".husky"]) {
      await withGitRepo(async fixture => {
        await setHooksPath(fixture, hooksPath);

        const result = await runSm(["set-git-hook"], { cwd: fixture.cwd, env: fixture.env });

        expect(result, formatCommandFailure(`sm set-git-hook ${hooksPath}`, result)).toMatchObject({
          exitCode: 0,
          timedOut: false,
        });

        const configuredHooksPath = await runCommand("git", ["config", "--get", "core.hooksPath"], {
          cwd: fixture.cwd,
          env: fixture.env,
          timeoutMs: testTimeoutMs,
        });
        const preCommit = await readFile(path.join(fixture.cwd, ".git/hooks/pre-commit"), "utf8");

        expect(configuredHooksPath.exitCode).not.toBe(0);
        expect(preCommit).toContain("# sm managed pre-commit hook");
      });
    }
  },
  testTimeoutMs,
);

test(
  "rejects the removed --force option",
  async () => {
    await withGitRepo(async ({ cwd, env }) => {
      const result = await runSm(["set-git-hook", "--force"], { cwd, env });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("unknown option '--force'");
    });
  },
  testTimeoutMs,
);
