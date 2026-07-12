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
<a href="./README_zh-CN.md">简体中文</a>
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
    <td><a href="#cli">CLI</a></td><td>2026.06.15</td>
  </tr>
  <tr>
    <td><a href="#editor-config">Editor Config</a></td><td>EditorConfig Specification v0.17.2; 2026.06.15</td>
  </tr>
    <tr>
    <td><a href="#vs-code-config">VS Code Config</a></td><td>VS Code v1.124.2; 2026.06.15</td>
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
    <td><a href="#">comments</a></td><td>2025.06.15</td>
  </tr>
    <tr>
    <td><a href="#">consistent-esm-default-name</a></td><td>2025.06.15</td>
  </tr>
</table>

## CLI

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
```

This command appends matching Git staged files to the specified command and runs it.

### set-git-hook

```bash
npx sm set-git-hook
```

This command installs preset Git Hooks:

- `pre-commit`: Uses `sm staged-run` to run checks on staged files.
- `commit-msg`: Uses `sm check commit-message "$1"` to validate commit messages.

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

| Path                              | Description                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `@smallmains/dev/ts/base.json`    | Base configuration.                                                             |
| `@smallmains/dev/ts/generic.json` | Configuration for neutral runtime environments using NodeNext modules.          |
| `@smallmains/dev/ts/browser.json` | Configuration for browser runtime environments using Bundler module resolution. |
| `@smallmains/dev/ts/nodejs.json`  | Configuration for Node.js projects.                                             |

## VS Code Config

The `.vscode` directory is generated dynamically by `sm create` based on the selected preset and components.

- `settings.json`: Includes formatting, validation, and other settings.
- `extensions.json`: Recommends VS Code extensions to install.

## Oxlint Config

Install:

```bash
npm i -D @smallmains/dev
```

Example:

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";
import generic, { vitest } from "@smallmains/dev/oxlint/generic.js";

export default defineConfig({
  extends: [generic, vitest],
});
```

All configurations are exported through `@smallmains/dev/oxlint/generic.js`:

- `default`: General configuration.
- `vitest`: Configuration for projects using Vitest.
- `react`: Configuration for projects using React.
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
{
  "extends": "@smallmains/dev/stylelint/generic.js",
}
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

| Option   | Type       | Default | Description                |
| -------- | ---------- | ------- | -------------------------- |
| `ignore` | `string[]` | `[]`    | Ignores specific comments. |

Allowed values:

```
"oxlint-disable"
"oxlint-enable"
"oxlint-disable-line"
"oxlint-disable-next-line"
"eslint-disable"
"eslint-enable"
"eslint-disable-line"
"eslint-disable-next-line"
```

### consistent-esm-default-name

- Supports ESM only; CommonJS and other module systems are not checked.
- Resolves the exported symbol name from the imported target module first. If it cannot be resolved, a valid identifier is generated from the module path.
- Infers `index` directory imports from the parent directory name, for example `./Button/index` maps to `Button`.
- Directory imports first consider the directory's own `package.json#name`; otherwise, the directory name is used.
- Anonymous exports, literal exports, object exports, and call-expression exports are ignored.

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

| Rule                                              | Description                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `consistent-esm-default-name/default-import-name` | Checks whether default import names like `import Foo from "./foo"` conform to the naming convention. |
| `consistent-esm-default-name/default-export-name` | Checks whether default export names like `export default Foo` conform to the naming convention.      |

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

- Description: When the exported symbol name cannot be resolved from the imported target module, derives the name from the import path according to templates. Templates are matched in array order, and the first matching entry is used.
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

3. Treat characters that cannot appear in identifiers as separators, remove them, and uppercase the next valid character
   - `foo-bar` -> `fooBar`
   - `foo.bar` -> `fooBar`
   - `foo bar` -> `fooBar`

4. Preserve characters that can be part of identifiers
   - `foo_bar` -> `foo_bar`
   - `$foo` -> `$foo`
   - `_foo` -> `_foo`

5. If the result is empty or a reserved word, append `_`
   - `class` -> `_class`
   - `123abc` -> `abc`, or fallback to `_` when no valid start can be derived

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

Anonymous exports, literal exports, object exports, and call-expression exports are ignored:

```ts
export default { ok: true };
export default createStore();
```

## Contributing

- Run `pnpm run dev` to run the CLI from source.
- Run `pnpm run dev:prod` to build and run the CLI from the output.
- Run `pnpm run build` to build the project.
- Run `pnpm run publish` to publish a new version. When `--version` is specified, it updates `package.json`, commits and pushes the version change, builds, then publishes.
  - `--version <version>`: Specifies the version number, such as `patch`, `minor`, `major`, or an exact version.

### CLI create

The `npx sm create` command uses fields from `package.json` as default values.

## License

[MIT @ SmallMain](./LICENSE)
