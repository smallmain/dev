import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runGit, tryGit } from "./git.ts";
import type { GitContext, TransactionManifest, TransactionPaths } from "./types.ts";

interface LockRecord {
  id: string;
  pid: number;
  startedAt: string;
}

export interface TransactionLock {
  id: string;
  oid: string;
  ref: string;
  repoRoot: string;
}

interface LockSnapshot {
  oid: string;
  record?: LockRecord;
}

export function createTransactionId(): string {
  return randomUUID();
}

export function getStorageRoot(context: GitContext): string {
  return path.join(context.gitDir, "sm", "staged-run");
}

export function getTransactionPaths(context: GitContext, id: string): TransactionPaths {
  validateTransactionId(id);
  const root = getStorageRoot(context);
  const directory = path.join(root, "transactions", id);

  return {
    directory,
    manifest: path.join(directory, "manifest.json"),
    root,
  };
}

export async function createTransactionDirectory(
  context: GitContext,
  id: string,
): Promise<TransactionPaths> {
  const paths = getTransactionPaths(context, id);

  await mkdir(path.dirname(paths.directory), { recursive: true });
  await mkdir(paths.directory);
  return paths;
}

export async function writeManifest(
  paths: TransactionPaths,
  manifest: TransactionManifest,
): Promise<void> {
  const temporaryPath = path.join(paths.directory, `.manifest-${randomUUID()}.tmp`);

  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  await rename(temporaryPath, paths.manifest);
}

export async function readManifest(context: GitContext, id: string): Promise<TransactionManifest> {
  const paths = getTransactionPaths(context, id);

  return parseManifest(await readFile(paths.manifest, "utf8"), paths.manifest);
}

export async function listManifests(context: GitContext): Promise<TransactionManifest[]> {
  const transactionsDirectory = path.join(getStorageRoot(context), "transactions");
  let entries;

  try {
    entries = await readdir(transactionsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const manifests = (
    await Promise.all(
      entries
        .filter(entry => entry.isDirectory())
        .map(entry => readManifestIfPresent(context, entry.name)),
    )
  ).filter((manifest): manifest is TransactionManifest => manifest !== undefined);

  return manifests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function assertNoBlockingTransactions(context: GitContext): Promise<void> {
  await removeManifestlessTransactionDirectories(context);
  const blocking = (await listManifests(context)).filter(manifest => manifest.phase !== "saved");

  if (blocking.length === 0) {
    return;
  }

  const ids = blocking.map(manifest => manifest.id).join(", ");
  throw new Error(
    `staged-run found an unfinished transaction: ${ids}. Run sm staged-run --list-recoveries.`,
  );
}

async function readManifestIfPresent(
  context: GitContext,
  id: string,
): Promise<TransactionManifest | undefined> {
  try {
    return await readManifest(context, id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function removeManifestlessTransactionDirectories(context: GitContext): Promise<void> {
  const transactionsDirectory = path.join(getStorageRoot(context), "transactions");
  let entries;

  try {
    entries = await readdir(transactionsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const paths = getTransactionPaths(context, entry.name);

    try {
      await readFile(paths.manifest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      await removeTransactionDirectory(paths);
    }
  }
}

export async function acquireTransactionLock(
  context: GitContext,
  id: string,
): Promise<TransactionLock> {
  const root = getStorageRoot(context);
  const lockRef = `refs/sm/staged-run/${context.worktreeId}/lock`;
  const record: LockRecord = { id, pid: process.pid, startedAt: new Date().toISOString() };
  let lockOid: string | undefined;

  await mkdir(root, { recursive: true });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await readLock(context, lockRef);

    if (existing?.record && isProcessAlive(existing.record.pid)) {
      throw new Error(
        `staged-run transaction ${existing.record.id} is still running with process ${existing.record.pid}.`,
      );
    }

    if (existing) {
      const removed = await tryGit(["update-ref", "-d", lockRef, existing.oid], {
        cwd: context.repoRoot,
      });

      if (removed.code !== 0) {
        continue;
      }
    }

    lockOid ??= (
      await runGit(["hash-object", "-w", "--stdin"], {
        cwd: context.repoRoot,
        input: `${JSON.stringify(record)}\n`,
      })
    ).trim();
    const created = await tryGit(["update-ref", lockRef, lockOid, "0".repeat(lockOid.length)], {
      cwd: context.repoRoot,
    });

    if (created.code === 0) {
      return { id, oid: lockOid, ref: lockRef, repoRoot: context.repoRoot };
    }
  }

  throw new Error("Unable to acquire the staged-run transaction lock.");
}

export async function releaseTransactionLock(lock: TransactionLock): Promise<void> {
  const existing = await readLock({ repoRoot: lock.repoRoot }, lock.ref);

  if (!existing) {
    return;
  }

  if (existing.oid !== lock.oid) {
    throw new Error("The staged-run transaction lock changed ownership.");
  }

  const removed = await tryGit(["update-ref", "-d", lock.ref, lock.oid], {
    cwd: lock.repoRoot,
  });

  if (removed.code !== 0) {
    throw new Error("Unable to release the staged-run transaction lock.");
  }
}

export async function removeTransactionDirectory(paths: TransactionPaths): Promise<void> {
  await rm(paths.directory, { force: true, recursive: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function validateTransactionId(id: string): void {
  if (!/^[0-9A-Za-z-]+$/u.test(id)) {
    throw new Error(`Invalid staged-run recovery id: ${id}`);
  }
}

async function readLock(
  context: Pick<GitContext, "repoRoot">,
  lockRef: string,
): Promise<LockSnapshot | undefined> {
  const resolved = await tryGit(["rev-parse", "--verify", lockRef], {
    cwd: context.repoRoot,
  });

  if (resolved.code !== 0) {
    return undefined;
  }

  const oid = resolved.stdout.trim();
  const object = await tryGit(["cat-file", "blob", oid], { cwd: context.repoRoot });

  if (object.code !== 0) {
    return { oid };
  }

  try {
    const value = JSON.parse(object.stdout) as Partial<LockRecord>;

    if (typeof value.id === "string" && typeof value.pid === "number") {
      return {
        oid,
        record: {
          id: value.id,
          pid: value.pid,
          startedAt: typeof value.startedAt === "string" ? value.startedAt : "",
        },
      };
    }
  } catch {
    // A malformed lock cannot belong to a verifiably live process and is treated as stale.
  }

  return { oid };
}

function parseManifest(content: string, filePath: string): TransactionManifest {
  let value: Partial<TransactionManifest>;

  try {
    value = JSON.parse(content) as Partial<TransactionManifest>;
  } catch (error) {
    throw new Error(`Invalid staged-run transaction manifest: ${filePath}`, { cause: error });
  }

  if (
    value.version !== 1 ||
    typeof value.id !== "string" ||
    (value.kind !== "transaction" && value.kind !== "recovery") ||
    typeof value.phase !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.ownerPid !== "number" ||
    !value.context ||
    !Array.isArray(value.matchedPaths) ||
    !Array.isArray(value.partialPaths)
  ) {
    throw new Error(`Invalid staged-run transaction manifest: ${filePath}`);
  }

  return value as TransactionManifest;
}
