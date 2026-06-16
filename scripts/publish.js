import { spawn } from "node:child_process";
import path from "node:path";
import { buildPackageFiles, outDir, readJson, rootDir, writeJson } from "./build.js";

const versionBumps = new Set(["major", "minor", "patch"]);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

function parseArgs(args) {
  const npmArgs = [];
  let version;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--version") {
      const value = args[i + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --version.");
      }

      version = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
      continue;
    }

    npmArgs.push(arg);
  }

  return { npmArgs, version };
}

function parseVersion(version) {
  const match = versionPattern.exec(version);

  if (!match) {
    throw new Error(`Invalid version "${version}".`);
  }

  return match.slice(1, 4).map(Number);
}

function resolveVersion(currentVersion, version) {
  if (!version) {
    return currentVersion;
  }

  if (versionPattern.test(version)) {
    return version;
  }

  if (!versionBumps.has(version)) {
    throw new Error(`Unsupported version "${version}". Use major, minor, patch, or a concrete semver version.`);
  }

  const [major, minor, patch] = parseVersion(currentVersion);

  if (version === "major") {
    return `${major + 1}.0.0`;
  }

  if (version === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

function hasDryRunArg(args) {
  return args.some(arg => arg === "--dry-run" || arg === "--dry-run=true");
}

function npmPublish(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["publish", ...args], {
      cwd: outDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm publish exited with code ${code}.`));
    });
  });
}

async function updatePackageVersion(filePath, version) {
  const packageJson = await readJson(filePath);
  packageJson.version = version;
  await writeJson(filePath, packageJson);
}

const { npmArgs, version } = parseArgs(process.argv.slice(2));
const sourcePackageJsonPath = path.join(rootDir, "web/out-package/package.json");
const outPackageJsonPath = path.join(outDir, "package.json");
const sourcePackageJson = await readJson(sourcePackageJsonPath);
const nextVersion = resolveVersion(sourcePackageJson.version, version);
const dryRun = hasDryRunArg(npmArgs);

await buildPackageFiles();

if (version) {
  await updatePackageVersion(outPackageJsonPath, nextVersion);
}

console.log(`Publishing ${sourcePackageJson.name}@${nextVersion} from ${path.relative(rootDir, outDir)}`);

await npmPublish(npmArgs);

if (version && !dryRun) {
  await updatePackageVersion(sourcePackageJsonPath, nextVersion);
}
