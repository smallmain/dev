<!-- <p align="center">
<img src="" style="width:100px;" />
</p> -->

<h1 align="center">
SmallMain's Development Scaffolding
</h1>

<p align="center">
Development scaffolding used by SmallMain.
</p>

<!-- <br>
<p align="center">
<a href="https://unocss.dev/">Documentation</a> |
<a href="https://unocss.dev/play/">Playground</a>
</p>
<br> -->

<br>
<p align="center">
<span>English</span> |
<a href="./README.zh.md">简体中文</a>
</p>

## Overview

<table>
  <tr>
    <th>Technology</th><th>Component</th><th>Last Updated</th>
  </tr>
  <tr>
    <td rowspan="4">-</td>
  </tr>
  <tr>
    <td><a href="#cli">CLI</a></td><td>2026.08.18</td>
  </tr>
  <tr>
    <td><a href="#editor-config">Editor Config</a></td><td>EditorConfig Specification v0.17.2; 2026.06.15</td>
  </tr>
    <tr>
    <td><a href="#vs-code-config">VS Code Config</a></td><td>VS Code v1.124.2; 2026.08.18</td>
  </tr>
  <tr>
    <td rowspan="2">Specification</td>
  </tr>
  <tr>
    <td><a href="#web-specification">Web</a></td><td>2025.08.14</td>
  </tr>
  <tr>
    <td rowspan="5">Web</td>
  </tr>
  <tr>
    <td><a href="#ts-config">TS Config</a></td><td>2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#oxlint-config">Oxlint Config</a></td><td>2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#oxfmt-config">Oxfmt Config</a></td><td>2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#stylelint-config">Stylelint Config</a></td><td>2025.06.15</td>
  </tr>
  <tr>
    <td rowspan="3">Oxlint Plugin</td>
  </tr>
  <tr>
    <td><a href="#comments">comments</a></td><td>2025.06.15</td>
  </tr>
    <tr>
    <td><a href="#consistent-esm-default-name">consistent-esm-default-name</a></td><td>2025.06.15</td>
  </tr>
</table>

## CLI

Requirements:

- Node.js 24
- Git

Install:

```bash
npm i -D @smallmains/dev
```

### create

```bash
npx sm create                   # Interactive interface
npx sm create --yes             # Create directly, skipping the interactive interface
npx sm create --component react # Control defaults through arguments; use `-h` to view all arguments
```

This command quickly creates a project from a preset template.

- It does not empty the current working directory, but it will overwrite existing files.
- In an interactive terminal, a failed package-manager process prompts whether to retry. `--yes` skips the interactive interface entirely, including this retry prompt.
- After dependency installation succeeds, it runs all project checks in fix mode and reports creation success only when they pass.

### check

```bash
npx sm check                 # Run linter and formatter checks
npx sm check src/**/*.ts     # Check specified files

npx sm check --fix           # Automatically fix errors
npx sm check --no-format     # Run only linter checks
npx sm check --no-lint       # Run only formatter checks

npx sm check lint            # Run linter checks
npx sm check format          # Run formatter checks
npx sm check commit-message --text "feat: add login" # Check a commit message
npx sm check commit-message .git/COMMIT_EDITMSG      # Check a commit message file
```

This command checks files using Linters and Formatters installed in the project.

Supported Linters:

- Oxlint
- Stylelint

Supported Formatters:

- Oxfmt

### staged-run

```bash
npx sm staged-run "npm run check" "."
npx sm staged-run --update-index "npm run check:fix" "." # Re-stage files after automatic fixes
```

This command appends matching Git staged files to the specified command and runs it.

### set-git-hook

```bash
npx sm set-git-hook
```

This command installs preset Git Hooks:

- Existing hooks are overwritten.
- `pre-commit`: Uses `sm staged-run` to run checks on staged files.
- `commit-msg`: Uses `sm check commit-message "$1"` to validate commit messages.

## Specification

### Web Specification

| Path                  | Description                       |
| --------------------- | --------------------------------- |
| `specs/web/coding.md` | TypeScript coding specification.  |
| `specs/web/ecc.md`    | ECMAScript conditional constants. |
| `specs/web/esp.md`    | ECMAScript package specification. |
| `specs/web/jds.md`    | JSDoc specification.              |

## Editor Config

| Path                           | Description            |
| ------------------------------ | ---------------------- |
| `configs/common/.editorconfig` | General configuration. |

## TS Config

Install:

```bash
npm i -D @smallmains/dev
```

Example:

`tsconfig.json`

```jsonc
{
  "extends": "@smallmains/dev/ts/base.json",
  "include": ["src"],
}
```

