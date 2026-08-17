# Package Build and Publish

English | [简体中文](package.zh.md)

This proposal defines how the npm package is built and published.

## Development

`pnpm run dev` runs the CLI directly from `src/index.ts` with Node.js type stripping enabled.
`pnpm run dev:prod` rebuilds the complete package first, then runs the generated `bin/sm.js`.

Both commands follow the same invocation rules:

- Remove one leading `--` argument before forwarding the remaining arguments to the CLI.
- Use `--help` when no CLI arguments remain.
- Run the CLI in `INIT_CWD` when it is set; otherwise, use the script process's current working directory.
- Inherit standard input, output, and error, and fail when the CLI process fails.

## Build

Build output is always written to `dist/npm/dev`, and that directory is deleted and recreated before every build.

Build rules:

- Generate the output `package.json` from the root `package.json`, removing the repository-only `scripts` and `devEngines` fields.
- Copy `configs/web/typescript` to `ts`, and copy `configs/common` and `templates` to the output while preserving their directory structures.
- Compile all of `configs/web` in one TypeScript compilation, preserving the `oxlint`, `oxfmt`, `stylelint`, and internal `shared` directory structures while emitting JavaScript and declarations; relative source imports use `.js` extensions.
- Compile all of `src` in a separate TypeScript compilation to `cli`, using NodeNext module resolution and rewriting relative TypeScript import extensions.
- Generate the executable `bin/sm.js` entry point and the empty package entry points `index.js` and `types/index.d.ts`.
- The root `package.json#files` determines the published content and must include internal directories required by compiled configurations at runtime.

## Publish

`pnpm run publish` publishes from `dist/npm/dev`. The script consumes its custom `--version` argument and forwards all other arguments unchanged to `pnpm publish`.

Publish rules:

- When `--version` is omitted, use the current version from the root `package.json`.
- `--version` accepts `major`, `minor`, `patch`, or a concrete SemVer version; invalid versions and versions equal to the current version fail.
- When a version is specified and the operation is not a dry run, the working tree must be clean. Update the root `package.json`, create and push a `chore: release v<version>` commit, then build and publish.
- When a version is specified and the arguments forwarded to pnpm include `--dry-run` or `--dry-run=true`, do not modify source files or Git; change only the version in the build output.
- Always rebuild before publishing, then run `pnpm publish` in the output directory.
