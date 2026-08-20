# CLI

English | [简体中文](cli.zh.md)

This is a command-line tool that provides a set of commands to help developers complete development tasks.

## Subcommands

### create

This command quickly creates a project from a preset template.

Interactive creation flow:

- Shows a TUI form for the user to fill in template information.
- The first field is `Preset`, used to select the preset template. Subsequent fields are generated dynamically based on the selected preset.

Preset list:

`Npm Package`

- `Package Name`: Package name.
- `Package Description`: Package description.
- `Chinese Name`: Chinese name.
- `Chinese Description`: Chinese description.
- `GitHub Owner`: GitHub repository owner.
- `GitHub Repo`: GitHub repository name.
- `Package Manager`: Package manager. Supports `npm` and `pnpm`; defaults to `pnpm`.
- `Runtime`: Runtime environment. Supports `Neutral`, `Browser`, and `Node.js`; defaults to `Neutral`.
  - `Node.js` sub-options:
    - `Node version`: Node.js version. Defaults to `^24`.
- `Components`: Component list. Supports `Git Hook`, `React`, `CSS`, and `Security`; selects `Git Hook` by default.
  - `CSS` sub-options:
    - `CSS`: Supports `Native`, `CSS Modules`, and `Tailwind CSS`; defaults to `Native`.

Command-line input:

- `--yes`: Skip the interactive interface and use command-line arguments and defaults directly. Installation failures do not show a recovery prompt.
- `--preset <preset>`: Corresponds to `Preset`; only `npm-package` is supported.
- `--name <name>`, `--description <description>`, `--zh-name <name>`, `--zh-description <description>`, `--github-owner <owner>`, `--github-repo <repo>`: Correspond to the template information fields with the same names; none may be empty after defaults are resolved.
- `--package-manager <package-manager>`: Corresponds to `Package Manager`; supports `npm` and `pnpm`.
- `--runtime <runtime>`: Corresponds to `Runtime`; supports `neutral`, `browser`, and `nodejs`.
- `--node-version <version>`: Used only for the `nodejs` runtime; supports a major version or full version, optionally prefixed with `^`.
- `--component <component>`: Corresponds to `Components`; may be repeated or comma-separated. After empty and duplicate values are removed, `git-hook`, `react`, `css`, and `security` are supported; defaults to `git-hook` when no effective value is specified.
- `--css <css>`: Corresponds to `CSS`; supports `native`, `css-modules`, and `tailwind`, and defaults to `native`. It affects generated output only when the `css` component is selected.

Text field defaults:

- `Package Name` uses the package name converted from the current directory name, and `GitHub Repo` uses the package name without its scope.
- `Package Description`, `Chinese Name`, `Chinese Description`, and `GitHub Owner` default to `Description.`, `名称`, `描述。`, and `smallmain`, respectively.

Generation rules:

- When `--yes` is specified or the command runs in a non-interactive terminal, command-line arguments and defaults are used without showing the interactive interface.
- The target is always the current working directory. The directory is not cleared, but template and generated files with the same names are overwritten.
- Copy `configs/common/.editorconfig` unchanged.
- Render the template files bundled with the package. Every template file ends in `.ejs`, and the output path removes only the final `.ejs` suffix; encountering another file type makes creation fail.
- Parse every rendered JSON file and rewrite it with two-space indentation and a trailing newline. Invalid rendered JSON makes creation fail.
- If the current directory is not inside a Git worktree, run `git init`.
- Generate configuration and dependencies from `Runtime`, `Components`, and `CSS`; Vitest is always enabled.
- Install dependencies with the selected package manager.
- An installation attempt is retryable when the package-manager process starts successfully and exits with a nonzero code without being interrupted by a signal. Other failures are not retryable.
- After each retryable installation failure in an interactive terminal without `--yes`, ask whether to retry. Choosing retry runs only the installation command again; it does not initialize Git or render the templates again. Continue asking after each failed retry.
- Choosing not to retry, cancelling the prompt, specifying `--yes`, encountering a non-retryable failure, or encountering any installation failure in a non-interactive terminal makes creation fail without running the final project checks or reporting creation success. The last installation failure remains the reported failure; do not emit a separate message about the skipped final checks.
- After installation succeeds, always run the complete project checks in fix mode. Rendered templates are not required to satisfy formatter rules before this phase.
- A failed final check makes creation fail. Report creation success only after all final checks succeed.
- Creation is not transactional. Files already written, dependency installation results, and fixes already applied remain when installation or the final checks fail.

Generated output:

