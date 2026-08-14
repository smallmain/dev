# TypeScript Coding Specification

## 命名

### 代码符号

| 类型      | 命名          | 示范                              |
| --------- | ------------- | --------------------------------- |
| 类/接口   | PascalCase    | `class UserManager`               |
| 类型      | PascalCase    | `type EventHandler`               |
| 枚举      | PascalCase    | `enum StatusCode`                 |
| 枚举成员  | PascalCase    | `enum Color { Red, Green, Blue }` |
| 命名空间  | camelCase     | `namespace dataUtils`             |
| 属性/变量 | camelCase     | `let dateTime`                    |
| 方法/函数 | camelCase     | `function getValue`               |
| 常量      | CONSTANT_CASE | `const DEBUG`                     |

- 禁止使用命名缀饰表达符号的元信息

  例如：
  - 接口名称不应一律添加 `I` 前缀。
    > 一个常见的例外是需要与同名类进行区分。
  - 变量名称不应使用表示作用域、存储期、类型的缩写前缀，例如 `mTime`、`gUuid`、`iTime`、`sUuid`。
  - 私有符号不应一律添加 `_` 前缀。
    > 一个常见的例外是该符号是同名符号的内部实现。

### 文件系统

| 类型 | 命名       | 示范           |
| ---- | ---------- | -------------- |
| 目录 | kebab-case | `daily-system` |
| 文件 | kebab-case | `home-view.ts` |

### 语义约定

| 约定         | 说明                                                 | 示范                                       |
| ------------ | ---------------------------------------------------- | ------------------------------------------ |
| `acquire...` | 函数返回的是 `Disposable` 对象。                     | `function acquireFile(): FileHandle`       |
| `when...`    | 函数返回的是 `Observable` 对象。                     | `function when(event: string): Observable` |
| `ensure...`  | 函数是同名创建函数的缓存版本，可能返回一个缓存的值。 | `function ensureObject(): Object`          |
| `into...`    | 函数是同名函数的就地写入版本。                       | `function encodeInto(out: T): void`        |
| `...sync`    | 函数是同名同作用函数的同步版本。                     | `function writeSync(): boolean`            |
| `...async`   | 函数是同名同作用函数的异步版本。                     | `function writeAsync(): Promise<boolean>`  |
| `use...`     | 函数是 React Hooks 函数。                            | `function useUser(): User`                 |

## 符号顺序

本节非强制性规则，仅供推荐及适当参考。

对于代码中的任何符号应按照以下基本约定对符号进行排序：

1. 尽量将被引用的符号放在引用它的符号的后面。
2. 将同类型、相关的、作用相似的符号放在一起。
3. 将公共符号放在首位，因为最可能对其感兴趣。

### 模块

在模块中可按下面的类型顺序排序：

1. 枚举
2. 类型
3. 接口
4. 变量
5. 类、函数（视为同一类型）

### 类

在类中可按下面的类型顺序排序：

1. 静态事件
2. 静态变量
3. 静态方法
4. 事件
5. 字段、访问器（视为同一类型）
6. 构造函数
7. 抽象方法
8. 方法

## 注释