| Path                              | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `@smallmains/dev/ts/base.json`    | Base configuration.                                                  |
| `@smallmains/dev/ts/generic.json` | Configuration for neutral runtimes using the `preserve` module mode. |
| `@smallmains/dev/ts/browser.json` | Configuration for browser runtimes using the `esnext` module mode.   |
| `@smallmains/dev/ts/nodejs.json`  | Configuration for Node.js runtimes using the `nodenext` module mode. |

## VS Code Config

The configuration is generated dynamically by `sm create` from template files based on the selected preset and components.

## Oxlint Config

Install:

```bash
npm i -D @smallmains/dev
```

Example:

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";
import generic, { inheritSettings, vitest } from "@smallmains/dev/oxlint/generic.js";

export default defineConfig({
  extends: [generic, vitest],
  // TODO(oxc-project/oxc#24337): Remove this workaround once extended configs inherit settings.
  settings: inheritSettings,
});
```

All configurations are exported through `@smallmains/dev/oxlint/generic.js`:

- `default`: General configuration.
- `vitest`: Configuration for projects using Vitest.
- `react`: Configuration for projects using React.
- `nextjs`: Configuration for projects using Next.js.
- `nodejs`: Configuration for projects using Node.js.
- `security`: Configuration for security-conscious projects.

## Oxfmt Config

Install:

```bash
npm i -D @smallmains/dev
```

Example:

`oxfmt.config.ts`

```ts
import generic from "@smallmains/dev/oxfmt/generic.js";

export default generic;
```

| Path                               | Description            |
| ---------------------------------- | ---------------------- |
| `@smallmains/dev/oxfmt/generic.js` | General configuration. |

## Stylelint Config

Install:

```bash
npm i -D @smallmains/dev
```

Example:

`stylelint.config.ts`

```ts
import type { Config } from "stylelint";

export default {
  extends: "@smallmains/dev/stylelint/generic.js",
} satisfies Config;
```

| Path                                       | Description                                    |
| ------------------------------------------ | ---------------------------------------------- |
| `@smallmains/dev/stylelint/generic.js`     | General configuration.                         |
| `@smallmains/dev/stylelint/css-modules.js` | Configuration for projects using CSS Modules.  |
| `@smallmains/dev/stylelint/tailwind.js`    | Configuration for projects using Tailwind CSS. |

## Oxlint Plugin

Install:

```bash
npm i -D @smallmains/dev
```

### comments

Example:

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@smallmains/dev/oxlint/plugins/comments.js"],
  rules: {
    "comments/require-description": "error",
  },
});
```

Rules:

| Rule                           | Description                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `comments/require-description` | Requires all Oxlint [inline ignore comments](https://oxc.rs/docs/guide/usage/linter/ignore-comments.html) to include a description. |

#### require-description

| Option   | Type       | Default | Description                                      |
| -------- | ---------- | ------- | ------------------------------------------------ |
| `ignore` | `string[]` | `[]`    | Ignores specified Oxlint inline ignore comments. |

Allowed values:

```
"oxlint-disable"
"oxlint-enable"
"oxlint-disable-line"
"oxlint-disable-next-line"
```

### consistent-esm-default-name

- Supports ESM only; CommonJS and other module systems are not checked.
- `default-import-name` prefers the named default export from the imported target module and generates a valid identifier from the module path only when no name can be obtained.
- Infers `index` directory imports from the parent directory name, for example `./Button/index` maps to `Button`.
- Directory imports first consider the directory's own `package.json#name`; otherwise, the directory name is used.
- `default-export-name` checks named default export names against the current file path and templates.
- Both rules automatically fix bindings and all their references when they can be renamed safely.
- `default-export-name` ignores default exports without binding names; when these modules are imported, `default-import-name` still falls back to the module path.

Example:

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["@smallmains/dev/oxlint/plugins/consistent-esm-default-name.js"],
  settings: {
    "consistent-esm-default-name": {
      ignorePaths: [
        // ...
      ],
      ignoreSpecifiers: [
        // ...
      ],
      template: [
        // ...
      ],
    },
  },
  rules: {
    "consistent-esm-default-name/default-import-name": "error",
    "consistent-esm-default-name/default-export-name": "error",
  },
});
```

Rules:

| Rule                                              | Description                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `consistent-esm-default-name/default-import-name` | Checks the local binding name of a default import and fixes it automatically when safe.           |
| `consistent-esm-default-name/default-export-name` | Checks a named default export against the current file path and fixes it automatically when safe. |

#### Settings

**ignoreSpecifiers**

- Description: Ignores specific import path patterns and does not check the names of these default imports.
- Type: `string[]`
- Default: `[]`

Example:

```ts
{
  ignoreSpecifiers: ["^virtual:", "^@generated/", "\\?raw$"],
}
```

Ignored examples:

```ts
import routes from "virtual:routes";
import client from "@generated/client";
import readme from "./README.md?raw";
```

**ignorePaths**

- Description: Ignores specific file path patterns and does not check the names of these files when they are imported targets or default export files.
- Type: `string[]`
- Default: `[]`

Example:

```ts
{
  ignorePaths: ["src/generated/**"],
}
```

Ignored import example:

```ts
import client from "./generated/client";
```

Default exports in matching files are also ignored:

```ts
// src/generated/client.ts
export default function generatedClient() {}
```

**template**

- Description: When `default-import-name` cannot obtain a named default export from the imported target module, it derives the name from the import path according to templates. `default-export-name` derives the expected name from the current file path and templates. Templates are matched in array order, and the first matching entry is used.
- Type: `TemplateEntry[]`
- Default:

  ```ts
  [{ match: ".*", format: "typescript" }];
  ```

`TemplateEntry`

```ts
{
  match: string;
  name?: string;
  strip?: string | string[];
  format?: "typescript" | "preserve" | "camel" | "pascal" | "snake" | "kebab" | "flat" | "upper" | "lower";
  prefix?: string;
  suffix?: string;
}
```

TypeScript algorithm:

1. Take the base name first
   - For regular paths, take the last segment: `./user-service` -> `user-service`
   - For `index` entries, take the parent directory: `./Button/index` -> `Button`
   - For package subpaths, take the last segment: `lodash/merge` -> `merge`
   - For scoped package entries, take the last segment of the package name: `@scope/ui` -> `ui`
   - For directory entries like `"."` / `".."`, first check the target directory's `package.json#name`, such as `@demo/source-package` -> `source-package`

