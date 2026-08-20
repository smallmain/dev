import type { ChildProcess } from "node:child_process";
import { constants } from "node:os";
import spawn, { SubprocessError } from "nano-spawn";
import { getStagedRunTestMaxPathsPerChunk } from "./faults.ts";
import type { StagedRunTaskRequest, TaskResult } from "./types.ts";

const handledSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export class InterruptedError extends Error {
  readonly signal: NodeJS.Signals;

  constructor(signal: NodeJS.Signals) {
    super(`staged-run was interrupted by ${signal}.`);
    this.signal = signal;
  }
}

export class InterruptionController {
  private child?: ChildProcess;
  private requestedSignal?: NodeJS.Signals;
  private readonly handlers = new Map<NodeJS.Signals, () => void>();

  start(): void {
    for (const signal of handledSignals) {
      const handler = (): void => {
        this.requestedSignal ??= signal;
        this.killChild(signal);
      };

      this.handlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  stop(): void {
    for (const [signal, handler] of this.handlers) {
      process.off(signal, handler);
    }

    this.handlers.clear();
    this.child = undefined;
  }

  attach(child: ChildProcess): void {
    this.child = child;

    if (this.requestedSignal) {
      this.killChild(this.requestedSignal);
    }
  }

  detach(child: ChildProcess | undefined): void {
    if (this.child === child) {
      this.child = undefined;
    }
  }

  throwIfInterrupted(): void {
    if (this.requestedSignal) {
      throw new InterruptedError(this.requestedSignal);
    }
  }

  get signal(): NodeJS.Signals | undefined {
    return this.requestedSignal;
  }

  private killChild(signal: NodeJS.Signals): void {
    const child = this.child;

    if (!child?.pid) {
      return;
    }

    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // Fall back to the direct child when process-group signaling is unavailable.
      }
    }

    child.kill(signal);
  }
}

export async function runTaskWithArgumentSplitting(
  request: StagedRunTaskRequest,
  paths: string[],
  cwd: string,
  interruption: InterruptionController,
  afterChunk: () => Promise<void>,
): Promise<TaskResult> {
  const result = await runWithArgumentSplitting(paths, chunk =>
    runChunk(request, chunk, cwd, interruption, afterChunk),
  );

  return result ?? { code: 0 };
}

export async function runWithArgumentSplitting(
  paths: string[],
  execute: (chunk: string[]) => Promise<TaskResult | undefined>,
): Promise<TaskResult | undefined> {
  const result = await execute(paths);

  if (!result?.launchError || !isArgumentListTooLong(result.launchError) || paths.length <= 1) {
    return result;
  }

  const middle = Math.floor(paths.length / 2);
  const leftResult = await runWithArgumentSplitting(paths.slice(0, middle), execute);

  if (leftResult) {
    return leftResult;
  }

  return runWithArgumentSplitting(paths.slice(middle), execute);
}

export function getSignalExitCode(signal: NodeJS.Signals): number {
  return 128 + (constants.signals[signal] ?? 1);
}

async function runChunk(
  request: StagedRunTaskRequest,
  paths: string[],
  cwd: string,
  interruption: InterruptionController,
  afterChunk: () => Promise<void>,
): Promise<TaskResult | undefined> {
  interruption.throwIfInterrupted();
  const testMaxPaths = getStagedRunTestMaxPathsPerChunk();

  if (testMaxPaths !== undefined && paths.length > testMaxPaths) {
    return {
      launchError: Object.assign(new Error("Injected E2BIG for staged-run tests."), {
        code: "E2BIG",
      }),
    };
  }

  const subprocess = spawn(request.command, [...request.args, ...paths], {
    cwd,
    detached: process.platform !== "win32",
    preferLocal: true,
    stdio: "inherit",
  });
  let child: ChildProcess | undefined;
  const attach = subprocess.nodeChildProcess
    .then(instance => {
      child = instance;
      interruption.attach(instance);
    })
    .catch(() => undefined);

  try {
    await subprocess;
    await attach;
  } catch (error) {
    await attach;

    if (error instanceof InterruptedError) {
      return { signal: error.signal };
    }

    if (error instanceof SubprocessError) {
      if (error.signalName) {
        return { signal: error.signalName as NodeJS.Signals };
      }

      if (error.exitCode !== undefined) {
        return { code: error.exitCode };
      }
    }

    return {
      launchError: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    interruption.detach(child);
  }

  try {
    interruption.throwIfInterrupted();
    await afterChunk();
    return undefined;
  } catch (error) {
    if (error instanceof InterruptedError) {
      return { signal: error.signal };
    }

    return { internalError: error instanceof Error ? error : new Error(String(error)) };
  }
}

function isArgumentListTooLong(error: unknown): boolean {
  let current: unknown = error;

  while (current instanceof Error) {
    if ((current as NodeJS.ErrnoException).code === "E2BIG") {
      return true;
    }

    current = current.cause;
  }

  return false;
}
