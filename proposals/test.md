# Testing

English | [简体中文](test.zh.md)

Use Vitest for testing.

## Execution model

- Build the complete npm package into `dist/npm/dev` before tests start.
- CLI and Oxlint plugin tests must use built artifacts instead of importing the implementation source directly.
- Set `CI=1` for child processes and capture the exit code, signal, standard output, and standard error.
- The default timeout for each end-to-end test is 300 seconds; terminate the child process and fail the test on timeout.

## End-to-end tests

CLI commands and Oxlint plugins are both verified end-to-end:

- Set up a real project fixture in a temporary directory, and run the logic under test through real commands and a real toolchain (such as Oxlint, Stylelint, and Git).
- Do not mock or stub the command under test itself or the toolchain it invokes.
- Only when a dependency would produce uncontrollable external side effects (such as installing dependencies over the network) may a minimal stand-in be used at that external boundary, and the stand-in must not change the behavior of the command under test.

## Isolation and cleanup

- Use an independent temporary directory for each group of end-to-end scenarios and do not depend on project-file state in the development repository.
- Override system-level Git configuration and use the fixture directory as `HOME` / `USERPROFILE` in Git scenarios to avoid reading user Git configuration.
- When an installed package must be simulated, link the built artifact and repository dependencies into the temporary project to preserve real module resolution relationships.
- Delete temporary directories after successful tests; preserve them and print their paths when a test fails or `KEEP_TEST_TEMP=1` is set.

## Coverage

### CLI

- `create`: cover default and custom options, invalid options, template rendering, template file suffixes, JSON normalization, generated files, scripts, dependencies, and package-manager invocation.
- `create` installation recovery: in an interactive terminal without `--yes`, cover declining and accepting a retry after a retryable installation failure, repeated failures, and a successful retry that proceeds to the final checks without rendering the project again. Cover immediate failure with `--yes`, in a non-interactive terminal, and for interrupted and command-start failures.
- `create` phase control: verify that an installation failure prevents the final checks and the success report, and that a failed final check prevents the success report after installation succeeds.
- Successful `create` scenarios must expose the built package and real check tools as installed project dependencies, intentionally render at least one non-canonical file, prove that the final fix phase repairs it, and verify that the generated project immediately passes `sm check`. Do not pre-format the template merely to make this test pass.
- `check`: cover Oxlint, Stylelint, and Oxfmt success, failure, and fixes separately; file-type filtering; subcommand options; exit codes; and commit-message input from text, a file, and the default Git path.
- `check` tool selection: cover running an installed tool with both explicit and default configuration, skipping an uninstalled tool, and not running disabled tool categories.
- `staged-run`: use the four test layers below to verify its CLI, Git transaction, recovery, and hook behavior.
- `set-git-hook`: cover hook contents, skipping without `.git`, overwriting existing hooks by default, and clearing `core.hooksPath`.

#### staged-run

Use four complementary test layers:

1. Pure unit tests cover task and management argument parsing, NUL-delimited Git record parsing, copy and rename destinations, Git-version parsing, transaction-state transitions, exit and signal mapping, and recursive argument-list splitting. Unit tests may inject internal adapters but must use built CLI modules rather than source modules.
2. Temporary-repository end-to-end tests invoke the built `sm` executable and real Git commands. Cover staged additions, copies, modifications, renames, excluded deletions and special entries, pathspec defaults and magic, invocation from a subdirectory, absolute child paths, project-local executable resolution, raw argument pass-through without shell interpretation, caller-provided child separators, filenames containing whitespace and control characters, silent no-match behavior, and sequential argument chunks.
3. Real-commit integration tests install and execute the generated hook through default `git commit`, `git commit -- <path>`, and `git commit -a`. Verify npm and pnpm hook contents, successful commits, aborted commits, candidate/default-index synchronization, and preservation of unrelated staged entries.
4. Fault-injection tests fail every mutating transaction boundary: persistent backup, manifest transition, partial-change hiding, child launch and completion, active-index staging, parent-index-lock staging, normal patch restore, temporary-index three-way restore, verification, rollback, and cleanup. Also terminate a real subprocess after persistent backup to exercise crash recovery.

The repository scenarios must additionally cover:

- Fully and partially staged text and binary files, including matched and unmatched partially staged files. Verify that hidden unstaged changes are restored, matched fixes alone are staged, successful unmatched changes remain unstaged, and untracked or ignored files are untouched.
- Child failure, signal interruption, launch failure, a later chunk failure, direct child index mutation, patch conflicts, internal Git failures, rollback failure, empty results with and without `--allow-empty`, and cleanup failure after the commit point.
- Unborn branches, linked worktrees, and resolved merge, cherry-pick, revert, rebase, and am states. Verify operation metadata byte-for-byte where practical and verify merge empty-result handling against both parents.
- Preflight rejection without mutation for old Git versions, bare repositories, unmerged entries, intent-to-add entries, sparse-checkout, sparse indexes, and skip-worktree entries.
- Per-worktree locking, live and orphaned locks, blocking on incomplete transactions, listing recoveries, reversible recovery, consuming a recovered record, `cleanup-only`, forced discard, and refusal to discard a live transaction.
- `SIGINT` and `SIGTERM` rollback and persistent recovery after an uncatchable termination on platforms that expose those signals. Shared recovery semantics must remain testable through fault injection on other platforms.
- Output contracts: no-match execution is silent, successful execution adds no wrapper output around child output, and transaction or recovery diagnostics appear only on failure.

For every success, rollback, and recovery scenario, assert the relevant raw index contents and tree, staged diff, tracked working-tree contents and modes, unstaged diff, operation metadata, untracked files, transaction assets, and private refs. Also verify that `refs/stash` is unchanged. Do not rely only on command output or `git status` summaries.

The suite must remain portable and runnable locally on supported platforms. Adding a CI workflow and setting performance thresholds are outside this proposal.

### Configuration and plugins

- Verify that the generic Oxlint configuration in the published artifact loads its JavaScript plugins and can run their rules.
- `comments`: cover missing descriptions, present descriptions, ignored ESLint directives, and the `ignore` option.
- `consistent-esm-default-name`: cover module resolution and fallback naming, default re-exports, ignore settings, template transformations, default export checks, safe automatic fixes for default imports and exports, name conflicts, and parser cache invalidation.

## Assertions

- Successful scenarios must assert an exit code of `0` and no timeout.
- Failure scenarios must assert a nonzero exit code and, when possible, a structured diagnostic or observable final state that identifies the failure reason.
- Use the exit code, signal, timeout state, and observable final state as the primary machine-readable contracts. Do not infer success or failure from human-readable summaries.
- When a tool provides structured output, such as JSON, SARIF, a report file, or a programmatic API, enable and parse it. Assert semantic fields such as rule identifiers, file paths, severities, counts, and statuses instead of searching the complete standard output or standard error as text.
- Do not strip ANSI control sequences or normalize terminal spacing, colors, or summary wording to make semantic assertions pass. Presentation-only changes in third-party tools must not break tests.
- Assert human-readable standard output or standard error only when that text is an intentionally supported, package-owned interface, such as help, usage, or a stable CLI error. Third-party output may be included as failure context, but must not be the sole semantic assertion.
- When structured output is unavailable, combine process status with an observable final state or a narrowly scoped package-owned output contract.
- Scenarios involving files, configuration, the Git index, or automatic fixes must assert the final state instead of checking command output alone.