2. Strip the extension
   - `button.tsx` -> `button`
   - `user.service.ts` -> `user.service`

3. If the first character cannot start an identifier, prefix `_`
   - `123abc` -> `_123abc`

4. Treat characters that cannot be part of identifiers as separators, remove them, and uppercase the next valid character
   - `foo-bar` -> `fooBar`
   - `foo.bar` -> `fooBar`
   - `foo bar` -> `fooBar`

5. Preserve characters that can be part of identifiers
   - `foo_bar` -> `foo_bar`
   - `$foo` -> `$foo`
   - `_foo` -> `_foo`

6. If the result is empty, fall back to `_`; if it is a reserved word, prefix `_`
   - `class` -> `_class`

Examples:

```ts
"foo-bar"        -> "fooBar"
"user-service"   -> "userService"
"@scope/ui"      -> "ui"
"lodash/merge"   -> "merge"
"./Button/index" -> "Button"
"."              -> last segment of current directory package.json#name, otherwise directory name
```

Example:

```ts
[
  { match: "\\.css(?:[?#].*)?$", name: "styles" },
  { match: "\\.svg\\?(?:.*\\breact\\b.*)$", format: "pascal", suffix: "Icon" },
  { match: "\\.svg\\?(?:.*\\burl\\b.*)$", format: "camel", suffix: "Url" },
  { match: "\\.svg(?:[?#].*)?$", format: "camel", suffix: "Src" },
  { match: "\\.(jsx|tsx)(?:[?#].*)?$", format: "pascal" },
  { match: ".*", format: "camel" },
];
```

Corresponding imports:

```ts
import styles from "./button.css"; // fixed name styles
import CloseIcon from "./close.svg?react"; // pascal + Icon
import closeUrl from "./close.svg?url"; // camel + Url
import closeSrc from "./close.svg"; // camel + Src
import Button from "./button.tsx"; // pascal -> Button
import userService from "./user-service"; // fallback camel
```

Example:

```ts
{
  template: [{ match: "\\.service\\.ts$", strip: "\\.service$", format: "pascal", suffix: "Service" }],
}
```

Corresponding file:

`user.service.ts`

```ts
export default class UserService {}
```

The following default exports without binding names are ignored by `default-export-name`; when they are imported, `default-import-name` falls back to the module path and `template`:

```ts
export default { ok: true };
export default createStore();
```

## Contributing

- Run `pnpm run dev` to run the CLI from source.
- Run `pnpm run dev:prod` to build and run the CLI from the output.
- Run `pnpm run build` to build the project.
- Run `pnpm test` to run the test suite.
- Run `pnpm run publish` to publish a new version. When `--version` is specified, it updates `package.json`, commits and pushes the version change, builds, then publishes.
  - `--version <version>`: Specifies the version number, such as `patch`, `minor`, `major`, or an exact version.

### CLI create

The `npx sm create` command uses the fields in the `@smallmains/dev` package's `package.json` file to generate some values.

## License

[MIT @ SmallMain](./LICENSE)
