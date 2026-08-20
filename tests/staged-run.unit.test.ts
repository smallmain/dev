import { describe, expect, test } from "vitest";

const builtModuleRoot = "../dist/npm/dev/cli/staged-run";
const { parseStagedRunArguments, StagedRunUsageError } = (await import(
  `${builtModuleRoot}/args.js`
)) as typeof import("../src/staged-run/args.ts");
const { parseGitVersion, parseRawDiff } = (await import(
  `${builtModuleRoot}/git.js`
)) as typeof import("../src/staged-run/git.ts");
const { getSignalExitCode, runWithArgumentSplitting } = (await import(
  `${builtModuleRoot}/runner.js`
)) as typeof import("../src/staged-run/runner.ts");
const { assertTransactionPhaseTransition } = (await import(
  `${builtModuleRoot}/transaction.js`
)) as typeof import("../src/staged-run/transaction.ts");

describe("staged-run argument parsing", () => {
  test("uses the default pathspec and passes child argv through unchanged", () => {
    expect(parseStagedRunArguments(["--", "pnpm", "run", "check", "--", "--fix=false"])).toEqual({
      allowEmpty: false,
      args: ["run", "check", "--", "--fix=false"],
      command: "pnpm",
      kind: "task",
      pathspecs: ["."],
    });
  });

  test("parses pathspecs and --allow-empty only before the separator", () => {
    expect(
      parseStagedRunArguments([
        "--allow-empty",
        "src",
        ":(glob)tests/**/*.ts",
        "--",
        "tool",
        "--allow-empty",
      ]),
    ).toEqual({
      allowEmpty: true,
      args: ["--allow-empty"],
      command: "tool",
      kind: "task",
      pathspecs: ["src", ":(glob)tests/**/*.ts"],
    });
  });

  test("parses recovery management commands strictly", () => {
    expect(parseStagedRunArguments(["--list-recoveries"])).toEqual({ kind: "list" });
    expect(parseStagedRunArguments(["--recover", "abc-123"])).toEqual({
      id: "abc-123",
      kind: "recover",
    });
    expect(parseStagedRunArguments(["--discard-recovery", "abc-123", "--force"])).toEqual({
      force: true,
      id: "abc-123",
      kind: "discard",
    });
  });

  test.each([
    { args: [] },
    { args: ["command-without-separator"] },
    { args: ["--"] },
    { args: ["--allow-empty", "--allow-empty", "--", "tool"] },
    { args: ["--discard-recovery", "abc-123"] },
  ])("rejects invalid input %#", ({ args }) => {
    expect(() => parseStagedRunArguments(args)).toThrow(StagedRunUsageError);
  });
});

describe("staged-run Git protocol parsing", () => {
  test("parses ordinary, copy, and rename raw diff records using destination paths", () => {
    const zero = "0".repeat(40);
    const oid = "1".repeat(40);
    const output = [
      `:000000 100644 ${zero} ${oid} A`,
      "space name.txt",
      `:100644 100755 ${oid} ${oid} C87`,
      "old-copy.txt",
      "new-copy.txt",
      `:100644 100644 ${oid} ${oid} R100`,
      "old-name.txt",
      "new-name.txt",
      "",
    ].join("\0");

    expect(parseRawDiff(output)).toEqual([
      { newMode: "100644", path: "space name.txt", status: "A" },
      { newMode: "100755", path: "new-copy.txt", status: "C" },
      { newMode: "100644", path: "new-name.txt", status: "R" },
    ]);
  });

  test("parses vendor-suffixed Git versions", () => {
    expect(parseGitVersion("git version 2.32.0.windows.1")).toEqual([2, 32]);
    expect(parseGitVersion("git version 2.50.1 (Apple Git-155)")).toEqual([2, 50]);
    expect(() => parseGitVersion("unknown")).toThrow("Unable to parse Git version");
  });
});

test("accepts only forward transaction phase transitions", () => {
  for (const [current, next] of [
    ["preparing", "backed-up"],
    ["backed-up", "hiding"],
    ["backed-up", "hidden"],
    ["hiding", "hidden"],
    ["hidden", "running"],
    ["running", "staging"],
    ["staging", "restoring"],
    ["restoring", "verifying"],
    ["verifying", "committed"],
  ] as const) {
    expect(() => assertTransactionPhaseTransition(current, next)).not.toThrow();
  }

  expect(() => assertTransactionPhaseTransition("running", "committed")).toThrow(
    "running -> committed",
  );
  expect(() => assertTransactionPhaseTransition("committed", "restoring")).toThrow(
    "committed -> restoring",
  );
});

test("maps handled signals to conventional shell exit codes", () => {
  expect(getSignalExitCode("SIGINT")).toBe(130);
  expect(getSignalExitCode("SIGTERM")).toBe(143);
});

test("recursively bisects E2BIG chunks and keeps their execution sequential", async () => {
  const completed: string[][] = [];
  let active = 0;
  let maximumActive = 0;

  const result = await runWithArgumentSplitting(["a", "b", "c", "d"], async chunk => {
    if (chunk.length > 1) {
      return { launchError: Object.assign(new Error("too long"), { code: "E2BIG" }) };
    }

    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await Promise.resolve();
    completed.push(chunk);
    active -= 1;
    return undefined;
  });

  expect(result).toBeUndefined();
  expect(completed).toEqual([["a"], ["b"], ["c"], ["d"]]);
  expect(maximumActive).toBe(1);
});

test("returns an irreducible single-path E2BIG error", async () => {
  const launchError = Object.assign(new Error("too long"), { code: "E2BIG" });

  await expect(runWithArgumentSplitting(["only"], async () => ({ launchError }))).resolves.toEqual({
    launchError,
  });
});