- Always generate the base project files, a TypeScript source example, its colocated unit test, an integration test under `tests`, and TypeScript, Oxlint, Oxfmt, Vitest, and VS Code configurations; generate a Stylelint configuration when `CSS` is selected.
- VS Code `settings.json` always configures Oxc formatting and adds `stylelint.validate` only when `CSS` is selected. `extensions.json` always recommends EditorConfig, Oxc, and Vitest, and additionally recommends Stylelint when `CSS` is selected.
- `package.json` always exports `./src/index.ts` and contains `check`, `check:fix`, and `test` scripts; add a `prepare` script when `Git Hook` is selected.
- Development dependencies always include `@smallmains/dev`, TypeScript, Oxlint, Oxfmt, oxlint-tsgolint, Vitest, and its V8 coverage provider; add `@types/node` for the `Node.js` runtime and Stylelint when `CSS` is selected.
- The unit test imports the source module directly, while the integration test imports it through the generated package name.
- `Runtime` selects the TypeScript configuration and runtime-specific Oxlint configuration; the `React` and `Security` components add their corresponding Oxlint configurations.
- The `CSS` type selects the generic, CSS Modules, or Tailwind Stylelint configuration.

### build

See the [build](./cli-build.md) proposal.

### publish

TODO

### check

This command checks the project using the checking tools in the project.

Tool execution rules:

- Run each directly declared and installed tool among Oxlint, Stylelint, and Oxfmt. A tool must be declared in the current project's `dependencies`, `devDependencies`, `optionalDependencies`, or `peerDependencies` and resolvable from the project. A transitive tool, including one installed only to satisfy another package's peer dependency, does not count. When no explicit configuration is present, run the tool with its default configuration.
- Do not run tools that are not installed or are disabled by `--no-lint`, `--no-format`, or the selected subcommand.
- Run Oxlint, Stylelint, and Oxfmt in order. A tool failure does not prevent later tools from running, and any tool failure makes the command fail.
- When files are specified, Oxlint and Oxfmt receive all files, while Stylelint receives only its supported file types.
- When no files are specified, each tool checks the project according to its own configuration; Stylelint uses the built-in style-file pattern.
- Stylelint supports `.astro`, `.css`, `.ejs`, `.html`, `.less`, `.md`, `.mdx`, `.pcss`, `.sass`, `.scss`, `.svelte`, and `.vue` files.

`check`

Equivalent to running `check lint` and `check format` together.

Supported command-line arguments:

- `files...`: Specifies the list of files to check. If omitted, all project files are checked according to the rules by default.
- `--no-lint`: Do not run Linter checks.
- `--no-format`: Do not run Formatter checks.
- `--fix`: Automatically fix fixable issues.

`check lint`

Run Linter checks.

Supported Linter list:

- Oxlint
- Stylelint

Supported command-line arguments:

- `files...`: Specifies the list of files to check. If omitted, all project files are checked according to the rules by default.
- `--fix`: Automatically fix fixable issues.

`check format`

Run Formatter checks.

Supported Formatter list:

- Oxfmt

Supported command-line arguments:

- `files...`: Specifies the list of files to check. If omitted, all project files are checked according to the rules by default.
- `--fix`: Automatically fix fixable issues.

`check commit-message`

Check whether a commit message conforms to the convention.

Supported command-line arguments:

- `file`: Specifies the path of the commit message file to check. If omitted, the `.git/COMMIT_EDITMSG` file is checked by default (the parent Git directory is located automatically).
- `--text`: Check the provided commit message text.

Execution rules:

- `file` and `--text` cannot be specified together.
- Always use the built-in `@commitlint/config-conventional`; do not load a Commitlint configuration from the project.

### staged-run

This command runs one command against staged regular files matched by Git pathspecs while
preserving the Git index and tracked working-tree state.

Command forms:

```text
sm staged-run [--allow-empty] [pathspec...] -- <command> [args...]
sm staged-run --list-recoveries
sm staged-run --recover <id>
sm staged-run --discard-recovery <id> --force
```

Input and file-selection rules:

- `--` is required for a task run. The first argument after it is the executable, and all
  remaining arguments are passed through unchanged without shell or command-string parsing.
- Options after `--` belong to the child command. `staged-run` does not insert another `--`;
  callers must include a child-command separator when that command requires one.
- `pathspec...` uses Git pathspec semantics and defaults to `.`. Pathspecs are interpreted from
  the invocation directory.
- Match staged regular files that are added, copied, modified, or renamed. Use the destination
  of a copy or rename, and exclude deletions, symbolic links, and gitlinks.
- When no files match, exit successfully without acquiring a transaction lock, creating a
  backup, running the command, or printing output.
- Keep the child process in the invocation directory, resolve a project-local executable before
  a global executable, and append matched files as absolute paths.
- If the operating system rejects the argument list as too long, recursively split the matched
  paths into sequential command invocations. If one path still cannot be executed, fail the
  transaction.

