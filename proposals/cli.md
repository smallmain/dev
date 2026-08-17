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

- `--yes`: Skip the TUI and use command-line arguments and defaults directly.
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

- When `--yes` is specified or the command runs in a non-interactive terminal, command-line arguments and defaults are used without showing the TUI.
- The target is always the current working directory. The directory is not cleared, but template and generated files with the same names are overwritten.
- If the current directory is not inside a Git worktree, run `git init`.
- Generate configuration and dependencies from `Runtime`, `Components`, and `CSS`; Vitest is always enabled.
- Install dependencies with the selected package manager.
- After installation, if `@smallmains/dev` exists in the project, run project checks in fix mode and format the files. A check failure makes creation fail.

Generated output:

- Always generate the base project files and TypeScript, Oxlint, Oxfmt, Vitest, and VS Code configurations; generate a Stylelint configuration when `CSS` is selected.
- `package.json` always contains `check`, `check:fix`, and `test` scripts; add a `prepare` script when `Git Hook` is selected.
- Development dependencies always include `@smallmains/dev`, TypeScript, Oxlint, Oxfmt, oxlint-tsgolint, and Vitest; add `@types/node` for the `Node.js` runtime and Stylelint when `CSS` is selected.
- `Runtime` selects the TypeScript configuration and runtime-specific Oxlint configuration; the `React` and `Security` components add their corresponding Oxlint configurations.
- The `CSS` type selects the generic, CSS Modules, or Tailwind Stylelint configuration.

### check

This command checks the project using the checking tools in the project.

Tool execution rules:

- Run a tool only when its command is available and the project contains a corresponding configuration file or `package.json` configuration field.
- Run Oxlint, Stylelint, and Oxfmt in order. A tool failure does not prevent later tools from running, and any tool failure makes the command fail.
- When files are specified, Oxlint and Oxfmt receive all files, while Stylelint receives only its supported file types.
- When no files are specified, each tool checks the project according to its own configuration; Stylelint uses the built-in style-file pattern.

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

This command appends matching Git staged files to the specified command and runs it.

Input requirements:

- `command` is required and must contain an executable after parsing.
- `globs...` must contain at least one Git pathspec.

Execution rules:

- Parse the command string into an executable and arguments, then launch it directly without a shell; support single quotes, double quotes, and backslash escaping.
- Use Git pathspecs to match staged files that are added, copied, modified, or renamed; deleted files are excluded.
- Append matching file paths to the command after `--`.
- Do not run the command when no files match.
- Return the command's exit code unchanged when it fails.
- When the command succeeds and `--update-index` is specified, run `git update-index --again` to add the command's changes to tracked files back to the index.

### set-git-hook

This command installs the preset Git Hooks.

Installation rules:

- Install only when `.git` exists in the current directory; otherwise, skip installation.
- Write executable, `sm`-marked `pre-commit` and `commit-msg` hooks to the Git common directory's `hooks` directory.
- Add the repository root's `node_modules/.bin` to `PATH` before invoking `sm` from a hook.
- `pre-commit` uses `sm staged-run` to run the project's `check` script. The package manager is read from `package.json#devEngines.packageManager`; npm is used only when explicitly configured, otherwise pnpm is used.
- `commit-msg` uses `sm check commit-message "$1"` to check the commit message.
- Overwrite existing `pre-commit` and `commit-msg` hooks whether or not `sm` manages them.
- When `core.hooksPath` is set, unset it automatically and use `.git/hooks`.
