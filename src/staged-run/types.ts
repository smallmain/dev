export interface StagedRunTaskRequest {
  allowEmpty: boolean;
  args: string[];
  command: string;
  kind: "task";
  pathspecs: string[];
}

export interface StagedRunListRequest {
  kind: "list";
}

export interface StagedRunRecoverRequest {
  id: string;
  kind: "recover";
}

export interface StagedRunDiscardRequest {
  force: true;
  id: string;
  kind: "discard";
}

export type StagedRunRequest =
  | StagedRunTaskRequest
  | StagedRunListRequest
  | StagedRunRecoverRequest
  | StagedRunDiscardRequest;

export interface StagedFile {
  absolutePath: string;
  path: string;
  status: "A" | "C" | "M" | "R";
}

export interface GitContext {
  activeIndexPath: string;
  defaultIndexPath: string;
  doubleWriteIndexPath?: string;
  gitCommonDir: string;
  gitDir: string;
  invocationCwd: string;
  parentManagedIndex: boolean;
  repoRoot: string;
  worktreeId: string;
}

export type TransactionPhase =
  | "preparing"
  | "backed-up"
  | "hiding"
  | "hidden"
  | "running"
  | "staging"
  | "restoring"
  | "verifying"
  | "committed"
  | "cleanup-only"
  | "saved";

export interface BackupRef {
  name: string;
  oid: string;
}

export interface TransactionBackup {
  activeIndexBackupPath: string;
  activeIndexExisted: boolean;
  defaultIndexBackupPath?: string;
  defaultIndexExisted?: boolean;
  doubleWriteIndexBackupPath?: string;
  indexTree: string;
  metadataBackupPath: string;
  metadataHash: string;
  metadataPaths: string[];
  originalIndexPaths: string[];
  refs: BackupRef[];
  worktreeTree: string;
}

export interface TransactionManifest {
  backup?: TransactionBackup;
  context: GitContext;
  createdAt: string;
  id: string;
  kind: "recovery" | "transaction";
  matchedPaths: string[];
  ownerPid: number;
  partialPatchPath?: string;
  partialPaths: string[];
  phase: TransactionPhase;
  version: 1;
}

export interface TransactionPaths {
  directory: string;
  manifest: string;
  root: string;
}

export interface TaskResult {
  code?: number;
  internalError?: Error;
  launchError?: Error;
  signal?: NodeJS.Signals;
}
