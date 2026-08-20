import {
  acquireTransactionLock,
  createTransactionDirectory,
  createTransactionId,
  getTransactionPaths,
  isProcessAlive,
  listManifests,
  readManifest,
  releaseTransactionLock,
  writeManifest,
} from "./storage.ts";
import {
  cleanupManifestArtifacts,
  createPersistentBackup,
  restorePersistentBackup,
} from "./transaction.ts";
import type { GitContext, TransactionManifest, TransactionPaths } from "./types.ts";

export async function listStagedRunRecoveries(context: GitContext): Promise<void> {
  for (const manifest of await listManifests(context)) {
    console.log([manifest.id, manifest.kind, manifest.phase, manifest.createdAt].join("\t"));
  }
}

export async function recoverStagedRun(context: GitContext, id: string): Promise<void> {
  const target = await readManifest(context, id);

  assertSameWorktree(context, target);
  assertTargetIsNotLive(target);
  const operationId = createTransactionId();
  const lock = await acquireTransactionLock(context, operationId);
  let secondary: TransactionManifest | undefined;
  let secondaryPaths: TransactionPaths | undefined;

  try {
    if (isCleanupOnly(target)) {
      await cleanupManifestArtifacts(target, getTransactionPaths(context, target.id));
      return;
    }

    if (!target.backup) {
      throw new Error(`Recovery ${id} has no complete backup to restore.`);
    }

    const secondaryId = createTransactionId();

    secondaryPaths = await createTransactionDirectory(context, secondaryId);
    secondary = {
      context,
      createdAt: new Date().toISOString(),
      id: secondaryId,
      kind: "recovery",
      matchedPaths: [],
      ownerPid: process.pid,
      partialPaths: [],
      phase: "preparing",
      version: 1,
    };
    await writeManifest(secondaryPaths, secondary);
    secondary.backup = await createPersistentBackup(secondary, secondaryPaths);
    secondary.phase = "saved";
    await writeManifest(secondaryPaths, secondary);

    await restorePersistentBackup(target, true);
    await cleanupManifestArtifacts(target, getTransactionPaths(context, target.id));
    console.log(`Recovered ${id}. Undo recovery: ${secondaryId}`);
  } catch (error) {
    if (secondary && secondaryPaths && secondary.phase === "preparing") {
      try {
        await cleanupManifestArtifacts(secondary, secondaryPaths);
      } catch {
        // Preserve partial backup assets when their cleanup also fails.
      }
    }

    throw error;
  } finally {
    await releaseTransactionLock(lock);
  }
}

export async function discardStagedRunRecovery(context: GitContext, id: string): Promise<void> {
  const target = await readManifest(context, id);

  assertSameWorktree(context, target);
  assertTargetIsNotLive(target);
  const lock = await acquireTransactionLock(context, createTransactionId());

  try {
    await cleanupManifestArtifacts(target, getTransactionPaths(context, target.id));
  } finally {
    await releaseTransactionLock(lock);
  }
}

function isCleanupOnly(manifest: TransactionManifest): boolean {
  return (
    manifest.phase === "cleanup-only" ||
    manifest.phase === "committed" ||
    (manifest.phase === "preparing" && !manifest.backup)
  );
}

function assertSameWorktree(context: GitContext, manifest: TransactionManifest): void {
  if (
    manifest.context.gitDir !== context.gitDir ||
    manifest.context.worktreeId !== context.worktreeId
  ) {
    throw new Error(`Recovery ${manifest.id} belongs to another Git worktree.`);
  }
}

function assertTargetIsNotLive(manifest: TransactionManifest): void {
  if (manifest.kind === "transaction" && isProcessAlive(manifest.ownerPid)) {
    throw new Error(
      `staged-run transaction ${manifest.id} is still running with process ${manifest.ownerPid}.`,
    );
  }
}
