<!-- <p align="center">
<img src="" style="width:100px;" />
</p> -->

<h1 align="center">
SmallMain's Development Configuration
</h1>

<p align="center">
SmallMain 使用的开发配置。
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
    <th>技术</th><th>配置</th><th>最后更新</th>
  </tr>
  <tr>
    <td rowspan="2">-</td><td><a href="#open-source-template">Open Source Template</a></td><td>2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#editor-config">Editor Config</a></td><td>EditorConfig Specification v0.17.2; 2025.6.15</td>
  </tr>
  <tr>
    <td rowspan="5">Web</td><td><a href="#package-template">Package Template</a></td><td>2025.6.15</td>
  </tr>
  <tr>
    <td><a href="#web">VS Code Config</a></td><td>2025.6.15</td>
  </tr>
  <tr>
    <td><a href="#ts-config">TS Config</a></td><td>TypeScript 6.0; 2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#oxlint-config">Oxlint Config</a></td><td>Oxlint 1.70.0; 2025.06.15</td>
  </tr>
  <tr>
    <td><a href="#oxfmt-config">Oxfmt Config</a></td><td>Oxfmt 0.55.0; 2025.06.15</td>
  </tr>
</table>

## Open Source Template

拷贝 `repo-template` 目录下的文件。

## Editor Config

拷贝 `misc/.editorconfig` 文件到项目根目录。

## Package Template

拷贝 `web/package-template` 目录下的文件。

## TS Config

安装：

```bash
npm i -D @smallmains/cfgs
```

示例：

`tsconfig.json`

```jsonc
{
  "extends": "@smallmains/cfgs/ts/base.json",
  "include": ["src"],
}
```

| 路径                               | 说明                                           |
| ---------------------------------- | ---------------------------------------------- |
| `@smallmains/cfgs/ts/base.json`    | 基础配置。                                     |
| `@smallmains/cfgs/ts/generic.json` | 非平台相关、使用 NodeNext 模块规范的通用配置。 |
| `@smallmains/cfgs/ts/cocos3.json`  | Cocos Creator v3.x 项目配置。                  |
| `@smallmains/cfgs/ts/node.json`    | Node.js 项目配置。                             |

## VS Code Config

### Web

拷贝 `web/vscode-config` 目录为项目根目录的 `.vscode` 目录。

## Oxlint Config

安装：

```bash
npm i -D @smallmains/cfgs
```

示例：

`oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";
import base from "@smallmains/cfgs/oxlint/base.ts";

export default defineConfig({
  extends: [base],
});
```

| 路径                              | 说明       |
| --------------------------------- | ---------- |
| `@smallmains/cfgs/oxlint/base.ts` | 基础配置。 |

## Oxfmt Config

安装：

```bash
npm i -D @smallmains/cfgs
```

示例：

`oxfmt.config.ts`

```ts
import { defineConfig } from "oxfmt";
import generic from "@smallmains/cfgs/oxfmt/generic.ts";

export default defineConfig({
  extends: [generic],
});
```

| 路径                                | 说明       |
| ----------------------------------- | ---------- |
| `@smallmains/cfgs/oxfmt/generic.ts` | 通用配置。 |

## 贡献

- 执行 `pnpm run build` 构建项目。
- 执行 `pnpm run publish` 构建并推送新版本。
  - `--version <version>`：指定版本号（例如 `patch`、`minor`、`major` 或具体版本号）。

## 许可证

[MIT @ SmallMain](./LICENSE)
