# CLI

[English](cli.md) | 简体中文

这是一个命令行工具，提供一系列命令帮助开发者完成开发任务。

## 子命令

### create

该命令用于快速创建预设模板项目。

交互式创建流程：

- 展示 TUI 表单供用户填写模板信息。
- 首个字段为 `Preset`，用于选择预设模板，后续字段根据选择的预设模板动态生成。

预设列表:

`Npm Package`

- `Package Name`: 包名。
- `Package Description`: 包描述。
- `Chinese Name`: 中文名。
- `Chinese Description`: 中文描述。
- `GitHub Owner`: GitHub 仓库所有者。
- `GitHub Repo`: GitHub 仓库名。
- `Package Manager`: 包管理器，支持 `npm`、`pnpm`，默认 `pnpm`。
- `Runtime`: 运行时环境，支持 `Neutral`、`Browser`、`Node.js`，默认 `Neutral`。
  - `Node.js` 子选项：
    - `Node version`: Node.js 版本，默认 `^24`。
- `Components`: 组件列表，支持 `Git Hook`、`React`、`CSS`、`Security`，默认选择 `Git Hook`。
  - `CSS` 子选项：
    - `CSS`: 支持 `Native`、`CSS Modules`、`Tailwind CSS`，默认 `Native`。

命令行输入：

- `--yes`: 跳过 TUI，直接使用命令行参数和默认值。
- `--preset <preset>`: 对应 `Preset`，仅支持 `npm-package`。
- `--name <name>`、`--description <description>`、`--zh-name <name>`、`--zh-description <description>`、`--github-owner <owner>`、`--github-repo <repo>`: 对应同名模板信息；解析默认值后均不能为空。
- `--package-manager <package-manager>`: 对应 `Package Manager`，支持 `npm`、`pnpm`。
- `--runtime <runtime>`: 对应 `Runtime`，支持 `neutral`、`browser`、`nodejs`。
- `--node-version <version>`: 仅用于 `nodejs` 运行时，支持主版本号或完整版本号，可带 `^` 前缀。
- `--component <component>`: 对应 `Components`，支持重复指定或使用逗号分隔；去除空值和重复值后，支持 `git-hook`、`react`、`css`、`security`，未指定有效值时默认选择 `git-hook`。
- `--css <css>`: 对应 `CSS`，支持 `native`、`css-modules`、`tailwind`，默认 `native`；仅在选择 `css` 组件时影响生成结果。

文本字段默认值：

- `Package Name` 使用当前目录名转换出的包名，`GitHub Repo` 使用不含 scope 的包名。
- `Package Description`、`Chinese Name`、`Chinese Description`、`GitHub Owner` 分别默认为 `Description.`、`名称`、`描述。`、`smallmain`。

生成规则：

- 指定 `--yes` 或在非交互终端运行时，使用命令行参数和默认值，不展示 TUI。
- 目标目录固定为当前工作目录；不会清空目录，但会覆盖同名的模板文件和生成文件。
- 当前目录不在 Git 工作树中时，执行 `git init`。
- 根据 `Runtime`、`Components` 和 `CSS` 生成配置及依赖；Vitest 始终启用。
- 使用选定的包管理器安装依赖。
- 安装后若项目中存在 `@smallmains/dev`，以修复模式执行项目检查并格式化文件。

生成结果：

- 始终生成基础项目文件、TypeScript、Oxlint、Oxfmt、Vitest 和 VS Code 配置；选择 `CSS` 时额外生成 Stylelint 配置。
- `package.json` 始终包含 `check`、`check:fix` 和 `test` 脚本；选择 `Git Hook` 时额外生成 `prepare` 脚本。
- 开发依赖始终包含 `@smallmains/dev`、TypeScript、Oxlint、Oxfmt、oxlint-tsgolint 和 Vitest；`Node.js` 运行时增加 `@types/node`，选择 `CSS` 时增加 Stylelint。
- `Runtime` 决定 TypeScript 配置和运行环境相关的 Oxlint 配置；`React` 与 `Security` 组件增加对应的 Oxlint 配置。
- `CSS` 类型决定使用通用、CSS Modules 或 Tailwind Stylelint 配置。

