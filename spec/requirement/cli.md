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

### lint

该命令使用项目中安装的 Linter 进行检查。

### staged-run

该命令将 Git 暂存区文件追加到指定命令后执行。

### set-git-hook

该命令会安装预设的 Git Hooks。
