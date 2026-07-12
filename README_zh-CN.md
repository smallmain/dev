<!-- <p align="center">
<img src="" style="width:100px;" />
</p> -->

<h1 align="center">
SmallMain's Development Scaffolding
</h1>

<p align="center">
SmallMain 使用的开发脚手架。
</p>

<!-- <br>
<p align="center">
<a href="https://unocss.dev/">Documentation</a> |
<a href="https://unocss.dev/play/">Playground</a>
</p>
<br> -->

<br>
<p align="center">
<a href="./README.md">English</a> |
<span>简体中文</span>
</p>

## 概览

<table>
  <tr>
    <th>技术</th><th>组件</th><th>最后更新</th>
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

安装：

```bash
npm i -D @smallmains/dev
```

### create

```bash
npx sm create                   # 交互式界面
npx sm create --yes             # 直接创建，跳过交互式界面
npx sm create --component react # 通过参数控制默认值，使用 `-h` 查看所有参数
```

该命令用于快速创建预设模板项目。

- 执行时不会清空当前工作目录，只会覆盖已有文件。

### check

```bash
npx sm check                 # 执行 Linter 和 Formatter 检查
npx sm check src/**/*.ts     # 检查指定文件

npx sm check --fix           # 自动修复错误
npx sm check --no-format     # 只执行 Linter 检查
npx sm check --no-lint       # 只执行 Formatter 检查

npx sm check lint            # 执行 Linter 检查
npx sm check format          # 执行 Formatter 检查
npx sm check commit-message --text "feat: add login" # 检查提交信息
npx sm check commit-message .git/COMMIT_EDITMSG      # 检查提交信息文件
```

该命令使用项目中安装的 Linter 和 Formatter 进行检查。

支持的 Linter：

- Oxlint
- Stylelint

支持的 Formatter：

- Oxfmt

### staged-run

```bash
npx sm staged-run "npm run check" "."
```

该命令将 Git 暂存区文件追加到指定命令后执行。

### set-git-hook

```bash
npx sm set-git-hook
```

该命令会安装预设的 Git Hooks：

- `pre-commit`: 使用 `sm staged-run` 对暂存文件执行检查。
- `commit-msg`: 使用 `sm check commit-message "$1"` 校验提交信息。

## Editor Config

| 路径                           | 说明       |
| ------------------------------ | ---------- |
| `configs/common/.editorconfig` | 通用配置。 |

## TS Config

安装：

```bash
npm i -D @smallmains/dev
```

示例：

`tsconfig.json`

```jsonc
{
  "extends": "@smallmains/dev/ts/base.json",
  "include": ["src"],
}
```

| 路径                              | 说明                                          |
| --------------------------------- | --------------------------------------------- |
| `@smallmains/dev/ts/base.json`    | 基础配置。                                    |
| `@smallmains/dev/ts/generic.json` | 中立运行环境、使用 NodeNext 模块规范的配置。  |
| `@smallmains/dev/ts/browser.json` | 浏览器运行环境、使用 Bundler 模块解析的配置。 |
| `@smallmains/dev/ts/nodejs.json`  | Node.js 项目配置。                            |

## VS Code Config

由 `sm create` 根据选择的预设和组件动态生成 `.vscode` 目录。

- `settings.json`：包括格式化、校验等设置。
- `extensions.json`：推荐安装的 VS Code 扩展。

## Oxlint Config

安装：

```bash
npm i -D @smallmains/dev
```

示例：

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";
import generic, { vitest } from "@smallmains/dev/oxlint/generic.js";

export default defineConfig({
  extends: [generic, vitest],
});
```

所有配置均通过 `@smallmains/dev/oxlint/generic.js` 导出：

- `default`: 通用配置。
- `vitest`: 适用于使用 Vitest 的项目的配置。
- `react`: 适用于使用 React 的项目的配置。
- `nodejs`: 适用于使用 Node.js 的项目的配置。
- `security`: 适用于注重安全性的项目的配置。

## Oxfmt Config

安装：

```bash
npm i -D @smallmains/dev
```

示例：

`oxfmt.config.ts`

```ts
import generic from "@smallmains/dev/oxfmt/generic.js";

export default generic;
```

| 路径                               | 说明       |
| ---------------------------------- | ---------- |
| `@smallmains/dev/oxfmt/generic.js` | 通用配置。 |

## Stylelint Config

安装：

```bash
npm i -D @smallmains/dev
```

示例：

`stylelint.config.ts`

```ts
{
  "extends": "@smallmains/dev/stylelint/generic.js",
}
```

| 路径                                       | 说明                       |
| ------------------------------------------ | -------------------------- |
| `@smallmains/dev/stylelint/generic.js`     | 通用配置。                 |
| `@smallmains/dev/stylelint/css-modules.js` | 使用 CSS Modules 的配置。  |
| `@smallmains/dev/stylelint/tailwind.js`    | 使用 Tailwind CSS 的配置。 |

## Oxlint Plugin

安装：

```bash
npm i -D @smallmains/dev
```

### comments

示例：

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

规则：

| 规则                           | 说明                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `comments/require-description` | 要求所有 Oxlint 的 [内联忽略注释](https://oxc.rs/docs/guide/usage/linter/ignore-comments.html) 都存在描述。 |

#### require-description

| 选项     | 类型       | 默认值 | 说明           |
| -------- | ---------- | ------ | -------------- |
| `ignore` | `string[]` | `[]`   | 忽略某些注释。 |

允许的值：

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

- 仅支持 ESM，不检查 CommonJS 等其它模块系统。
- 优先解析导入目标模块的导出符号名称，解析不到时再按模块路径生成合法标识符。
- 按父目录名推导 `index` 目录导入，例如 `./Button/index` 对应 `Button`。
- 目录导入会首先考虑目录本身的 `package.json#name`，否则使用目录名。
- 匿名导出、字面量导出、对象导出和调用表达式导出会被忽略。