Preflight rules:

- Require Git 2.32 or later and a non-bare worktree. Resolve the repository root, the current
  worktree's Git directory, and the active index, including an inherited `GIT_INDEX_FILE`, before
  making changes.
- Permit only one active transaction per worktree. A live lock makes the command fail
  immediately. An incomplete persistent transaction blocks normal execution until it is
  explicitly recovered or discarded; an orphaned lock with no transaction assets may be
  removed safely.
- Before the first mutation, reject unmerged index entries, intent-to-add entries,
  sparse-checkout, a sparse index, and skip-worktree entries.
- Support an unborn branch, linked worktrees, and resolved merge, cherry-pick, revert, rebase,
  and am states. Preserve operation metadata such as `MERGE_HEAD` and sequencer or rebase state.

Transaction rules:

- The transaction protects the exact index and tracked working-tree state. Untracked and ignored
  files are outside its scope and are not backed up, hidden, staged, or removed during rollback.
- Before changing the worktree, persist an atomic transaction manifest, an exact index backup,
  and a tracked worktree backup. With an existing `HEAD`, create the backup without mutating the
  worktree and anchor it under a private transaction ref rather than `refs/stash`; on an unborn
  branch, use index and worktree trees instead.
- Hide the unstaged changes of every partially staged tracked file in the worktree, including
  files not matched by `pathspec...`. Preserve the hidden changes as a binary, full-index patch.
- Run command chunks sequentially. A nonzero exit, signal, launch failure, or later chunk failure
  fails the complete transaction.
- The child command must not modify any active Git index. Detect an index mutation as a contract
  violation and roll back.
- After every command chunk succeeds, add back only the files that matched before command
  execution. Successful child modifications to unmatched tracked files remain unstaged.
- Restore the hidden unstaged patch over the command result. First use a normal worktree-only
  apply; when that cannot apply cleanly, attempt a three-way apply with a disposable copy of the
  repaired index. Never run a three-way apply against the real index. Any failed apply or
  unmerged temporary index fails the transaction.
- During `git commit -- <path>`, update both Git's active candidate index and the parent Git
  process's default index lock for matched files. Default commits and `git commit -a` update only
  their active index. Preserve unrelated staged entries in every case.
- If the resulting commit would have no staged changes, fail and roll back unless `--allow-empty`
  is specified. In a merge, account for both parents so a meaningful merge commit is not treated
  as empty.
- Treat the transaction as committed only after the repaired index, restored worktree, and Git
  operation metadata have been verified. Before that point, any task or internal failure restores
  the original index and tracked worktree. Propagate a child exit code only after rollback
  succeeds; a rollback failure reports an internal failure and retains recovery data.
- On success, print only child-process output. Transaction diagnostics are printed only on
  failure.

Interruption and cleanup rules:

- On `SIGINT` or `SIGTERM`, terminate the child process group, roll back, and then terminate.
  `SIGKILL` and process crashes are recovered from persistent transaction data.
- After the commit point, remove the manifest, backups, private refs, and lock. If cleanup fails,
  preserve the valid repaired user state, return failure, and retain a `cleanup-only` recovery
  record. Do not roll back a committed transaction solely because private cleanup failed.

Recovery rules:

- Store manifests and backup files atomically under the current worktree's Git directory. Private
  refs include the worktree and transaction identities so linked worktrees do not collide.
- `--list-recoveries` is read-only and lists each recovery identifier and its state.
- `--recover <id>` first saves the current index and tracked worktree as a new recovery record,
  then restores the selected record. After a successful restore, consume the selected record and
  retain the new record so the recovery can be undone. Recovering `cleanup-only` only removes
  private transaction data and does not change user files.
- `--discard-recovery <id> --force` permanently deletes one recovery record without changing the
  index or worktree. Refuse to discard a transaction owned by a live process.
- Recovery operations are scoped to the worktree that created the record.

### set-git-hook

This command installs the preset Git Hooks.

Installation rules:

- Install only when `.git` exists in the current directory; otherwise, skip installation.
- Write executable, `sm`-marked `pre-commit` and `commit-msg` hooks to the Git common directory's `hooks` directory.
- Add the repository root's `node_modules/.bin` to `PATH` before invoking `sm` from a hook.
- `pre-commit` runs `sm staged-run . -- <package-manager> run check --`. The package manager is read from `package.json#devEngines.packageManager`; npm is used only when explicitly configured, otherwise pnpm is used.
- `commit-msg` uses `sm check commit-message "$1"` to check the commit message.
- Overwrite existing `pre-commit` and `commit-msg` hooks whether or not `sm` manages them.
- When `core.hooksPath` is set, unset it automatically and use `.git/hooks`.
