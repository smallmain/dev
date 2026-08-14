# JSDoc Specification

English | [简体中文](jds.zh.md)

## @deprecated

This tag marks a symbol as deprecated.

`@deprecated [<summary>]`

- The first line should be a brief summary.
- A more detailed multi-line description is allowed.

```js
/**
 * @deprecated Since version 1.0.0, please use the {@link ...} interface instead.
 * Because...
 */
```

## @since

This tag marks the version from which a symbol became available.

`@since <semver>`

```js
/**
 * @since 1.0.0
 */
```

## @throws

This tag describes errors that a symbol may throw.

`@throws [{<type>}] [<summary>]`

- The first line may specify the thrown type. Each tag corresponds to one type.
- The first line may briefly summarize the thrown error.
- A more detailed multi-line description is allowed.

```js
/**
 * @throws {Error} Will throw an error if the argument is null.
 * If you...
 */
```

## @example

This tag describes usage examples of a symbol.

`@example [<summary>]`

- The same symbol may declare multiple `@example` tags.
- The first line may include a brief summary of the example. An example without a summary is treated as the default example.

````js
/**
 * @example
 * ```ts
 * call("hello");
 * ```
 * @example Advanced Usage
 * ```ts
 * call("hello", {...});
 * ```
 */
````

## @platform

This tag describes a symbol's availability on specific platforms.

`@platform [!]<platform-identifier> [<semver-range>...]`

- A platform identifier must not contain `!` or spaces.
- Prefixing the platform identifier with `!` means the symbol is not available on that platform.
- Multiple semantic version ranges may be specified after the platform identifier, separated by spaces.
- The same symbol may declare multiple `@platform` tags. If the ranges overlap, tags that mark unavailability take higher priority.
- Implicit rules:
  - If this tag is not declared at all, the symbol is considered available on all platforms.
  - Once any version range that marks availability is declared, version ranges that are not explicitly declared are considered unavailable.
  - If only version ranges that mark unavailability are declared, version ranges that are not explicitly declared are considered available.
- A more detailed multi-line description is allowed.

```js
/**
 * @platform ios
 * @platform !android ^1.0.0
 * Some description for android platform.
 * @platform web >=2.0.0 <3.0.0
 */
```
