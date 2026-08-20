import { parseStagedRunArguments, stagedRunUsage } from "./staged-run/args.ts";
import { discoverStagedFiles, preflightGit, resolveGitContext } from "./staged-run/git.ts";
import {
  discardStagedRunRecovery,
  listStagedRunRecoveries,
  recoverStagedRun,
} from "./staged-run/recovery.ts";
import { runStagedTransaction } from "./staged-run/transaction.ts";

export async function runStagedRunCommand(args: string[]): Promise<void> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(stagedRunUsage);
    return;
  }

  const request = parseStagedRunArguments(args);
  const context = await resolveGitContext(process.cwd());

  if (request.kind === "list") {
    await listStagedRunRecoveries(context);
    return;
  }

  if (request.kind === "recover") {
    await recoverStagedRun(context, request.id);
    return;
  }

  if (request.kind === "discard") {
    await discardStagedRunRecovery(context, request.id);
    return;
  }

  await preflightGit(context);
  const files = await discoverStagedFiles(context, request.pathspecs);

  if (files.length === 0) {
    return;
  }

  const exitCode = await runStagedTransaction(context, request, files);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
