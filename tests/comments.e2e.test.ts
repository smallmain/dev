import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import {
  distDir,
  formatCommandFailure,
  parseOxlintReport,
  runOxlint,
  testTimeoutMs,
} from "./cli-e2e-utils.ts";

const pluginPath = path.join(distDir, "oxlint/plugins/comments.js");
const ruleCode = "comments(require-description)";

interface CommentsFixture {
  cwd: string;
}

async function withCommentsFixture(
  run: (fixture: CommentsFixture) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(tmpdir(), "sm-comments-e2e-"));
  let passed = false;

  try {
    await run({ cwd });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept comments e2e temp directory: ${cwd}`);
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

async function writeConfig(
  cwd: string,
  relativePath: string,
  ruleOptions?: Record<string, unknown>,
): Promise<void> {
  await writeFixture(
    cwd,
    relativePath,
    `${JSON.stringify(
      {
        jsPlugins: [pathToFileURL(pluginPath).href],
        rules: {
          "comments/require-description": ruleOptions ? ["error", ruleOptions] : "error",
        },
      },
      null,
      2,
    )}\n`,
  );
}

test(
  "reports oxlint directive comments without a description",
  async () => {
    await withCommentsFixture(async ({ cwd }) => {
      await writeConfig(cwd, "oxlint.config.json");
      await writeFixture(
        cwd,
        "src/missing.ts",
        [
          "/* oxlint-disable no-console */",
          "// oxlint-disable-next-line no-console",
          "export const first = 1;",
          "",
        ].join("\n"),
      );

      const run = await runOxlint({
        configPath: "oxlint.config.json",
        cwd,
        targets: ["src/missing.ts"],
      });

      expect(run.timedOut, formatCommandFailure("oxlint --format json", run)).toBe(false);
      expect(run.exitCode, formatCommandFailure("oxlint --format json", run)).not.toBe(0);
      const report = parseOxlintReport(run);

      expect(report.diagnostics).toHaveLength(2);
      expect(report.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: ruleCode,
            filename: "src/missing.ts",
            severity: "error",
          }),
        ]),
      );
      expect(
        report.diagnostics.flatMap(diagnostic => diagnostic.labels.map(label => label.span.line)),
      ).toEqual([1, 2]);
    });
  },
  testTimeoutMs,
);

test(
  "passes when directive comments include a description",
  async () => {
    await withCommentsFixture(async ({ cwd }) => {
      await writeConfig(cwd, "oxlint.config.json");
      await writeFixture(
        cwd,
        "src/described.ts",
        [
          "/* oxlint-disable no-console -- console needed for the demo */",
          "// oxlint-disable-next-line no-console -- keep temporary logging",
          "export const first = 1;",
          "",
        ].join("\n"),
      );

      const run = await runOxlint({
        configPath: "oxlint.config.json",
        cwd,
        targets: ["src/described.ts"],
      });

      expect(run, formatCommandFailure("oxlint --format json", run)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(parseOxlintReport(run).diagnostics).toEqual([]);
    });
  },
  testTimeoutMs,
);

test(
  "ignores eslint directive comments",
  async () => {
    await withCommentsFixture(async ({ cwd }) => {
      await writeConfig(cwd, "oxlint.config.json");
      await writeFixture(
        cwd,
        "src/eslint.ts",
        [
          "/* eslint-disable no-console */",
          "// eslint-disable-next-line no-console",
          "export const value = 1;",
          "",
        ].join("\n"),
      );

      const run = await runOxlint({
        configPath: "oxlint.config.json",
        cwd,
        targets: ["src/eslint.ts"],
      });

      expect(run, formatCommandFailure("oxlint --format json", run)).toMatchObject({
        exitCode: 0,
        timedOut: false,
      });
      expect(parseOxlintReport(run).diagnostics).toEqual([]);
    });
  },
  testTimeoutMs,
);

test(
  "the ignore option skips only the listed directives",
  async () => {
    await withCommentsFixture(async ({ cwd }) => {
      await writeConfig(cwd, "ignore.config.json", { ignore: ["oxlint-disable-line"] });
      await writeFixture(
        cwd,
        "src/ignored.ts",
        [
          "export const first = 1; // oxlint-disable-line no-console",
          "// oxlint-disable-next-line no-console",
          "export const second = 2;",
          "",
        ].join("\n"),
      );

      const run = await runOxlint({
        configPath: "ignore.config.json",
        cwd,
        targets: ["src/ignored.ts"],
      });

      expect(run.timedOut, formatCommandFailure("oxlint --format json", run)).toBe(false);
      expect(
        run.exitCode,
        `the non-ignored directive should still be reported\n${formatCommandFailure("oxlint --format json", run)}`,
      ).not.toBe(0);
      const report = parseOxlintReport(run);

      expect(report.diagnostics).toEqual([
        expect.objectContaining({
          code: ruleCode,
          filename: "src/ignored.ts",
          labels: [expect.objectContaining({ span: expect.objectContaining({ line: 2 }) })],
          severity: "error",
        }),
      ]);
    });
  },
  testTimeoutMs,
);
