import { readCommandOutput, runCommand } from "./command-utils.ts";

interface RawStagedRunOptions {
  updateIndex?: boolean;
}

export async function runStagedRunCommand(
  command: string | undefined,
  globs: string[],
  options: RawStagedRunOptions,
): Promise<void> {
  if (!command || globs.length === 0) {
    throw new Error('Usage: sm staged-run "<command>" "<glob>" ["<glob>"...]');
  }

  const files = await getStagedFiles(globs);

  if (files.length === 0) {
    console.log(`Nothing staged for ${globs.join(" ")}`);
    return;
  }

  const [executable, ...commandArgs] = parseCommand(command);

  if (!executable) {
    throw new Error("Command is required.");
  }

  const args = [...commandArgs, "--", ...files];
  console.log(`${[executable, ...args].join(" ")}`);
  const result = await runCommand(executable, args);

  if (result.code !== 0) {
    process.exitCode = result.code;
    return;
  }

  if (options.updateIndex === true) {
    const updateIndexResult = await runCommand("git", ["update-index", "--again"]);

    if (updateIndexResult.code !== 0) {
      process.exitCode = updateIndexResult.code;
    }
  }
}

async function getStagedFiles(globs: string[]): Promise<string[]> {
  const output = await readCommandOutput("git", [
    "diff",
    "--staged",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
    "--",
    ...globs,
  ]);

  return output.split("\0").filter(Boolean);
}

function parseCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const character of command) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/u.test(character)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += "\\";
  }

  if (quote) {
    throw new Error("Unterminated quote in command.");
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}
