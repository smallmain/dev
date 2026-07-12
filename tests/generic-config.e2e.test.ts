import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { distDir, repoRoot, runOxlint, testTimeoutMs } from "./cli-e2e-utils.ts";

const missingDescriptionMessage = "directive comment without a description";
const genericSpecifier = pathToFileURL(path.join(distDir, "oxlint/generic.js")).href;

interface GenericFixture {
  cwd: string;
}

async function withGenericFixture(run: (fixture: GenericFixture) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-generic-e2e-"));
  let passed = false;

  try {
    // Symlink the workspace dependencies so package-name plugins declared by the
    // generic config (for example `@e18e/eslint-plugin`) resolve during parsing.
    await symlink(
      path.join(repoRoot, "node_modules"),
      path.join(cwd, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await run({ cwd });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept generic e2e temp directory: ${cwd}`);
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

test(
  "extending the generic config loads its bundled JS plugins",
  async () => {
    await withGenericFixture(async ({ cwd }) => {
      await writeFixture(
        cwd,
        "oxlint.config.mjs",
        [
          `import generic from ${JSON.stringify(genericSpecifier)};`,
          "",
          "export default { extends: [generic] };",
          "",
        ].join("\n"),
      );
      await writeFixture(
        cwd,
        "src/missing.ts",
        ["/* oxlint-disable no-console */", "export const value = 1;", ""].join("\n"),
      );

      const run = await runOxlint({
        configPath: path.join(cwd, "oxlint.config.mjs"),
        cwd,
        targets: ["src/missing.ts"],
      });

      expect(
        `${run.stdout}${run.stderr}`,
        "the config must parse without rejecting relative JS plugin specifiers",
      ).not.toContain("Relative JS plugin");
      expect(run.exitCode, run.stdout || run.stderr).not.toBe(0);
      expect(run.stdout).toContain(missingDescriptionMessage);
    });
  },
  testTimeoutMs,
);
