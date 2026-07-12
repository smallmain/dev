import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import spawn from "nano-spawn";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "dist/npm/dev");

const jsonSourceDirs = [["configs/web/typescript", "ts"]];

const copiedSourceDirs = [
  ["configs/common", "configs/common"],
  ["templates", "templates"],
];

const typescriptSourceDirs = [
  ["configs/web/oxlint", "oxlint"],
  ["configs/web/oxfmt", "oxfmt"],
  ["configs/web/stylelint", "stylelint"],
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function collectTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

async function runCommand(command, args) {
  await spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

async function buildPackageJson() {
  const packageJson = await readJson(path.join(rootDir, "package.json"));
  delete packageJson.devEngines;
  delete packageJson.scripts;

  await writeJson(path.join(outDir, "package.json"), packageJson);
}

async function buildTypeScriptConfig(sourceDir, targetDir) {
  const sourcePath = path.join(rootDir, sourceDir);
  const sourceFiles = await collectTypeScriptFiles(sourcePath);

  if (sourceFiles.length === 0) {
    return;
  }

  await runCommand("pnpm", [
    "exec",
    "tsc",
    "--ignoreConfig",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--declaration",
    "--strict",
    "--noEmitOnError",
    "--skipLibCheck",
    "--types",
    "node",
    "--rootDir",
    sourcePath,
    "--outDir",
    path.join(outDir, targetDir),
    ...sourceFiles,
  ]);
}

async function buildCli() {
  const sourcePath = path.join(rootDir, "src");
  const sourceFiles = await collectTypeScriptFiles(sourcePath);

  await runCommand("pnpm", [
    "exec",
    "tsc",
    "--ignoreConfig",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--rewriteRelativeImportExtensions",
    "--strict",
    "--noEmitOnError",
    "--skipLibCheck",
    "--types",
    "node",
    "--rootDir",
    sourcePath,
    "--outDir",
    path.join(outDir, "cli"),
    ...sourceFiles,
  ]);
}

async function writeBin() {
  const binDir = path.join(outDir, "bin");
  const binPath = path.join(binDir, "sm.js");

  await mkdir(binDir, { recursive: true });
  await writeFile(binPath, '#!/usr/bin/env node\nimport "../cli/index.js";\n');
  await chmod(binPath, 0o755);
}

export async function buildPackageFiles() {
  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  await buildPackageJson();

  for (const [sourceDir, targetDir] of jsonSourceDirs) {
    await cp(path.join(rootDir, sourceDir), path.join(outDir, targetDir), {
      filter: source => path.basename(source) !== ".DS_Store",
      recursive: true,
    });
  }

  for (const [sourceDir, targetDir] of copiedSourceDirs) {
    await cp(path.join(rootDir, sourceDir), path.join(outDir, targetDir), {
      filter: source => path.basename(source) !== ".DS_Store",
      recursive: true,
    });
  }

  for (const [sourceDir, targetDir] of typescriptSourceDirs) {
    await buildTypeScriptConfig(sourceDir, targetDir);
  }

  await buildCli();
  await writeBin();

  await writeFile(path.join(outDir, "index.js"), "export {};\n");
  await mkdir(path.join(outDir, "types"), { recursive: true });
  await writeFile(path.join(outDir, "types/index.d.ts"), "export {};\n");
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

export { outDir, readJson, rootDir, writeJson };

if (isDirectRun()) {
  await buildPackageFiles();

  console.log(`Built ${path.relative(rootDir, outDir)}`);
}
