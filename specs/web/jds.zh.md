# JSDoc Specification

[English](jds.md) | 简体中文

## @deprecated

该标签用于标记已被废弃的符号。

`@deprecated [<summary>]`

- 首行应是简要描述的摘要。
- 允许编写更详细的多行描述。

```js
/**
 * @deprecated Since version 1.0.0, please use the {@link ...} interface instead.
 * Because...
 */
```

## @since

该标签用于标记符号可用的起始版本。

`@since <semver>`

```js
/**
 * @since 1.0.0
 */
```

## @throws

该标签用于描述符号可能抛出的错误。

`@throws [{<type>}] [<summary>]`

- 首行可以指明会抛出的类型，每个标签对应一个类型。
- 首行可以简要描述错误抛出的摘要。
- 允许编写更详细的多行描述。

```js
/**
 * @throws {Error} Will throw an error if the argument is null.
 * If you...
 */
```

## @example

该标签用于描述符号的使用示例。

`@example [<summary>]`

- 同个符号可以声明多个 `@example` 标签。
- 首行可以编写一个简要描述示例的摘要，无摘要的示例将作为默认示例。

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

该标签用于描述符号在特定平台上的可用性信息。

`@platform [!]<platform-identifier> [<semver-range>...]`

- 平台标识符不能包含 `!` 和空格。
- 在平台标识符前面使用 `!` 表示该符号在该平台上不可用。
- 可以在平台标识符后面指定多个语义版本范围，用空格分隔。
- 同个符号可以声明多个 `@platform` 标签，若范围发生重叠则表示不可用的标签优先级更高。
- 隐式规则：
  - 如果未声明任何该标签，则认为符号在所有平台上可用。
  - 只要声明了任何表示可用的版本范围，则未显式声明的版本范围均认为不可用。
  - 如果只声明了表示不可用的版本范围，则未显式声明的版本范围均认为可用。
- 允许编写更详细的多行描述。

```js
/**
 * @platform ios
 * @platform !android ^1.0.0
 * Some description for android platform.
 * @platform web >=2.0.0 <3.0.0
 */
```
