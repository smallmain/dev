# TypeScript Coding Specification

English | [简体中文](coding.zh.md)

## Naming

### Code symbols

| Type              | Naming        | Example                           |
| ----------------- | ------------- | --------------------------------- |
| Class/interface   | PascalCase    | `class UserManager`               |
| Type              | PascalCase    | `type EventHandler`               |
| Enum              | PascalCase    | `enum StatusCode`                 |
| Enum member       | PascalCase    | `enum Color { Red, Green, Blue }` |
| Namespace         | camelCase     | `namespace dataUtils`             |
| Property/variable | camelCase     | `let dateTime`                    |
| Method/function   | camelCase     | `function getValue`               |
| Constant          | CONSTANT_CASE | `const DEBUG`                     |

- Do not use naming affixes to express symbol metadata

  For example:
  - Interface names should not always add an `I` prefix.
    > A common exception is when the interface needs to be distinguished from a class of the same name.
  - Variable names should not use abbreviated prefixes that indicate scope, storage duration, or type, such as `mTime`, `gUuid`, `iTime`, or `sUuid`.
  - Private symbols should not always add a `_` prefix.
    > A common exception is when the symbol is the internal implementation of a same-named symbol.

### File system

| Type      | Naming     | Example        |
| --------- | ---------- | -------------- |
| Directory | kebab-case | `daily-system` |
| File      | kebab-case | `home-view.ts` |

### Semantic conventions

| Convention   | Description                                                                                         | Example                                    |
| ------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `acquire...` | The function returns a `Disposable` object.                                                         | `function acquireFile(): FileHandle`       |
| `when...`    | The function returns an `Observable` object.                                                        | `function when(event: string): Observable` |
| `ensure...`  | The function is a cached version of the same-named creation function and may return a cached value. | `function ensureObject(): Object`          |
| `into...`    | The function is an in-place writing version of the same-named function.                             | `function encodeInto(out: T): void`        |
| `...sync`    | The function is a synchronous version of the same-named function with the same purpose.             | `function writeSync(): boolean`            |
| `...async`   | The function is an asynchronous version of the same-named function with the same purpose.           | `function writeAsync(): Promise<boolean>`  |
| `use...`     | The function is a React Hooks function.                                                             | `function useUser(): User`                 |

## Symbol order

This section is not mandatory; it is only a recommendation and a reference.

Any symbol in the code should be ordered according to the following basic conventions:

1. Prefer placing referenced symbols after the symbols that reference them.
2. Place symbols that are of the same type, related, or similar in purpose together.
3. Place public symbols first, because they are the most likely to be of interest.

### Modules

In a module, symbols may be ordered by the following types:

1. Enums
2. Types
3. Interfaces
4. Variables
5. Classes and functions (treated as the same type)

### Classes

In a class, members may be ordered by the following types:

1. Static events
2. Static variables
3. Static methods
4. Events
5. Fields and accessors (treated as the same type)
6. Constructors
7. Abstract methods
8. Methods

## Comments

