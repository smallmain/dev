import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageJson {
  name?: string;
  version?: string;
  author?:
    | string
    | {
        name?: string;
        email?: string;
        url?: string;
      };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  funding?:
    | string
    | {
        type?: string;
        url?: string;
      };
  engines?: {
    node?: string;
  };
  devEngines?: unknown;
}

const cliDir = path.dirname(fileURLToPath(import.meta.url));

export const packageRootDir = path.resolve(cliDir, "..");

export async function readPackageJson(): Promise<PackageJson> {
  const content = await readFile(path.join(packageRootDir, "package.json"), "utf8");
  return JSON.parse(content) as PackageJson;
}

export function getDependencyVersion(packageJson: PackageJson, name: string): string {
  const version =
    packageJson.devDependencies?.[name] ??
    packageJson.peerDependencies?.[name] ??
    packageJson.dependencies?.[name];

  if (!version) {
    throw new Error(`Missing dependency version for ${name}.`);
  }

  return version;
}

export function getAuthor(
  packageJson: PackageJson,
): Required<Exclude<PackageJson["author"], string | undefined>> {
  if (typeof packageJson.author === "string") {
    return {
      name: packageJson.author,
      email: "",
      url: "",
    };
  }

  return {
    name: packageJson.author?.name ?? "SmallMain",
    email: packageJson.author?.email ?? "",
    url: packageJson.author?.url ?? "",
  };
}
