import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { distDir, repoRoot } from "./cli-e2e-utils.ts";

const pathEnvKey = process.platform === "win32" ? "Path" : "PATH";
const symlinkDirType = process.platform === "win32" ? "junction" : "dir";

export interface InstalledCreateProject {
  env: NodeJS.ProcessEnv;
  fakeBinDir: string;
  installAttemptsPath: string;
  installLogPath: string;
  projectDir: string;
  ttyPreloadPath: string;
  workDir: string;
}

interface InstalledCreateProjectOptions {
  nodeTypes?: boolean;
  stylelint?: boolean;
}

interface RootPackageJson {
  dependencies?: Record<string, string>;
}

export async function withInstalledCreateProject(
  run: (fixture: InstalledCreateProject) => Promise<void>,
  options: InstalledCreateProjectOptions = {},
): Promise<void> {
  const workDir = await mkdtemp(path.join(tmpdir(), "sm-create-e2e-"));
  let passed = false;

  try {
    const projectDir = path.join(workDir, "project");
    const rootPackageJson = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    ) as RootPackageJson;
    const installedPackages = new Set([
      ...Object.keys(rootPackageJson.dependencies ?? {}),
      "@vitest/coverage-v8",
      "oxfmt",
      "oxlint",
      "oxlint-tsgolint",
      "typescript",
      "vitest",
      ...(options.nodeTypes ? ["@types/node"] : []),
      ...(options.stylelint ? ["stylelint"] : []),
    ]);

    await linkPackage(projectDir, "@smallmains/dev", distDir);
    await Promise.all(
      [...installedPackages].map(packageName =>
        linkPackage(projectDir, packageName, path.join(repoRoot, "node_modules", packageName)),
      ),
    );

    const fakeBinDir = await createFakePackageManagers(workDir);
    const installAttemptsPath = path.join(workDir, "install-attempts.txt");
    const installLogPath = path.join(workDir, "install.log");
    const ttyPreloadPath = path.join(workDir, "tty-preload.mjs");

    await writeFile(
      ttyPreloadPath,
      [
        'import { existsSync } from "node:fs";',
        "",
        "const ttyAfterFile = process.env.SM_CREATE_TTY_AFTER_FILE;",
        "",
        "for (const stream of [process.stdin, process.stdout]) {",
        '  Object.defineProperty(stream, "isTTY", {',
        "    configurable: true,",
        "    get() {",
        "      return ttyAfterFile === undefined || existsSync(ttyAfterFile);",
        "    },",
        "  });",
        "}",
        "",
      ].join("\n"),
    );

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      [pathEnvKey]: [fakeBinDir, process.env[pathEnvKey] ?? ""]
        .filter(Boolean)
        .join(path.delimiter),
      SM_CREATE_INSTALL_ATTEMPTS: installAttemptsPath,
      SM_CREATE_INSTALL_LOG: installLogPath,
    };

    await run({
      env,
      fakeBinDir,
      installAttemptsPath,
      installLogPath,
      projectDir,
      ttyPreloadPath,
      workDir,
    });
    passed = true;
  } finally {
    if (!passed || process.env.KEEP_TEST_TEMP === "1") {
      console.info(`Kept create e2e temp directory: ${workDir}`);
    } else {
      await rm(workDir, { force: true, recursive: true });
    }
  }
}

async function linkPackage(
  projectDir: string,
  packageName: string,
  sourcePath: string,
): Promise<void> {
  const targetPath = path.join(projectDir, "node_modules", packageName);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await symlink(sourcePath, targetPath, symlinkDirType);
}

async function createFakePackageManagers(dir: string): Promise<string> {
  const fakeBinDir = path.join(dir, ".fake-bin");

  await mkdir(fakeBinDir, { recursive: true });
  await Promise.all(
    ["npm", "pnpm"].map(async packageManager => {
      const filePath = path.join(fakeBinDir, packageManager);

      await writeFile(
        filePath,
        [
          "#!/bin/sh",
          'printf "%s %s\\n" "$(basename "$0")" "$*" >> "$SM_CREATE_INSTALL_LOG"',
          "attempts=0",
          'if [ -f "$SM_CREATE_INSTALL_ATTEMPTS" ]; then',
          '  read -r attempts < "$SM_CREATE_INSTALL_ATTEMPTS"',
          "fi",
          "attempts=$((attempts + 1))",
          'printf "%s\\n" "$attempts" > "$SM_CREATE_INSTALL_ATTEMPTS"',
          'if [ "$attempts" -eq 1 ] && [ -n "${SM_CREATE_RETRY_MARKER:-}" ]; then',
          '  printf "\\nretry marker\\n" >> "$SM_CREATE_RETRY_MARKER"',
          "fi",
          'if [ -n "${SM_CREATE_INSTALL_SIGNAL:-}" ]; then',
          '  kill -s "$SM_CREATE_INSTALL_SIGNAL" "$$"',
          "fi",
          'if [ "$attempts" -le "${SM_CREATE_INSTALL_FAILURES:-0}" ]; then',
          '  exit "${SM_CREATE_INSTALL_EXIT_CODE:-17}"',
          "fi",
          "",
        ].join("\n"),
      );
      await chmod(filePath, 0o755);
    }),
  );

  return fakeBinDir;
}
