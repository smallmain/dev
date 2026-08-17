# Oxlint Plugins

English | [简体中文](oxlint-plugin.zh.md)

This proposal defines the business rules and implementation constraints of the Oxlint JavaScript plugins published with the package. See the README for installation and configuration.

## comments

The `comments` plugin provides the `comments/require-description` rule, which requires Oxlint control directives to explain why rules are disabled or enabled.

### Directive Recognition

- Recognize only `oxlint-disable`, `oxlint-enable`, `oxlint-disable-line`, and `oxlint-disable-next-line`.
- Do not process control directives for other tools, including `eslint-*`.
- After leading whitespace is removed from the comment contents, the directive must be at the start of the comment; line and block comments follow the same rule.
- A description must follow `--` and contain a non-whitespace character; `--` may begin the directive body or be separated by whitespace.
- Report a missing description at the location of the whole comment and do not provide an automatic fix.

### `ignore`

- The type is an array of directive names and the default is `[]`.
- Only the four Oxlint directive names above are accepted.
- Ignored directives skip description checks while other directives are still checked.

## consistent-esm-default-name

The `consistent-esm-default-name` plugin makes ESM default import and named default export names consistent. It does not process CommonJS.

The plugin provides these rules:

- `consistent-esm-default-name/default-import-name`: checks the local binding name of a default import.
- `consistent-esm-default-name/default-export-name`: checks the name of a named default export in the current file.

Both rules share the `ignoreSpecifiers`, `ignorePaths`, and `template` settings under `settings["consistent-esm-default-name"]`.

### Default Import Names

`default-import-name` determines the name in this order:

1. Match the original module specifier against `ignoreSpecifiers` and skip it when matched.
2. Resolve the target module from the importing file with `oxc-resolver`, then check the resolved path against `ignorePaths`.
3. Parse the target module with `oxc-parser`; when a named default export can be found, use that exported name.
4. When the default export is a re-export, recursively resolve its target module; stop when a cycle is found.
5. When the file or default export name cannot be resolved, or the default export is an anonymous expression, derive the name from the module specifier and `template`.

A default export name resolved from the target module takes precedence over `template`. These named forms are supported:

- `export default Foo`
- `export default function Foo() {}`
- `export default class Foo {}`
- `export { Foo as default }`
- `export { default } from "./foo"`

Target module resolution uses automatic TypeScript configuration discovery, the `types` / `node` / `import` / `default` conditions, common JavaScript-to-TypeScript extension aliases, and `index` entry resolution. Results are cached by file path and source contents, and a source change causes the module to be parsed again.

### Default Export Names

`default-export-name` derives a name from the current file path and `template`, then checks these named forms:

- `export default Foo`
- `export default function Foo() {}`
- `export default class Foo {}`
- `export { Foo as default }`

Default exports without a binding name, including anonymous functions, anonymous classes, literals, objects, and call expressions, are ignored. Named default exports are fixed according to the [automatic fix](#automatic-fixes) rules.

### `ignoreSpecifiers`

- The type is an array of regular-expression strings and the default is `[]`.
- Match the complete, unprocessed module specifier, including query strings and fragments.
- Affect only `default-import-name`.
- Invalid regular expressions do not match.

### `ignorePaths`

- The type is an array of glob strings and the default is `[]`.
- Match both absolute paths and paths relative to the Oxlint working directory.
- Check the resolved import target for `default-import-name` and the current file for `default-export-name`.

### `template`

Type:

```ts
interface TemplateEntry {
  match: string;
  name?: string;
  strip?: string | string[];
  format?:
    | "typescript"
    | "preserve"
    | "camel"
    | "pascal"
    | "snake"
    | "kebab"
    | "flat"
    | "upper"
    | "lower";
  prefix?: string;
  suffix?: string;
}
```

Default:

```ts
[{ match: ".*", format: "typescript" }];
```

Processing rules:

1. Treat each `match` as a Unicode regular expression in array order and use the first matching entry.
2. Match imports against the original module specifier and exports against the current file path.
3. Use the base name unchanged when no entry matches; an invalid `match` never matches.
4. When `name` is specified, use the fixed name and ignore the entry's other name transformation fields.
5. Otherwise, apply the `strip` regular expressions to the base name in order, then apply `format`, `prefix`, and `suffix`; invalid `strip` expressions are ignored.
6. Preserve the processed base name when a custom entry does not specify `format`.

Format rules:

- `typescript`: generate a valid identifier in the style of TypeScript auto-imports.
- `preserve`: preserve the value.
- `camel`, `pascal`, `snake`, `kebab`, and `flat`: split the value into words, convert case, and use the corresponding join style.
- `upper` and `lower`: convert the case of the whole value.

### Base Name Derivation

The base name for an import comes from its module specifier:

- Use the last segment of a regular path and remove its final extension.
- Use the parent directory name for an `index` entry.
- Use the last segment of a package subpath and the final segment of a scoped package name for a scoped package root.
- For directory entries represented by `.`, `..`, or their combinations, prefer `package.json#name` from the target directory and otherwise use the directory name.
- Exclude query strings and fragments from base name derivation, but include them in `template.match` and `ignoreSpecifiers` matching.

The base name for an export comes from the current filename. An `index` file uses its parent directory name; other files have their final extension removed.

The `typescript` format processes each base-name character:

- Preserve Unicode identifier characters, `_`, and `$`.
- Remove characters that cannot be used in an identifier and capitalize the next valid character, so `foo-bar` becomes `fooBar`.
- Prefix `_` when the first character cannot start an identifier; preserve content that can continue an identifier, so `123abc` becomes `_123abc`.
- Use `_` when the result is empty; prefix reserved words with `_`, so `class` becomes `_class`.

### Automatic Fixes

Both rules provide automatic fixes:

- `default-import-name` renames the default import binding and all its references together.
- `default-export-name` renames the default export binding and all its references in the current file together, supporting the four named default export forms above.

Apply a fix only when all these conditions hold:

- The expected name is a valid, non-reserved binding identifier.
- No identifier with the expected name conflicts in the file.
- Oxlint can uniquely resolve the binding, declaration locations, and every reference range.

When any condition is not met, report the error without changing the code.

`default-export-name` changes only the current exporting file and does not modify importers across files.
