import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "dist/npm/cfgs");

const outPackageDir = path.join(rootDir, "web/out-package");
const packageTemplateDir = path.join(rootDir, "web/package-template");

const sourceDirs = [
  ["web/ts-config", "ts"],
  ["web/oxlint-config", "oxlint"],
  ["web/oxfmt-config", "oxfmt"],
];

const publishFiles = [
  "index.js",
  "types",
  "ts",
  "oxlint",
  "oxfmt",
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createPeerDependencies(peerDependencyNames, dependencyVersions) {
  return Object.fromEntries(
    peerDependencyNames.map(name => {
      const version = dependencyVersions[name];

      if (!version) {
        throw new Error(`Missing version for peer dependency "${name}" in web/package-template/package.json.`);
      }

      return [name, version];
    }),
  );
}

function createPeerDependenciesMeta(peerDependencyNames) {
  return Object.fromEntries(
    peerDependencyNames.map(name => [name, { optional: true }]),
  );
}

async function buildPackageJson() {
  const packageJson = await readJson(path.join(outPackageDir, "package.json"));
  const config = await readJson(path.join(outPackageDir, "config.json"));
  const packageTemplate = await readJson(path.join(packageTemplateDir, "package.json"));

  if (!Array.isArray(config.peerDependencies)) {
    throw new TypeError("web/out-package/config.json peerDependencies must be an array.");
  }

  delete packageJson.devEngines;

  packageJson.files = publishFiles;
  packageJson.peerDependencies = createPeerDependencies(
    config.peerDependencies,
    packageTemplate.devDependencies ?? {},
  );
  packageJson.peerDependenciesMeta = createPeerDependenciesMeta(config.peerDependencies);

  await writeJson(path.join(outDir, "package.json"), packageJson);
}

export async function buildPackageFiles() {
  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  await buildPackageJson();

  for (const [sourceDir, targetDir] of sourceDirs) {
    await cp(path.join(rootDir, sourceDir), path.join(outDir, targetDir), {
      filter: source => path.basename(source) !== ".DS_Store",
      recursive: true,
    });
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
