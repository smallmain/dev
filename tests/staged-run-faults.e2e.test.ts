import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

interface FaultFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

async function withFaultFixture(run: (fixture: FaultFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-staged-run-fault-e2e-"));
  let passed = false;

  try {
    const env = await initGitRepo(cwd);

    await run({ cwd, env });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept staged-run fault e2e temp directory: ${cwd}`);
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

async function git(fixture: FaultFixture, args: string[]): Promise<CommandResult> {
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

async function preparePartialFixture(fixture: FaultFixture): Promise<void> {
  await writeFixture(fixture.cwd, "tracked.txt", "line one\nline two\nline three\n");
  await git(fixture, ["add", "tracked.txt"]);
  await git(fixture, ["commit", "-m", "base"]);
  await writeFixture(fixture.cwd, "tracked.txt", "STAGED\nline two\nline three\n");
  await git(fixture, ["add", "tracked.txt"]);
  await writeFixture(fixture.cwd, "tracked.txt", "STAGED\nline two\nUNSTAGED\n");
  await writeFixture(
    fixture.cwd,
    "fix.mjs",
    `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  await writeFile(file, (await readFile(file, "utf8")).replace("STAGED", "FIXED"));
}
`,
  );
}

test.each([
  "after-manifest",
  "after-backup",
  "manifest-transition",
  "after-hide",
  "after-task",
  "after-stage-active",
  "before-restore",
  "restore-three-way",
  "before-verify",
  "after-verify",
])("rolls back an injected %s transaction fault", async fault => {
  await withFaultFixture(async fixture => {
    await preparePartialFixture(fixture);
    const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
    const worktreeBefore = await readFile(path.join(fixture.cwd, "tracked.txt"));
    const result = await runSm(["staged-run", "tracked.txt", "--", process.execPath, "fix.mjs"], {
      cwd: fixture.cwd,
      env: { ...fixture.env, SM_STAGED_RUN_TEST_FAULT: fault },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(`Injected staged-run test fault: ${fault}`);
    expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
    expect(await readFile(path.join(fixture.cwd, "tracked.txt"))).toEqual(worktreeBefore);
    expect(
      (await runSm(["staged-run", "--list-recoveries"], { cwd: fixture.cwd, env: fixture.env }))
        .stdout,
    ).toBe("");
  });
});

test(
  "rolls back a failure in the normal worktree-only patch restore",
  async () => {
    await withFaultFixture(async fixture => {
      await preparePartialFixture(fixture);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "tracked.txt"));
      const result = await runSm(
        ["staged-run", "tracked.txt", "--", process.execPath, "-e", "process.exit(0)"],
        {
          cwd: fixture.cwd,
          env: { ...fixture.env, SM_STAGED_RUN_TEST_FAULT: "restore-normal" },
        },
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Injected staged-run test fault: restore-normal");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "rolls back child launch failure without hiding the launch diagnostic",
  async () => {
    await withFaultFixture(async fixture => {
      await preparePartialFixture(fixture);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "tracked.txt"));
      const result = await runSm(
        ["staged-run", "tracked.txt", "--", "sm-command-that-does-not-exist"],
        { cwd: fixture.cwd, env: fixture.env },
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unable to run the staged-run child command");
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"))).toEqual(worktreeBefore);
    });
  },
  testTimeoutMs,
);

test(
  "retains a recovery after rollback failure and restores it explicitly",
  async () => {
    await withFaultFixture(async fixture => {
      await preparePartialFixture(fixture);
      const indexBefore = await readFile(path.join(fixture.cwd, ".git/index"));
      const worktreeBefore = await readFile(path.join(fixture.cwd, "tracked.txt"));
      const failed = await runSm(["staged-run", "tracked.txt", "--", process.execPath, "fix.mjs"], {
        cwd: fixture.cwd,
        env: {
          ...fixture.env,
          SM_STAGED_RUN_TEST_FAULT: "after-hide,rollback",
        },
      });

      expect(failed.exitCode).not.toBe(0);
      expect(failed.stderr).toContain("could not fully roll back");
      const listed = await runSm(["staged-run", "--list-recoveries"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const recoveryId = listed.stdout.trim().split("\t")[0];

      expect(recoveryId).toBeTruthy();
      const recovered = await runSm(["staged-run", "--recover", recoveryId], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const undoId = /Undo recovery: ([0-9a-f-]+)/u.exec(recovered.stdout)?.[1];

      expect(recovered.exitCode).toBe(0);
      expect(await readFile(path.join(fixture.cwd, ".git/index"))).toEqual(indexBefore);
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"))).toEqual(worktreeBefore);
      expect(undoId).toBeTruthy();
      expect(
        (
          await runSm(["staged-run", "--discard-recovery", undoId ?? "", "--force"], {
            cwd: fixture.cwd,
            env: fixture.env,
          })
        ).exitCode,
      ).toBe(0);
    });
  },
  testTimeoutMs,
);

test.each(["cleanup", "release-lock"])(
  "keeps committed user state when %s fails and cleanup-only is recovered",
  async fault => {
    await withFaultFixture(async fixture => {
      await writeFixture(fixture.cwd, "tracked.txt", "base\n");
      await git(fixture, ["add", "tracked.txt"]);
      await git(fixture, ["commit", "-m", "base"]);
      await writeFixture(fixture.cwd, "tracked.txt", "STAGED\n");
      await git(fixture, ["add", "tracked.txt"]);
      await writeFixture(
        fixture.cwd,
        "fix.mjs",
        `
import { readFile, writeFile } from "node:fs/promises";
for (const file of process.argv.slice(2)) {
  await writeFile(file, (await readFile(file, "utf8")).replace("STAGED", "FIXED"));
}
`,
      );

      const failed = await runSm(["staged-run", "tracked.txt", "--", process.execPath, "fix.mjs"], {
        cwd: fixture.cwd,
        env: { ...fixture.env, SM_STAGED_RUN_TEST_FAULT: fault },
      });

      expect(failed.exitCode).not.toBe(0);
      expect(failed.stderr).toContain("could not clean private data");
      expect((await git(fixture, ["show", ":tracked.txt"])).stdout).toBe("FIXED");
      expect(await readFile(path.join(fixture.cwd, "tracked.txt"), "utf8")).toBe("FIXED\n");

      const listed = await runSm(["staged-run", "--list-recoveries"], {
        cwd: fixture.cwd,
        env: fixture.env,
      });
      const [recoveryId, , phase] = listed.stdout.trim().split("\t");

      expect(phase).toBe("cleanup-only");
      const recovered = await runSm(["staged-run", "--recover", recoveryId], {
        cwd: fixture.cwd,
        env: fixture.env,
      });

      expect(recovered.exitCode).toBe(0);
      expect((await git(fixture, ["show", ":tracked.txt"])).stdout).toBe("FIXED");
      expect(
        (await runSm(["staged-run", "--list-recoveries"], { cwd: fixture.cwd, env: fixture.env }))
          .stdout,
      ).toBe("");
    });
  },
  testTimeoutMs,
);