示例：

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

规则：

| 规则                                              | 说明                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `consistent-esm-default-name/default-import-name` | 检查类似 `import Foo from "./foo"` 的默认导入名是否符合规范。 |
| `consistent-esm-default-name/default-export-name` | 检查类似 `export default Foo` 的默认导出名是否符合规范。      |

#### 设置

**ignoreSpecifiers**

- 说明：忽略特定导入路径模式，不检查这些默认导入的名称。
- 类型：`string[]`
- 默认值：`[]`

示例：

```ts
{
  ignoreSpecifiers: ["^virtual:", "^@generated/", "\\?raw$"],
}
```

会忽略：

```ts
import routes from "virtual:routes";
import client from "@generated/client";
import readme from "./README.md?raw";
```

**ignorePaths**

- 说明：忽略特定文件路径模式，不检查这些文件作为导入目标或默认导出文件时的名称。
- 类型：`string[]`
- 默认值：`[]`

示例：

```ts
{
  ignorePaths: ["src/generated/**"],
}
```

会忽略：

```ts
import client from "./generated/client";
```

也会忽略匹配文件中的默认导出：

```ts
// src/generated/client.ts
export default function generatedClient() {}
```

**template**

- 说明：当无法从导入目标模块解析出导出符号名称时，按模板从导入路径推导名称；按数组顺序匹配，第一条命中生效。
- 类型：`TemplateEntry[]`
- 默认值：

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

TypeScript 算法：

1. 先取基础名
   - 普通路径取最后一段：`./user-service` -> `user-service`
   - `index` 入口取父目录：`./Button/index` -> `Button`
   - 包子路径取最后一段：`lodash/merge` -> `merge`
   - scoped 包入口取包名最后一段：`@scope/ui` -> `ui`
   - `"."` / `".."` 这类目录入口先看目标目录 `package.json#name`，如 `@demo/source-package` -> `source-package`

2. 去掉扩展名
   - `button.tsx` -> `button`
   - `user.service.ts` -> `user.service`

3. 把不能出现在标识符里的字符当作分隔符移除，并把后一个合法字符大写
   - `foo-bar` -> `fooBar`
   - `foo.bar` -> `fooBar`
   - `foo bar` -> `fooBar`

4. 能作为标识符一部分的字符会保留
   - `foo_bar` -> `foo_bar`
   - `$foo` -> `$foo`
   - `_foo` -> `_foo`

5. 如果结果为空或是保留字，会补 `_`
   - `class` -> `_class`
   - `123abc` -> `abc` 或在无法得到合法开头时回退 `_`

示例：

```ts
"foo-bar"        -> "fooBar"
"user-service"   -> "userService"
"@scope/ui"      -> "ui"
"lodash/merge"   -> "merge"
"./Button/index" -> "Button"
"."              -> 当前目录 package.json#name 的最后一段，否则目录名
```

示例：

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

对应：

```ts
import styles from "./button.css"; // 固定名 styles
import CloseIcon from "./close.svg?react"; // pascal + Icon
import closeUrl from "./close.svg?url"; // camel + Url
import closeSrc from "./close.svg"; // camel + Src
import Button from "./button.tsx"; // pascal -> Button
import userService from "./user-service"; // fallback camel
```

示例：

```ts
{
  template: [{ match: "\\.service\\.ts$", strip: "\\.service$", format: "pascal", suffix: "Service" }],
}
```

对应：

`user.service.ts`

```ts
export default class UserService {}
```

匿名导出、字面量导出、对象导出和调用表达式导出会被忽略：

```ts
export default { ok: true };
export default createStore();
```

## 贡献

- 执行 `pnpm run dev` 从源码运行 CLI。
- 执行 `pnpm run dev:prod` 构建并从产物运行 CLI。
- 执行 `pnpm run build` 构建项目。
- 执行 `pnpm run publish` 发布新版本；指定 `--version` 时会先更新 `package.json`，提交并推送版本变更，再构建并发布。
  - `--version <version>`：指定版本号（例如 `patch`、`minor`、`major` 或具体版本号）。

### CLI create

`npx sm create` 命令会使用 `package.json` 中的字段作为默认值。

## 许可证

[MIT @ SmallMain](./LICENSE)
