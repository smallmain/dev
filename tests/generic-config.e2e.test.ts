import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import {
  distDir,
  formatCommandFailure,
  parseOxlintReport,
  repoRoot,
  runOxlint,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const genericSpecifier = pathToFileURL(path.join(distDir, "oxlint/generic.js")).href;
const stylelintGenericSpecifier = pathToFileURL(path.join(distDir, "stylelint/generic.js")).href;

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

test("the generic entry point exports the Next.js configuration", async () => {
  const genericModule = await import(genericSpecifier);

  expect(genericModule.nextjs).toBeDefined();
});

test("the generic Stylelint entry point exports project ignore patterns", async () => {
  const genericModule = await import(stylelintGenericSpecifier);

  expect(genericModule.genericIgnoreFiles).toEqual([
    "**/node_modules/**",
    "**/coverage/**",
    "**/dist/**",
    "**/out-tsc/**",
    "**/temp/**",
    "**/tmp/**",
    "**/vendor/**",
    "**/*.min.css",
  ]);
});

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

      expect(run.timedOut, formatCommandFailure("oxlint --format json", run)).toBe(false);
      expect(run.exitCode, formatCommandFailure("oxlint --format json", run)).not.toBe(0);
      const report = parseOxlintReport(run);

      expect(report.number_of_files).toBe(1);
      expect(report.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "comments(require-description)",
            filename: "src/missing.ts",
            severity: "error",
          }),
        ]),
      );
    });
  },
  testTimeoutMs,
);
