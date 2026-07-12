import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
  formatCommandFailure,
  initGitRepo,
  runCommand,
  runSm,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const recorderScript = `process.stdout.write(\`RECORDER_ARGS \${JSON.stringify(process.argv.slice(2))}\\n\`);\n`;
const failScript = "process.exit(3);\n";

interface StagedRunFixture {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

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

async function gitAdd(fixture: StagedRunFixture, files: string[]): Promise<void> {
  await runCommand("git", ["add", ...files], {
    cwd: fixture.cwd,
    env: fixture.env,
    timeoutMs: testTimeoutMs,
  });
}

function nodeCommand(scriptRelativePath: string): string {
  return `"${process.execPath}" ${scriptRelativePath}`;
}

test(
  "reports a usage error when the command or globs are missing",
  async () => {
    await withGitFixture(async ({ cwd, env }) => {
      const result = await runSm(["staged-run"], { cwd, env });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Usage: sm staged-run "<command>" "<glob>"');
    });
  },
  testTimeoutMs,
);

test(
  "prints nothing staged when no files match the globs",
  async () => {
    await withGitFixture(async ({ cwd, env }) => {
      await writeFixture(cwd, "recorder.mjs", recorderScript);

      const result = await runSm(["staged-run", nodeCommand("recorder.mjs"), "."], { cwd, env });

      expect(result, formatCommandFailure("sm staged-run nothing", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(result.stdout).toContain("Nothing staged for .");
      expect(result.stdout).not.toContain("RECORDER_ARGS");
    });
  },
  testTimeoutMs,
);

test(
  "appends staged files to the command and runs it",
  async () => {
    await withGitFixture(async fixture => {
      const { cwd, env } = fixture;

      await writeFixture(cwd, "recorder.mjs", recorderScript);
      await writeFixture(cwd, "src/a.ts", "export const a = 1;\n");
      await writeFixture(cwd, "src/b.ts", "export const b = 2;\n");
      await gitAdd(fixture, ["src/a.ts", "src/b.ts"]);

      const result = await runSm(["staged-run", nodeCommand("recorder.mjs"), "."], { cwd, env });

      expect(result, formatCommandFailure("sm staged-run append", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(result.stdout).toContain("RECORDER_ARGS");
      expect(result.stdout).toContain("src/a.ts");
      expect(result.stdout).toContain("src/b.ts");
    });
  },
  testTimeoutMs,
);

test(
  "propagates a non-zero exit code from the command",
  async () => {
    await withGitFixture(async fixture => {
      const { cwd, env } = fixture;

      await writeFixture(cwd, "fail.mjs", failScript);
      await writeFixture(cwd, "src/c.ts", "export const c = 3;\n");
      await gitAdd(fixture, ["src/c.ts"]);

      const result = await runSm(["staged-run", nodeCommand("fail.mjs"), "."], { cwd, env });

      expect(result.exitCode).toBe(3);
    });
  },
  testTimeoutMs,
);

test(
  "runs update-index again after success when --update-index is set",
  async () => {
    await withGitFixture(async fixture => {
      const { cwd, env } = fixture;

      await writeFixture(cwd, "recorder.mjs", recorderScript);
      await writeFixture(cwd, "src/tracked.ts", "export const tracked = 1;\n");
      await gitAdd(fixture, ["src/tracked.ts"]);
      await runCommand("git", ["commit", "-m", "init"], { cwd, env, timeoutMs: testTimeoutMs });
      await writeFixture(cwd, "src/tracked.ts", "export const tracked = 2;\n");
      await gitAdd(fixture, ["src/tracked.ts"]);

      const result = await runSm(
        ["staged-run", nodeCommand("recorder.mjs"), ".", "--update-index"],
        { cwd, env },
      );

      expect(result, formatCommandFailure("sm staged-run --update-index", result)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(result.stdout).toContain("RECORDER_ARGS");
    });
  },
  testTimeoutMs,
);
