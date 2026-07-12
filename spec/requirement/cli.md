# CLI

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
- `GitHub Repository`: GitHub 仓库名。
- `Package Manager`: 包管理器，支持 `npm`、`pnpm`。
- `Runtime`: 运行时环境，支持 `Neutral`、`Browser`、`Node.js`。
  - `Node.js` 子选项：
    - `Node.js version`: Node.js 版本，默认 `^24`。
- `Components`: 组件列表，支持 `Git Hook`、`React`、`CSS`、`Security`。
  - `CSS` 子选项：
    - `CSS`: 支持 `Native`、`CSS Modules`、`Tailwind CSS`。

### check

该命令使用项目中的检查工具对项目进行检查。

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

### staged-run

该命令将 Git 暂存区文件追加到指定命令后执行。

### set-git-hook

该命令会安装预设的 Git Hooks。
