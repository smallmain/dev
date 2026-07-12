import path from "node:path";
import { fileURLToPath } from "node:url";
import spawn, { SubprocessError } from "nano-spawn";

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const cliPath = path.join(repoRoot, "dist/npm/dev/bin/sm.js");
export const distDir = path.join(repoRoot, "dist/npm/dev");
export const oxlintBin = path.join(repoRoot, "node_modules/.bin/oxlint");
export const testTimeoutMs = 300_000;

export async function buildCli(): Promise<void> {
  const result = await runCommand("pnpm", ["build"], {
    cwd: repoRoot,
    timeoutMs: testTimeoutMs,
  });

  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(formatCommandFailure("pnpm build", result));
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CommandResult> {
  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, options.timeoutMs);

  try {
    const result = await spawn(command, args, {
      cwd: options.cwd,
      env: { CI: "1", ...options.env },
      signal: abortController.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      exitCode: 0,
      signal: null,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut,
    };
  } catch (error) {
    if (error instanceof SubprocessError) {
      return {
        exitCode: error.exitCode ?? null,
        signal: (error.signalName as NodeJS.Signals | undefined) ?? null,
        stdout: error.stdout,
        stderr: error.stderr,
        timedOut,
      };
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSm(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<CommandResult> {
  return runCommand(process.execPath, [cliPath, ...args], {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? testTimeoutMs,
  });
}

export function formatCommandFailure(command: string, result: CommandResult): string {
  return [
    `${command} failed.`,
    `exitCode: ${String(result.exitCode)}`,
    `signal: ${String(result.signal)}`,
    `timedOut: ${String(result.timedOut)}`,
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr,
  ].join("\n");
}

export function createGitEnv(homeDir: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...extra,
  };
}

export async function initGitRepo(cwd: string): Promise<NodeJS.ProcessEnv> {
  const env = createGitEnv(cwd);

  await runCommand("git", ["init"], { cwd, env, timeoutMs: testTimeoutMs });
  await runCommand("git", ["config", "user.email", "sm-test@example.com"], {
    cwd,
    env,
    timeoutMs: testTimeoutMs,
  });
  await runCommand("git", ["config", "user.name", "sm test"], {
    cwd,
    env,
    timeoutMs: testTimeoutMs,
  });
  await runCommand("git", ["config", "commit.gpgsign", "false"], {
    cwd,
    env,
    timeoutMs: testTimeoutMs,
  });

  return env;
}

export async function runOxlint(options: {
  configPath: string;
  cwd: string;
  fix?: boolean;
  targets: string[];
}): Promise<CommandResult> {
  return runCommand(
    oxlintBin,
    [
      "-c",
      options.configPath,
      "--disable-nested-config",
      "--format",
      "json",
      ...(options.fix === true ? ["--fix"] : []),
      ...options.targets,
    ],
    { cwd: options.cwd, timeoutMs: testTimeoutMs },
  );
}