- 注释必须使用英文，按照完整的句子格式书写：即首字母大写，以句号结尾。
- 行间注释推荐首字母小写，并且可视情况不使用句号结尾。
- 若出现代码中的标识符，不要改变其大小写。
- 文档注释中的代码、标识符、符号需使用 `{@link symbol}` 链接格式包裹，需确保链接的符号已至少作为 `type` 被导入。
- 无法使用 `{@link symbol}` 跳转的情况（非文档注释、标识符、基础类型、代码短句），需使用反引号（\`）包裹，例如 `number`、`string` 等。

### 行间注释

可使用以下前缀表示需要开发者关注的特殊情况或者待办事项：

- `TODO:` - 应尽快完成的待办事项。
- `NOTE:` - 更次要的待办事项，比如暂未实施的想法。
- `FIXME:` - 受限制未能及时修复的问题。
- `HACK:` - 受限制所采取的不规范的行为。

并且可使用小括号添加与这条注释有关的额外信息，例如用户名或 Issue 序号：

- `TODO(@smallmain): This is a comment.`
- `TODO(#349): This is a comment.`

### 文档注释

- 使用 JSDoc 与 Markdown 格式编写。
- 每段注释的首行应是简要描述该符号作用的摘要。

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

### 标签参考

以下仅列出常用标签及其简介，部分标签的详细说明可查看 [JSDoc Specification](./jsdoc.md)。

**接口稳定性**

- `@experimental` - 实验性接口。
- `@deprecated` - 废弃接口。
- `@since` - 接口可用的起始版本。

**可访问性**

- `@public` - 公开接口。
- `@internal` - 内部接口。

**描述性**

- `@param` - 描述函数参数。
- `@returns` - 描述函数返回值。
- `@template` - 描述泛型。
- `@throws` - 描述可能抛出的错误。
- `@example` - 示例代码。
- `@platform` - 描述平台兼容性。
- `@see` - 提供更多相关的信息。

**身份标识**

- `@module` - 模块，详情可查看：[ECMAScript Package Specification](./esp.md)。
- `@event` - 事件。
- `@decorator` - 装饰器。

**文档标记**

- `@inheritdoc` - 使用该符号继承的父符号文档。
- `@link` - 仅用于链接到其它代码符号，网址、文件链接等使用 Markdown 链接格式。

## 类型

### 语义约定

- 当用于表示 “未知” 或 “任何”时，使用 `uncertain` 类型替代 `never`，以明确意图。

  ```ts
  type uncertain = never;
  ```

### 泛型

泛型类型一般应提供默认值，并使默认值保持 “未知”、“任何” 的语义。

例如以下这个用于描述类的泛型类型：

```ts
type Class<T extends object = object, Arguments extends readonly unknown[] = uncertain> = new (
  ...args: Arguments
) => T;
```

- 返回值的默认值为 `object`，参数的默认值为 `never`，这保证了 `unknwon` 语义。
- 当编写 `Class` 而不指定泛型参数时，保证了 “未知类” / “任何类” 的语义。

  这意味着任何类都可以赋值给 `Class`，符合 “任何” 的语义：

  ```ts
  const a: Class = class A {};
  const b: Class = class B {
    constructor(a: number) {}
  };
  const c: Class = class C {
    constructor(a: number, b: string) {}
  };
  ```

  也意味着因为无法确定构造函数的参数类型，无法实例化 `Class`，符合 “未知” 的语义：

  ```ts
  function test(v: Class) {
    const instance = new v();
    //               ~~~~~~~~ > Error: ts(2345)
  }
  ```

泛型类型的型变应进行测试以符合预期。

例外情况：

对于 `this` 的默认值则更倾向于使用 `void`，因为 `this` 是 `void` 的情况非常常见。

以 `Getter` 为例：

```ts
type Getter<T = unknown, This = void> = (this: This) => T;
```

## 开发文案

本节描述的文案格式主要用于日志、错误描述等开发者阅读的内容。

- 应统一使用英文，并按照完整的句子格式书写；即首字母大写，以句号结尾。
- 若出现代码中的标识符，不要改变其大小写。
- 代码、标识符需使用反引号（\`）而非引号包裹。

### 错误规范

- 每条错误消息的首行应简明扼要地说明问题所在。
- 如果问题的原因很明确，则尽量同时说明预期的结果和实际的结果，并使用 "must"、"do not"：
  - \`n\` must be a numeric vector, not a character vector.
  - \`n\` must have length 1, not length 2.
  - Do not put the recycled object back into the pool again.

- 如果问题原因并不明确，则使用 "can not"：
  - Can not find column \`b\` in \`.data\`.
  - Can not coerce \`.x\` to a vector.

- 可换行并以 `-` 和空格开头增加子说明，以添加与错误相关的信息或建议，需要注意首字母不要大写，并且以 `tag:` 开头：

  ```
  Can not find file "./a.png".
  - absolute path: "/home/assets/a.png"
  ```

  如果子说明有子项，则用 4 个空格缩进：

  ```
  Can not find file "./a.png".
  - params:
      absolute path: "/home/assets/a.png"
      options: { deep: 1 }
  ```

  `tag` 标签可以是任何字符，但提供解决错误的建议需统一使用标签 `help`：

  ```
  Can not find file "./a.png".
  - help: Try to use the `ignoreCase` option.
  ```

  多个建议使用序号列表逐个列出：

  ```
  Can not find file "./a.png".
  - help:
      1. Confirm the filename is correct.
      2. Try to use the `ignoreCase` option.
  ```

## 测试

- 单元测试文件应与被测试的源文件放在同一目录下，并使用相同的文件名，增加后缀 `.test`。
- 集成测试、端到端测试应单独放在 `tests` 目录下。

## 最佳实践

- 对外公开的符号必须编写文档注释，否则仅当代码晦涩、需进一步说明时才编写注释。
- 比较值的相等性时，需注意原生方法有以下几点不同：
  - `===` 将 `NaN` 视为互不相等，将 `number` 和 `bigint` 视为互不相等。
  - `Object.is` 将 `+0` 和 `-0` 视为不相等，将 `number` 和 `bigint` 视为互不相等。
  - SameValueZero 算法，将 `number` 和 `bigint` 视为互不相等。
  - Map 和 Set 的键/值相等性使用 SameValueZero 算法。
  - Array 的 `indexOf`、`lastIndexOf` 方法使用 `===` 语义，`includes` 方法使用 SameValueZero 算法。
