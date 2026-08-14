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
- `GitHub Repository`: GitHub repository name.
- `Package Manager`: Package manager. Supports `npm` and `pnpm`.
- `Runtime`: Runtime environment. Supports `Neutral`, `Browser`, and `Node.js`.
  - `Node.js` sub-options:
    - `Node.js version`: Node.js version. Defaults to `^24`.
- `Components`: Component list. Supports `Git Hook`, `React`, `CSS`, and `Security`.
  - `CSS` sub-options:
    - `CSS`: Supports `Native`, `CSS Modules`, and `Tailwind CSS`.

### check

This command checks the project using the checking tools in the project.

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

### staged-run

This command appends matching Git staged files to the specified command and runs it.

### set-git-hook

This command installs the preset Git Hooks.
