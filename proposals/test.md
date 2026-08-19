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

- `create`: cover default and custom options, invalid options, template rendering, template file suffixes, JSON normalization, generated files, scripts, dependencies, package-manager invocation, and whether the generated project passes `sm check` immediately.
- `check`: cover Oxlint, Stylelint, and Oxfmt success, failure, and fixes separately; file-type filtering; subcommand options; exit codes; and commit-message input from text, a file, and the default Git path.
- `staged-run`: cover argument validation, no matching files, appending staged files, command exit-code propagation, and `--update-index`.
- `set-git-hook`: cover hook contents, skipping without `.git`, overwriting existing hooks by default, and clearing `core.hooksPath`.

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
