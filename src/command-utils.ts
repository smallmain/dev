import { spawn } from "node:child_process";

export interface SpawnResult {
  code: number;
  signal: NodeJS.Signals | null;
}

export function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, ["--version"], {
      stdio: "ignore",
    });

    child.on("error", error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        resolve(false);
        return;
      }

      resolve(true);
    });
    child.on("exit", () => resolve(true));
  });
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; stdio?: "ignore" | "inherit" } = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

export function readCommandOutput(
  command: string,
  args: string[],
  options: { cwd?: string; stderr?: "ignore" | "inherit" } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", options.stderr ?? "inherit"],
    });

    child.stdout.on("data", chunk => chunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}.`));
    });
  });
}
