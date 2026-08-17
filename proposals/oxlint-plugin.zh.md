# Oxlint 插件

[English](oxlint-plugin.md) | 简体中文

本提案定义随包发布的 Oxlint JavaScript 插件的业务规则与实现约束。插件的安装和配置方式见 README。

## comments

`comments` 插件提供 `comments/require-description` 规则，用于要求 Oxlint 控制指令说明禁用或启用规则的原因。

### 指令识别

- 仅识别 `oxlint-disable`、`oxlint-enable`、`oxlint-disable-line` 和 `oxlint-disable-next-line`。
- 不处理 `eslint-*` 等其它工具的控制指令。
- 去除注释内容开头的空白后，指令必须位于注释开头；行注释和块注释使用相同规则。
- 描述必须位于 `--` 之后且包含非空白字符；`--` 可以紧跟指令内容开头，也可以由空白分隔。
- 缺少描述时在整条注释的位置报告错误，不提供自动修复。

### `ignore`

- 类型为指令名称数组，默认值为 `[]`。
- 仅允许使用上述四种 Oxlint 指令名称。
- 被忽略的指令不检查描述，其它指令仍正常检查。

## consistent-esm-default-name

`consistent-esm-default-name` 插件用于统一 ESM 默认导入与具名默认导出的名称，不处理 CommonJS。

插件提供以下规则：

- `consistent-esm-default-name/default-import-name`：检查默认导入的本地绑定名称。
- `consistent-esm-default-name/default-export-name`：检查当前文件具名默认导出的名称。

两条规则共享 `settings["consistent-esm-default-name"]` 中的 `ignoreSpecifiers`、`ignorePaths` 和 `template` 设置。

### 默认导入名称

`default-import-name` 按以下顺序确定名称：

1. 使用 `ignoreSpecifiers` 匹配原始模块说明符，命中时跳过。
2. 使用 `oxc-resolver` 从导入文件解析目标模块，并使用 `ignorePaths` 检查解析后的路径。
3. 使用 `oxc-parser` 解析目标模块；若能找到具名默认导出，则使用该导出名称。
4. 默认导出为再导出时，递归解析其目标模块；循环引用会停止解析。
5. 无法解析文件、无法解析默认导出名称，或默认导出为匿名表达式时，按模块说明符和 `template` 推导名称。

目标模块中解析出的默认导出名称优先于 `template`。支持以下具名形式：

- `export default Foo`
- `export default function Foo() {}`
- `export default class Foo {}`
- `export { Foo as default }`
- `export { default } from "./foo"`

目标模块解析使用 TypeScript 配置自动发现、`types` / `node` / `import` / `default` 条件、常见 JavaScript 到 TypeScript 扩展别名，以及 `index` 入口解析。解析结果按文件路径和源码内容缓存，源码变化时重新解析。

### 默认导出名称

`default-export-name` 根据当前文件路径和 `template` 推导名称，并检查以下具名形式：

- `export default Foo`
- `export default function Foo() {}`
- `export default class Foo {}`
- `export { Foo as default }`

匿名函数、匿名类、字面量、对象和调用表达式等无法得到绑定名称的默认导出会被忽略。具名默认导出按[自动修复](#自动修复)规则修复。

### `ignoreSpecifiers`

- 类型为正则表达式字符串数组，默认值为 `[]`。
- 对未经处理的完整模块说明符进行匹配，包括查询参数和片段。
- 仅影响 `default-import-name`。
- 无效正则表达式不会命中。

### `ignorePaths`

- 类型为 Glob 字符串数组，默认值为 `[]`。
- 同时匹配绝对路径和相对于 Oxlint 工作目录的路径。
- 对 `default-import-name` 检查解析后的导入目标，对 `default-export-name` 检查当前文件。

### `template`

类型：

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

默认值：

```ts
[{ match: ".*", format: "typescript" }];
```

处理规则：

1. 按数组顺序将 `match` 作为 Unicode 正则表达式匹配，第一条命中项生效。
2. 导入使用原始模块说明符匹配，导出使用当前文件路径匹配。
3. 未找到匹配项时直接使用基础名；无效的 `match` 不会命中。
4. 指定 `name` 时直接使用固定名称，并忽略该项的其它名称转换字段。
5. 否则依次使用 `strip` 正则表达式处理基础名，再应用 `format`、`prefix` 和 `suffix`；无效的 `strip` 会被忽略。
6. 自定义项未指定 `format` 时保留处理后的基础名。

格式规则：

- `typescript`：按 TypeScript 自动导入风格生成合法标识符。
- `preserve`：保持原值。
- `camel`、`pascal`、`snake`、`kebab`、`flat`：分词后转换大小写并使用对应连接方式。
- `upper`、`lower`：转换整个值的大小写。

### 基础名推导

导入名称的基础名来自模块说明符：

- 普通路径使用最后一段，并去掉最后一个扩展名。
- `index` 入口使用父目录名。
- 包子路径使用最后一段，scoped 包入口使用包名的最后一段。
- `.`、`..` 及其组合表示的目录入口优先读取目标目录的 `package.json#name`，否则使用目录名。
- 查询参数和片段不参与基础名推导，但仍参与 `template.match` 和 `ignoreSpecifiers` 匹配。

导出名称的基础名来自当前文件名；`index` 文件使用父目录名，其它文件去掉最后一个扩展名。

`typescript` 格式逐个处理基础名中的字符：

- 保留可用于标识符的 Unicode 字符、`_` 和 `$`。
- 删除不能用于标识符的字符，并将其后的首个合法字符大写，例如 `foo-bar` 变为 `fooBar`。
- 首字符不能作为标识符开头时先添加 `_`；可作为标识符后续字符的内容会保留，因此 `123abc` 变为 `_123abc`。
- 结果为空时使用 `_`；结果为保留字时添加 `_` 前缀，例如 `class` 变为 `_class`。

### 自动修复

两条规则均提供自动修复：

- `default-import-name` 同时重命名默认导入绑定及其全部引用。
- `default-export-name` 同时重命名当前文件中的默认导出绑定及其全部引用，支持上述四种具名默认导出形式。

仅满足以下条件时执行修复：

- 期望名称是合法且非保留字的绑定标识符。
- 文件中不存在同名标识符冲突。
- Oxlint 能唯一解析该绑定、声明位置和全部引用范围。

任一条件不满足时仍报告错误，但不修改代码。

`default-export-name` 只修改当前导出文件，不跨文件修改导入方。