### check

该命令使用项目中的检查工具对项目进行检查。

工具执行规则：

- 仅当工具命令可用，并且项目中存在对应配置文件或 `package.json` 配置字段时，才执行该工具。
- Oxlint、Stylelint、Oxfmt 按顺序执行；某个工具失败不会阻止后续工具执行，任一工具失败都会使命令失败。
- 指定文件时，Oxlint 和 Oxfmt 接收全部文件，Stylelint 仅接收其支持的文件类型。
- 未指定文件时，各工具按自身配置检查项目；Stylelint 使用内置样式文件匹配模式。

`check`

相当于同时执行 `check lint` 和 `check format`。

支持的命令行参数：

- `files...`: 指定检查的文件列表，若不传入则默认按规则检查所有项目文件。
- `--no-lint`: 不执行 Linter 检查。
- `--no-format`: 不执行 Formatter 检查。
- `--fix`: 自动修复可修复的问题。

`check lint`

执行 Linter 检查。

支持的 Linter 列表：

- Oxlint
- Stylelint

支持的命令行参数：

- `files...`: 指定检查的文件列表，若不传入则默认按规则检查所有项目文件。
- `--fix`: 自动修复可修复的问题。

`check format`

执行 Formatter 检查。

支持的 Formatter 列表：

- Oxfmt

支持的命令行参数：

- `files...`: 指定检查的文件列表，若不传入则默认按规则检查所有项目文件。
- `--fix`: 自动修复可修复的问题。

`check commit-message`

检查提交信息是否符合规范。

支持的命令行参数：

- `file`: 指定检查的提交信息文件路径，若不传入则默认检查 `.git/COMMIT_EDITMSG` 文件（自动查找父级 Git 目录）。
- `--text`: 检查传入的提交信息文本。

执行规则：

- `file` 与 `--text` 不能同时指定。
- 始终使用内置的 `@commitlint/config-conventional`，不加载项目中的 Commitlint 配置。

### staged-run

该命令将 Git 暂存区文件追加到指定命令后执行。

输入要求：

- `command` 必须提供，且解析后必须包含可执行文件。
- `globs...` 必须至少提供一个 Git pathspec。

执行规则：

- 将命令字符串解析为可执行文件和参数后直接启动，不通过 Shell 执行；支持单引号、双引号和反斜杠转义。
- 使用 Git pathspec 匹配状态为新增、复制、修改或重命名的暂存文件，不包含已删除文件。
- 在命令末尾通过 `--` 追加匹配的文件路径。
- 没有匹配文件时不执行命令。
- 命令失败时原样返回其退出码。
- 命令成功且指定 `--update-index` 时，执行 `git update-index --again`，将命令对已跟踪文件的修改重新加入暂存区。

### set-git-hook

该命令会安装预设的 Git Hooks。

安装规则：

- 仅在当前目录存在 `.git` 时安装，否则跳过。
- 在 Git 公共目录的 `hooks` 中写入带有 `sm` 标记且可执行的 `pre-commit` 和 `commit-msg`。
- Hook 会将仓库根目录的 `node_modules/.bin` 加入 `PATH` 后再调用 `sm`。
- `pre-commit` 使用 `sm staged-run` 执行项目的 `check` 脚本；包管理器从 `package.json#devEngines.packageManager` 读取，仅明确配置为 `npm` 时使用 npm，否则使用 pnpm。
- `commit-msg` 使用 `sm check commit-message "$1"` 检查提交信息。
- 直接覆盖已有的 `pre-commit` 和 `commit-msg`，无论是否由 `sm` 管理。
- 存在 `core.hooksPath` 配置时自动取消该配置，并改用 `.git/hooks`。
