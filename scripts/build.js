import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "dist/npm/cfgs");

const outPackageDir = path.join(rootDir, "web/out-package");
const packageTemplateDir = path.join(rootDir, "web/package-template");

const jsonSourceDirs = [["web/ts-config", "ts"]];

const typescriptSourceDirs = [
  ["web/oxlint-config", "oxlint"],
  ["web/oxfmt-config", "oxfmt"],
  ["web/stylelint-config", "stylelint"],
];

const publishFiles = ["index.js", "types", "ts", "oxlint", "oxfmt", "stylelint"];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function collectTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}.`));
    });
  });
}

function createDependencies(dependencyNames, dependencyVersions, sourceDescription) {
  return Object.fromEntries(
    dependencyNames.map((name) => {
      const version = dependencyVersions[name];

      if (!version) {
        throw new Error(`Missing version for dependency "${name}" in ${sourceDescription}.`);
      }

      return [name, version];
    }),
  );
}

function createPeerDependenciesMeta(peerDependencyNames) {
  return Object.fromEntries(peerDependencyNames.map((name) => [name, { optional: true }]));
}

async function buildPackageJson() {
  const packageJson = await readJson(path.join(outPackageDir, "package.json"));
  const rootPackageJson = await readJson(path.join(rootDir, "package.json"));
  const config = await readJson(path.join(outPackageDir, "config.json"));
  const packageTemplate = await readJson(path.join(packageTemplateDir, "package.json"));

  if (!Array.isArray(config.dependencies)) {
    throw new TypeError("web/out-package/config.json dependencies must be an array.");
  }

  if (!Array.isArray(config.peerDependencies)) {
    throw new TypeError("web/out-package/config.json peerDependencies must be an array.");
  }

  delete packageJson.devEngines;

  packageJson.files = publishFiles;
  packageJson.dependencies = createDependencies(
    config.dependencies,
    rootPackageJson.devDependencies ?? {},
    "package.json",
  );
  packageJson.peerDependencies = createDependencies(
    config.peerDependencies,
    packageTemplate.devDependencies ?? {},
    "web/package-template/package.json",
  );
  packageJson.peerDependenciesMeta = createPeerDependenciesMeta(config.peerDependencies);

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
    "--rootDir",
    sourcePath,
    "--outDir",
    path.join(outDir, targetDir),
    ...sourceFiles,
  ]);
}

export async function buildPackageFiles() {
  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  await buildPackageJson();

  for (const [sourceDir, targetDir] of jsonSourceDirs) {
    await cp(path.join(rootDir, sourceDir), path.join(outDir, targetDir), {
      filter: (source) => path.basename(source) !== ".DS_Store",
      recursive: true,
    });
  }

  for (const [sourceDir, targetDir] of typescriptSourceDirs) {
    await buildTypeScriptConfig(sourceDir, targetDir);
  }

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
