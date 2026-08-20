import type { StagedRunRequest } from "./types.ts";

export const stagedRunUsage = `Usage:
  sm staged-run [--allow-empty] [pathspec...] -- <command> [args...]
  sm staged-run --list-recoveries
  sm staged-run --recover <id>
  sm staged-run --discard-recovery <id> --force`;

export class StagedRunUsageError extends Error {}

export function parseStagedRunArguments(args: string[]): StagedRunRequest {
  if (args.length === 1 && args[0] === "--list-recoveries") {
    return { kind: "list" };
  }

  if (args[0] === "--recover") {
    if (args.length !== 2 || !args[1]) {
      throw usageError("--recover requires exactly one recovery id.");
    }

    return { id: args[1], kind: "recover" };
  }

  if (args[0] === "--discard-recovery") {
    if (args.length !== 3 || !args[1] || args[2] !== "--force") {
      throw usageError("--discard-recovery requires one recovery id and --force.");
    }

    return { force: true, id: args[1], kind: "discard" };
  }

  const separatorIndex = args.indexOf("--");

  if (separatorIndex < 0) {
    throw usageError("A -- separator and child command are required.");
  }

  const stagedRunArgs = args.slice(0, separatorIndex);
  const childArgs = args.slice(separatorIndex + 1);

  if (!childArgs[0]) {
    throw usageError("A child command is required after --.");
  }

  let allowEmpty = false;
  const pathspecs: string[] = [];

  for (const argument of stagedRunArgs) {
    if (argument === "--allow-empty") {
      if (allowEmpty) {
        throw usageError("--allow-empty may be specified only once.");
      }

      allowEmpty = true;
      continue;
    }

    if (argument.startsWith("--")) {
      throw usageError(`Unknown staged-run option: ${argument}`);
    }

    pathspecs.push(argument);
  }

  return {
    allowEmpty,
    args: childArgs.slice(1),
    command: childArgs[0],
    kind: "task",
    pathspecs: pathspecs.length === 0 ? ["."] : pathspecs,
  };
}

function usageError(message: string): StagedRunUsageError {
  return new StagedRunUsageError(`${message}\n${stagedRunUsage}`);
}
