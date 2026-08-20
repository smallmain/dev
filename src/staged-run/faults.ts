const requestedFaults = new Set(
  (process.env.SM_STAGED_RUN_TEST_FAULT ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);

export function injectStagedRunTestFault(point: string): void {
  if (!requestedFaults.delete(point)) {
    return;
  }

  throw new Error(`Injected staged-run test fault: ${point}`);
}

export function getStagedRunTestMaxPathsPerChunk(): number | undefined {
  const value = process.env.SM_STAGED_RUN_TEST_MAX_PATHS_PER_CHUNK;

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