- Comments must be written in English as complete sentences: capitalize the first letter and end with a period.
- Inline comments should preferably start with a lowercase letter and may omit the period.
- If an identifier from the code appears, do not change its capitalization.
- Code, identifiers, and symbols in documentation comments must be wrapped in the `{@link symbol}` link format, and the linked symbol must have been imported at least as a `type`.
- When `{@link symbol}` cannot be used for navigation (non-documentation comments, identifiers, primitive types, or short code phrases), wrap them in backticks (\`), for example `number` and `string`.

### Inline comments

The following prefixes may be used to mark special cases or to-do items that need a developer's attention:

- `TODO:` - A to-do item that should be completed as soon as possible.
- `NOTE:` - A less important to-do item, such as an idea that has not been implemented yet.
- `FIXME:` - A problem that could not be fixed in time due to constraints.
- `HACK:` - A non-standard approach taken due to constraints.

Parentheses may also be used to add extra information related to the comment, such as a username or issue number:

- `TODO(@smallmain): This is a comment.`
- `TODO(#349): This is a comment.`

### Documentation comments

- Write them in JSDoc and Markdown format.
- The first line of each comment should be a brief summary of what the symbol does.

````js
/**
 * This is a book.
 *
 * This book is intended for referencing current coding standards
 * to better improve code maintainability.
 *
 * @param arg1 This is description.
 * @returns This is description.
 * @throws {Error} This is description.
 *
 * @example Description
 * ```ts
 * call("hello");
 * ```
 *
 * @internal
 * @experimental
 * @since 1.0.0
 * @see [Github](https://github.com)
 */
````

### Tag reference

The following lists only commonly used tags and brief descriptions. For detailed descriptions of some tags, see [JSDoc Specification](./jds.md).

**Interface stability**

- `@experimental` - Experimental interface.
- `@deprecated` - Deprecated interface.
- `@since` - The version from which the interface became available.

**Accessibility**

- `@public` - Public interface.
- `@internal` - Internal interface.

**Descriptive**

- `@param` - Describes a function parameter.
- `@returns` - Describes a function return value.
- `@template` - Describes a generic.
- `@throws` - Describes errors that may be thrown.
- `@example` - Example code.
- `@platform` - Describes platform compatibility.
- `@see` - Provides more related information.

**Identity**

- `@module` - Module. For details, see [ECMAScript Package Specification](./esp.md).
- `@event` - Event.
- `@decorator` - Decorator.

**Documentation markers**

- `@inheritdoc` - Use the documentation of the parent symbol inherited by this symbol.
- `@link` - Used only to link to other code symbols. Use Markdown link syntax for URLs, file links, and similar.

## Types

### Semantic conventions

- When representing “unknown” or “any”, use the `uncertain` type instead of `never` to make the intent explicit.

  ```ts
  type uncertain = never;
  ```

### Generics

Generic types should generally provide default values, and those defaults should keep the “unknown” / “any” semantics.

For example, this generic type that describes a class:

```ts
type Class<T extends object = object, Arguments extends readonly unknown[] = uncertain> = new (
  ...args: Arguments
) => T;
```

- The default return type is `object`, and the default argument type is `never`, which preserves the `unknown` semantics.
- Writing `Class` without specifying generic arguments preserves the “unknown class” / “any class” semantics.

  This means any class can be assigned to `Class`, which matches the “any” semantics:

  ```ts
  const a: Class = class A {};
  const b: Class = class B {
    constructor(a: number) {}
  };
  const c: Class = class C {
    constructor(a: number, b: string) {}
  };
  ```

  It also means that because the constructor argument types cannot be determined, `Class` cannot be instantiated, which matches the “unknown” semantics:

  ```ts
  function test(v: Class) {
    const instance = new v();
    //               ~~~~~~~~ > Error: ts(2345)
  }
  ```

The variance of generic types should be tested to match expectations.

Exceptions:

For the default value of `this`, prefer `void`, because `this` being `void` is very common.

Take `Getter` as an example:

```ts
type Getter<T = unknown, This = void> = (this: This) => T;
```

## Developer copy

The copy format described in this section is mainly for developer-facing content such as logs and error descriptions.

- Use English consistently, and write complete sentences: capitalize the first letter and end with a period.
- If an identifier from the code appears, do not change its capitalization.
- Code and identifiers must be wrapped in backticks (`) rather than quotation marks.

### Error conventions

- The first line of each error message should state the problem concisely.
- If the cause of the problem is clear, try to state both the expected result and the actual result, and use "must" and "do not":
  - \`n\` must be a numeric vector, not a character vector.
  - \`n\` must have length 1, not length 2.
  - Do not put the recycled object back into the pool again.

- If the cause of the problem is not clear, use "can not":
  - Can not find column \`b\` in \`.data\`.
  - Can not coerce \`.x\` to a vector.

- Additional sub-notes may be added on new lines starting with `-` and a space, to provide related information or suggestions. Do not capitalize the first letter, and start with `tag:`:

  ```
  Can not find file "./a.png".
  - absolute path: "/home/assets/a.png"
  ```

  If a sub-note has sub-items, indent them with 4 spaces:

  ```
  Can not find file "./a.png".
  - params:
      absolute path: "/home/assets/a.png"
      options: { deep: 1 }
  ```

  A `tag` label can be any characters, but suggestions for resolving the error must use the `help` tag:

  ```
  Can not find file "./a.png".
  - help: Try to use the `ignoreCase` option.
  ```

  Multiple suggestions should be listed as a numbered list:

  ```
  Can not find file "./a.png".
  - help:
      1. Confirm the filename is correct.
      2. Try to use the `ignoreCase` option.
  ```

## Testing

- Unit test files should be placed in the same directory as the source file under test, use the same file name, and add the `.test` suffix.
- Integration tests and end-to-end tests should be placed separately in the `tests` directory.

## Best practices

- Public symbols must have documentation comments. Otherwise, write comments only when the code is obscure and needs further explanation.
- When comparing values for equality, note the following differences among native methods:
  - `===` treats `NaN` values as not equal to each other, and treats `number` and `bigint` as not equal.
  - `Object.is` treats `+0` and `-0` as not equal, and treats `number` and `bigint` as not equal.
  - The SameValueZero algorithm treats `number` and `bigint` as not equal.
  - Map and Set key/value equality uses the SameValueZero algorithm.
  - Array `indexOf` and `lastIndexOf` use `===` semantics, and `includes` uses the SameValueZero algorithm.
