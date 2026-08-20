import { copyFile, cp, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { injectStagedRunTestFault } from "./faults.ts";
import {
  getIndexPaths,
  getPartiallyStagedPaths,
  getTreePaths,
  gitOperationMetadataPaths,
  hashFile,
  hashOperationMetadata,
  indexEnvironment,
  pathExists,
  runGit,
  tryGit,
} from "./git.ts";
import {
  getSignalExitCode,
  InterruptionController,
  runTaskWithArgumentSplitting,
} from "./runner.ts";
import {
  acquireTransactionLock,
  assertNoBlockingTransactions,
  createTransactionDirectory,
  createTransactionId,
  getTransactionPaths,
  releaseTransactionLock,
  removeTransactionDirectory,
  writeManifest,
} from "./storage.ts";
import type { StagedRunTaskRequest } from "./types.ts";
import type {
  GitContext,
  StagedFile,
  TaskResult,
  TransactionBackup,
  TransactionManifest,
  TransactionPaths,
  TransactionPhase,
} from "./types.ts";

class TaskFailure extends Error {
  readonly result: TaskResult;

  constructor(result: TaskResult) {
    super("The staged-run child command failed.");
    this.result = result;
  }
}

const transactionPhaseTransitions: Partial<Record<TransactionPhase, readonly TransactionPhase[]>> =
  {
    "backed-up": ["hiding", "hidden"],
    hidden: ["running"],
    hiding: ["hidden"],
    preparing: ["backed-up"],
    restoring: ["verifying"],
    running: ["staging"],
    staging: ["restoring"],
    verifying: ["committed"],
  };

export function assertTransactionPhaseTransition(
  current: TransactionPhase,
  next: TransactionPhase,
): void {
  if (!transactionPhaseTransitions[current]?.includes(next)) {
    throw new Error(`Invalid staged-run transaction phase transition: ${current} -> ${next}.`);
  }
}

export async function runStagedTransaction(
  context: GitContext,
  request: StagedRunTaskRequest,
  files: StagedFile[],
): Promise<number> {
  const id = createTransactionId();
  const lock = await acquireTransactionLock(context, id);
  let paths: TransactionPaths | undefined;
  let manifest: TransactionManifest | undefined;
  let lockReleased = false;
  const interruption = new InterruptionController();

  interruption.start();

  try {
    await assertNoBlockingTransactions(context);
    paths = await createTransactionDirectory(context, id);
    manifest = {
      context,
      createdAt: new Date().toISOString(),
      id,
      kind: "transaction",
      matchedPaths: files.map(file => file.path),
      ownerPid: process.pid,
      partialPaths: [],
      phase: "preparing",
      version: 1,
    };
    await writeManifest(paths, manifest);
    injectStagedRunTestFault("after-manifest");
    interruption.throwIfInterrupted();

    manifest.backup = await createPersistentBackup(manifest, paths);
    manifest.partialPaths = await getPartiallyStagedPaths(context);

    if (manifest.partialPaths.length > 0) {
      const patchOutput = await runGit(
        [
          "diff",
          "--binary",
          "--full-index",
          "--no-color",
          "--no-ext-diff",
          "--",
          ...literalPathspecs(manifest.partialPaths),
        ],
        { cwd: context.repoRoot, env: indexEnvironment(context.activeIndexPath) },
      );
      const patch = patchOutput.length > 0 ? `${patchOutput}\n` : "";

      manifest.partialPatchPath = path.join(paths.directory, "unstaged.patch");
      await writeFile(manifest.partialPatchPath, patch);
    }

    await setPhase(paths, manifest, "backed-up");
    injectStagedRunTestFault("after-backup");
    interruption.throwIfInterrupted();

    if (manifest.partialPaths.length > 0) {
      await setPhase(paths, manifest, "hiding");
      await runGit(["checkout-index", "--force", "-z", "--stdin"], {
        cwd: context.repoRoot,
        env: indexEnvironment(context.activeIndexPath),
        input: nulInput(manifest.partialPaths),
      });
    }

    await setPhase(paths, manifest, "hidden");
    injectStagedRunTestFault("after-hide");
    const activeIndexHash = await hashFile(context.activeIndexPath);
    const doubleWriteHash = context.doubleWriteIndexPath
      ? await hashFile(context.doubleWriteIndexPath)
      : undefined;

    await setPhase(paths, manifest, "running");
    const taskResult = await runTaskWithArgumentSplitting(
      request,
      files.map(file => file.absolutePath),
      context.invocationCwd,
      interruption,
      async () => {
        await assertFileHash(context.activeIndexPath, activeIndexHash, "active Git index");

        if (context.doubleWriteIndexPath && doubleWriteHash) {
          await assertFileHash(
            context.doubleWriteIndexPath,
            doubleWriteHash,
            "parent Git index lock",
          );
        }
      },
    );

    if (
      taskResult.code !== 0 ||
      taskResult.signal ||
      taskResult.launchError ||
      taskResult.internalError
    ) {
      throw new TaskFailure(taskResult);
    }

    injectStagedRunTestFault("after-task");
    interruption.throwIfInterrupted();
    await setPhase(paths, manifest, "staging");
    await stagePaths(context, context.activeIndexPath, manifest.matchedPaths);
    injectStagedRunTestFault("after-stage-active");
    interruption.throwIfInterrupted();

    if (context.doubleWriteIndexPath) {
      await stagePaths(context, context.doubleWriteIndexPath, manifest.matchedPaths);
      injectStagedRunTestFault("after-stage-parent");
      interruption.throwIfInterrupted();
    }

    const repairedActiveIndexHash = await hashFile(context.activeIndexPath);
    const repairedDoubleWriteHash = context.doubleWriteIndexPath
      ? await hashFile(context.doubleWriteIndexPath)
      : undefined;

    injectStagedRunTestFault("before-restore");
    await setPhase(paths, manifest, "restoring");
    await restorePartialChanges(manifest, paths);
    await assertFileHash(context.activeIndexPath, repairedActiveIndexHash, "repaired Git index");
    interruption.throwIfInterrupted();

    if (context.doubleWriteIndexPath && repairedDoubleWriteHash) {
      await assertFileHash(
        context.doubleWriteIndexPath,
        repairedDoubleWriteHash,
        "repaired parent Git index lock",
      );
      interruption.throwIfInterrupted();
    }

    injectStagedRunTestFault("before-verify");
    await setPhase(paths, manifest, "verifying");
    await verifyCommittedState(manifest, request.allowEmpty);
    interruption.throwIfInterrupted();
    injectStagedRunTestFault("after-verify");
    await setPhase(paths, manifest, "committed");
  } catch (error) {
    const originalError = error;

    try {
      if (manifest?.backup && manifest.phase !== "committed" && manifest.phase !== "cleanup-only") {
        await restorePersistentBackup(manifest, false);
      }

      if (manifest && paths) {
        await cleanupManifestArtifacts(manifest, paths);
      } else if (paths) {
        await cleanupPrivateRefs(context, id);
        await removeTransactionDirectory(paths);
      }

      await releaseTransactionLock(lock);
      lockReleased = true;
    } catch (rollbackError) {
      throw new Error(`staged-run failed and could not fully roll back. Recovery id: ${id}.`, {
        cause: new AggregateError([originalError, rollbackError]),
      });
    }

    if (originalError instanceof TaskFailure) {
      if (originalError.result.internalError) {
        throw originalError.result.internalError;
      }

      if (originalError.result.launchError) {
        throw new Error("Unable to run the staged-run child command.", {
          cause: originalError.result.launchError,
        });
      }

      if (originalError.result.signal) {
        return getSignalExitCode(originalError.result.signal);
      }

      return originalError.result.code ?? 1;
    }

    throw originalError;
  } finally {
    interruption.stop();

    if (!manifest && !lockReleased) {
      try {
        await releaseTransactionLock(lock);
        lockReleased = true;
      } catch {
        // The primary error contains the transaction id needed to inspect stale state.
      }
    }
  }

  if (!manifest || !paths) {
    throw new Error(`staged-run transaction ${id} did not initialize.`);
  }

  try {
    await cleanupManifestArtifacts(manifest, paths);
    injectStagedRunTestFault("release-lock");
    await releaseTransactionLock(lock);
    lockReleased = true;
  } catch (error) {
    try {
      manifest.phase = "cleanup-only";
      await mkdir(paths.directory, { recursive: true });
      await writeManifest(paths, manifest);
    } catch {
      // Keep the original cleanup failure and the lock as the recovery locator.
    }

    throw new Error(
      `staged-run completed the user-state transaction but could not clean private data. Recovery id: ${id}.`,
      { cause: error },
    );
  }

  return 0;
}

export async function createPersistentBackup(
  manifest: TransactionManifest,
  paths: TransactionPaths,
): Promise<TransactionBackup> {
  const { context, id } = manifest;
  const activeIndexBackupPath = path.join(paths.directory, "active-index");
  const activeIndexExisted = await pathExists(context.activeIndexPath);

  if (activeIndexExisted) {
    await copyFile(context.activeIndexPath, activeIndexBackupPath);
  } else {
    await runGit(["read-tree", "--empty"], {
      cwd: context.repoRoot,
      env: indexEnvironment(activeIndexBackupPath),
    });
  }

  let defaultIndexBackupPath: string | undefined;
  let defaultIndexExisted: boolean | undefined;

  if (context.parentManagedIndex) {
    defaultIndexBackupPath = path.join(paths.directory, "default-index");
    defaultIndexExisted = await pathExists(context.defaultIndexPath);

    if (defaultIndexExisted) {
      await copyFile(context.defaultIndexPath, defaultIndexBackupPath);
    } else {
      await runGit(["read-tree", "--empty"], {
        cwd: context.repoRoot,
        env: indexEnvironment(defaultIndexBackupPath),
      });
    }
  }

  let doubleWriteIndexBackupPath: string | undefined;

  if (context.doubleWriteIndexPath) {
    doubleWriteIndexBackupPath = path.join(paths.directory, "double-write-index");
    await copyFile(context.doubleWriteIndexPath, doubleWriteIndexBackupPath);
  }

  const sourceIndexPath = activeIndexExisted ? context.activeIndexPath : activeIndexBackupPath;
  const indexTree = (
    await runGit(["write-tree"], {
      cwd: context.repoRoot,
      env: indexEnvironment(sourceIndexPath),
    })
  ).trim();
  const refs: TransactionBackup["refs"] = [];
  let worktreeTree: string | undefined;
  const head = await tryGit(["rev-parse", "--verify", "HEAD"], { cwd: context.repoRoot });

  if (head.code === 0) {
    const stash = await tryGit(["stash", "create", `sm staged-run ${id}`], {
      cwd: context.repoRoot,
      env: indexEnvironment(sourceIndexPath),
    });

    if (stash.code !== 0) {
      throw new Error("Unable to create the staged-run worktree backup.", {
        cause: new Error(stash.stderr),
      });
    }

    const stashOid = stash.stdout.trim();

    if (stashOid) {
      const ref = privateRef(context, id, "backup");

      await runGit(["update-ref", ref, stashOid], { cwd: context.repoRoot });
      refs.push({ name: ref, oid: stashOid });
      worktreeTree = (
        await runGit(["rev-parse", `${stashOid}^{tree}`], { cwd: context.repoRoot })
      ).trim();
    }
  }

  if (!worktreeTree) {
    worktreeTree = await createWorktreeTree(context, sourceIndexPath, paths.directory);

    for (const [name, oid] of [
      ["index", indexTree],
      ["worktree", worktreeTree],
    ] as const) {
      const ref = privateRef(context, id, name);

      await runGit(["update-ref", ref, oid], { cwd: context.repoRoot });
      refs.push({ name: ref, oid });
    }
  }

  const metadata = await createOperationMetadataBackup(context, paths.directory);

  return {
    activeIndexBackupPath,
    activeIndexExisted,
    defaultIndexBackupPath,
    defaultIndexExisted,
    doubleWriteIndexBackupPath,
    indexTree,
    ...metadata,
    originalIndexPaths: await getIndexPaths(context, sourceIndexPath),
    refs,
    worktreeTree,
  };
}

export async function restorePersistentBackup(
  manifest: TransactionManifest,
  recovering: boolean,
): Promise<void> {
  if (!recovering) {
    injectStagedRunTestFault("rollback");
  }

  const backup = manifest.backup;

  if (!backup) {
    throw new Error(`Transaction ${manifest.id} has no restorable backup.`);
  }

  const { context } = manifest;
  const treePaths = new Set(await getTreePaths(context, backup.worktreeTree));

  for (const filePath of backup.originalIndexPaths) {
    if (!treePaths.has(filePath)) {
      await rm(resolveTrackedPath(context.repoRoot, filePath), { force: true, recursive: true });
    }
  }

  const restoreIndexPath = path.join(
    getTransactionPaths(context, manifest.id).directory,
    "restore-index",
  );

  await rm(restoreIndexPath, { force: true });
  await runGit(["read-tree", backup.worktreeTree], {
    cwd: context.repoRoot,
    env: indexEnvironment(restoreIndexPath),
  });
  await runGit(["checkout-index", "--all", "--force"], {
    cwd: context.repoRoot,
    env: indexEnvironment(restoreIndexPath),
  });
  await rm(restoreIndexPath, { force: true });

  if (recovering && context.parentManagedIndex && backup.defaultIndexBackupPath) {
    await restoreIndexFile(
      backup.defaultIndexBackupPath,
      context.defaultIndexPath,
      backup.defaultIndexExisted === true,
      manifest.id,
    );

    if (context.activeIndexPath !== context.defaultIndexPath) {
      await rm(context.activeIndexPath, { force: true });
    }

    if (context.doubleWriteIndexPath && context.doubleWriteIndexPath !== context.activeIndexPath) {
      await rm(context.doubleWriteIndexPath, { force: true });
    }
  } else {
    await restoreIndexFile(
      backup.activeIndexBackupPath,
      context.activeIndexPath,
      backup.activeIndexExisted,
      manifest.id,
    );

    if (context.doubleWriteIndexPath && backup.doubleWriteIndexBackupPath) {
      await restoreIndexFile(
        backup.doubleWriteIndexBackupPath,
        context.doubleWriteIndexPath,
        true,
        manifest.id,
      );
    }
  }

  await restoreOperationMetadata(context, backup);

  if ((await hashOperationMetadata(context)) !== backup.metadataHash) {
    throw new Error("Git operation metadata could not be restored exactly.");
  }
}

export async function cleanupManifestArtifacts(
  manifest: TransactionManifest,
  paths: TransactionPaths,
): Promise<void> {
  injectStagedRunTestFault("cleanup");
  await cleanupPrivateRefs(manifest.context, manifest.id);
  await removeTransactionDirectory(paths);
}

async function restorePartialChanges(
  manifest: TransactionManifest,
  paths: TransactionPaths,
): Promise<void> {
  if (!manifest.partialPatchPath || manifest.partialPaths.length === 0) {
    return;
  }

  const patch = await readFile(manifest.partialPatchPath, "utf8");

  if (patch.length === 0) {
    return;
  }

  const { context } = manifest;
  const check = await tryGit(["apply", "--check", "--whitespace=nowarn"], {
    cwd: context.repoRoot,
    input: patch,
  });

  if (check.code === 0) {
    injectStagedRunTestFault("restore-normal");
    await runGit(["apply", "--whitespace=nowarn"], {
      cwd: context.repoRoot,
      input: patch,
    });
    return;
  }

  const temporaryIndexPath = path.join(paths.directory, "three-way-index");

  await copyFile(context.activeIndexPath, temporaryIndexPath);

  try {
    await stagePaths(context, temporaryIndexPath, manifest.partialPaths);
    injectStagedRunTestFault("restore-three-way");
    const applied = await tryGit(["apply", "--3way", "--whitespace=nowarn"], {
      cwd: context.repoRoot,
      env: indexEnvironment(temporaryIndexPath),
      input: patch,
    });
    const unmerged = await runGit(["ls-files", "-u", "-z"], {
      cwd: context.repoRoot,
      env: indexEnvironment(temporaryIndexPath),
    });

    if (applied.code !== 0 || unmerged.length > 0) {
      throw new Error("Unable to restore partially staged working-tree changes.");
    }
  } finally {
    await rm(temporaryIndexPath, { force: true });
  }
}

async function verifyCommittedState(
  manifest: TransactionManifest,
  allowEmpty: boolean,
): Promise<void> {
  const { backup, context } = manifest;

  if (!backup) {
    throw new Error("The staged-run transaction backup is missing.");
  }

  const unmerged = await runGit(["ls-files", "-u", "-z"], {
    cwd: context.repoRoot,
    env: indexEnvironment(context.activeIndexPath),
  });

  if (unmerged.length > 0) {
    throw new Error("staged-run produced unmerged index entries.");
  }

  if ((await hashOperationMetadata(context)) !== backup.metadataHash) {
    throw new Error("Git operation metadata changed during staged-run.");
  }

  if (!allowEmpty && (await isIndexEmptyForCommit(context))) {
    throw new Error("staged-run would leave an empty commit; use --allow-empty to permit it.");
  }
}

async function isIndexEmptyForCommit(context: GitContext): Promise<boolean> {
  const indexTree = (
    await runGit(["write-tree"], {
      cwd: context.repoRoot,
      env: indexEnvironment(context.activeIndexPath),
    })
  ).trim();
  const head = await tryGit(["rev-parse", "--verify", "HEAD^{tree}"], {
    cwd: context.repoRoot,
  });

  if (head.code !== 0) {
    const emptyTree = (await runGit(["mktree"], { cwd: context.repoRoot, input: "" })).trim();
    return indexTree === emptyTree;
  }

  const parentTrees = [head.stdout.trim()];
  let mergeHeads = "";

  try {
    mergeHeads = await readFile(path.join(context.gitDir, "MERGE_HEAD"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  for (const oid of mergeHeads.split(/\s+/u).filter(Boolean)) {
    parentTrees.push(
      (await runGit(["rev-parse", `${oid}^{tree}`], { cwd: context.repoRoot })).trim(),
    );
  }

  return parentTrees.every(tree => tree === indexTree);
}

async function setPhase(
  paths: TransactionPaths,
  manifest: TransactionManifest,
  phase: TransactionPhase,
): Promise<void> {
  assertTransactionPhaseTransition(manifest.phase, phase);
  manifest.phase = phase;
  await writeManifest(paths, manifest);
  injectStagedRunTestFault("manifest-transition");
}

async function stagePaths(context: GitContext, indexPath: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await runGit(["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], {
    cwd: context.repoRoot,
    env: indexEnvironment(indexPath),
    input: nulInput(literalPathspecs(paths)),
  });
}

async function createWorktreeTree(
  context: GitContext,
  sourceIndexPath: string,
  transactionDirectory: string,
): Promise<string> {
  const temporaryIndexPath = path.join(transactionDirectory, "worktree-index");

  await copyFile(sourceIndexPath, temporaryIndexPath);

  try {
    await runGit(["add", "-u", "--", "."], {
      cwd: context.repoRoot,
      env: indexEnvironment(temporaryIndexPath),
    });
    return (
      await runGit(["write-tree"], {
        cwd: context.repoRoot,
        env: indexEnvironment(temporaryIndexPath),
      })
    ).trim();
  } finally {
    await rm(temporaryIndexPath, { force: true });
  }
}

async function createOperationMetadataBackup(
  context: GitContext,
  transactionDirectory: string,
): Promise<Pick<TransactionBackup, "metadataBackupPath" | "metadataHash" | "metadataPaths">> {
  const metadataBackupPath = path.join(transactionDirectory, "operation-metadata");
  const metadataHash = await hashOperationMetadata(context);
  const metadataPaths: string[] = [];

  await mkdir(metadataBackupPath, { recursive: true });

  for (const relativePath of gitOperationMetadataPaths) {
    const source = path.join(context.gitDir, relativePath);

    if (!(await pathExistsWithoutFollowing(source))) {
      continue;
    }

    const destination = path.join(metadataBackupPath, relativePath);

    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, {
      preserveTimestamps: true,
      recursive: true,
      verbatimSymlinks: true,
    });
    metadataPaths.push(relativePath);
  }

  if ((await hashOperationMetadata(context)) !== metadataHash) {
    throw new Error("Git operation metadata changed while staged-run was creating its backup.");
  }

  return { metadataBackupPath, metadataHash, metadataPaths };
}

async function restoreOperationMetadata(
  context: GitContext,
  backup: TransactionBackup,
): Promise<void> {
  for (const relativePath of gitOperationMetadataPaths) {
    await rm(path.join(context.gitDir, relativePath), { force: true, recursive: true });
  }

  for (const relativePath of backup.metadataPaths) {
    if (
      !gitOperationMetadataPaths.includes(
        relativePath as (typeof gitOperationMetadataPaths)[number],
      )
    ) {
      throw new Error(`Invalid Git operation metadata backup path: ${relativePath}`);
    }

    const source = path.join(backup.metadataBackupPath, relativePath);
    const destination = path.join(context.gitDir, relativePath);

    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, {
      preserveTimestamps: true,
      recursive: true,
      verbatimSymlinks: true,
    });
  }
}

async function pathExistsWithoutFollowing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function cleanupPrivateRefs(context: GitContext, id: string): Promise<void> {
  const prefix = `refs/sm/staged-run/${context.worktreeId}/${id}/`;
  const output = await runGit(["for-each-ref", "--format=%(refname)", prefix], {
    cwd: context.repoRoot,
  });

  for (const ref of output
    .split("\n")
    .map(value => value.trim())
    .filter(Boolean)) {
    await runGit(["update-ref", "-d", ref], { cwd: context.repoRoot });
  }
}

async function restoreIndexFile(
  backupPath: string,
  destinationPath: string,
  existed: boolean,
  id: string,
): Promise<void> {
  if (!existed) {
    await rm(destinationPath, { force: true });
    return;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.sm-${id}.tmp`;

  await copyFile(backupPath, temporaryPath);
  await rename(temporaryPath, destinationPath);
}

async function assertFileHash(
  filePath: string,
  expectedHash: string,
  description: string,
): Promise<void> {
  if (!(await pathExists(filePath)) || (await hashFile(filePath)) !== expectedHash) {
    throw new Error(`The child command modified the ${description}.`);
  }
}

function privateRef(context: GitContext, id: string, name: string): string {
  return `refs/sm/staged-run/${context.worktreeId}/${id}/${name}`;
}

function literalPathspecs(paths: string[]): string[] {
  return paths.map(filePath => `:(top,literal)${filePath}`);
}

function nulInput(values: string[]): string {
  return `${values.join("\0")}\0`;
}

function resolveTrackedPath(repoRoot: string, filePath: string): string {
  const absolutePath = path.resolve(repoRoot, filePath);
  const relativePath = path.relative(repoRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to restore a path outside the worktree: ${filePath}`);
  }

  return absolutePath;
}
