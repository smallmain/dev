# 包构建与发布

[English](package.md) | 简体中文

本提案定义 npm 包的构建与发布方式。

## 开发

`pnpm run dev` 启用 Node.js 类型剥离并直接从 `src/index.ts` 运行 CLI。
`pnpm run dev:prod` 先重新构建完整的包，再运行生成的 `bin/sm.js`。

两个命令遵循相同的调用规则：

- 转发剩余参数给 CLI 前，移除一个位于开头的 `--` 参数。
- 没有剩余 CLI 参数时使用 `--help`。
- 设置了 `INIT_CWD` 时在该目录运行 CLI，否则使用脚本进程的当前工作目录。
- 继承标准输入、输出和错误，并在 CLI 进程失败时失败。

## 构建

构建产物固定输出到 `dist/npm/dev`，每次构建前删除并重新创建该目录。

构建规则：

- 从根目录 `package.json` 生成产物的 `package.json`，删除仅用于仓库开发的 `scripts` 和 `devEngines`。
- 将 `configs/web/typescript` 复制到 `ts`，将 `configs/common` 和 `templates` 保持目录结构复制到产物。
- 保留发布产物 `templates` 目录下每个普通文件末尾的 `.ejs` 后缀；`configs/common/.editorconfig` 保持位于模板目录之外的现有路径。
- 将整个 `configs/web` 作为一次 TypeScript 编译，保持 `oxlint`、`oxfmt`、`stylelint` 和内部 `shared` 目录结构，同时生成 JavaScript 和类型声明；源码中的相对导入使用 `.js` 扩展名。
- 将整个 `src` 作为另一次 TypeScript 编译输出到 `cli`，使用 NodeNext 模块解析并重写相对 TypeScript 导入扩展名。
- 生成可执行入口 `bin/sm.js`，以及空的包入口 `index.js` 和 `types/index.d.ts`。
- 根目录 `package.json#files` 决定发布内容，并必须包含编译后配置运行时依赖的内部目录。

## 发布

`pnpm run publish` 从 `dist/npm/dev` 发布，脚本消费自定义的 `--version` 参数，其它参数原样传给 `pnpm publish`。

发布规则：

- 未指定 `--version` 时使用根目录 `package.json` 的当前版本。
- `--version` 支持 `major`、`minor`、`patch` 或具体 SemVer；非法版本以及与当前版本相同的版本会失败。
- 指定版本且不是 dry run 时，工作树必须干净；先更新根目录 `package.json`，创建 `chore: release v<version>` 提交并推送，再构建和发布。
- 指定版本且传给 pnpm 的参数包含 `--dry-run` 或 `--dry-run=true` 时，不修改源码或 Git，只修改构建产物中的版本。
- 发布前始终重新构建，并在产物目录中执行 `pnpm publish`。
