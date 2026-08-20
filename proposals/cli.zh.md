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

- `--yes`: 跳过交互式界面，直接使用命令行参数和默认值；安装失败时不显示恢复询问。
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

- 指定 `--yes` 或在非交互终端运行时，使用命令行参数和默认值，不展示交互式界面。
- 目标目录固定为当前工作目录；不会清空目录，但会覆盖同名的模板文件和生成文件。
- 原样复制 `configs/common/.editorconfig`。
- 渲染包内的模板文件，每个模板文件以 `.ejs` 结尾，输出路径仅移除最后一个 `.ejs` 后缀；发现其它类型的文件时创建失败。
- 解析每个渲染后的 JSON 文件，并统一为两空格缩进和末尾换行；渲染结果不是有效 JSON 时创建失败。
- 当前目录不在 Git 工作树中时，执行 `git init`。
- 根据 `Runtime`、`Components` 和 `CSS` 生成配置及依赖；Vitest 始终启用。
- 使用选定的包管理器安装依赖。
- 包管理器进程成功启动、未被信号中断且以非零退出码结束时，本次安装失败可重试；其它失败不可重试。
- 未指定 `--yes` 的交互终端中，每次发生可重试的安装失败后，询问是否重试。选择重试时只再次执行安装命令，不重新初始化 Git 或渲染模板；重试仍失败时继续询问。
- 选择不重试、取消询问、指定 `--yes`、发生不可重试失败，或非交互终端中发生任何安装失败时，创建失败，不执行最终项目检查，也不报告创建成功。最后一次安装失败即为所报告的失败，不额外提示最终检查已跳过。
- 安装成功后始终以修复模式执行完整项目检查。模板渲染结果无需在此阶段之前满足 Formatter 规则。
- 任一最终检查失败时，创建失败。仅当全部最终检查成功后才报告创建成功。
- 创建过程不具备事务性。安装或最终检查失败时，已经写入的文件、依赖安装结果及已经应用的修复均予以保留。

生成结果：

- 始终生成基础项目文件、TypeScript 源码示例、与源码同目录的单元测试、`tests` 目录中的集成测试，以及 TypeScript、Oxlint、Oxfmt、Vitest 和 VS Code 配置；选择 `CSS` 时额外生成 Stylelint 配置。
- VS Code `settings.json` 始终配置 Oxc 格式化，仅在选择 `CSS` 时增加 `stylelint.validate`；`extensions.json` 始终推荐 EditorConfig、Oxc 和 Vitest，并在选择 `CSS` 时额外推荐 Stylelint。
- `package.json` 始终导出 `./src/index.ts`，并包含 `check`、`check:fix` 和 `test` 脚本；选择 `Git Hook` 时额外生成 `prepare` 脚本。
- 开发依赖始终包含 `@smallmains/dev`、TypeScript、Oxlint、Oxfmt、oxlint-tsgolint、Vitest 及其 V8 覆盖率 provider；`Node.js` 运行时增加 `@types/node`，选择 `CSS` 时增加 Stylelint。
- 单元测试直接导入源码模块，集成测试则通过生成的包名导入。
- `Runtime` 决定 TypeScript 配置和运行环境相关的 Oxlint 配置；`React` 与 `Security` 组件增加对应的 Oxlint 配置。
- `CSS` 类型决定使用通用、CSS Modules 或 Tailwind Stylelint 配置。

### build

请查看 [build](./cli-build.zh.md) 提案。

### publish

TODO

### check

该命令使用项目中的检查工具对项目进行检查。

工具执行规则：

- Oxlint、Stylelint 和 Oxfmt 中安装了哪个就执行哪个；没有显式配置时，使用该工具的默认配置执行。
- 未安装的工具，以及 `--no-lint`、`--no-format` 或所选子命令禁用的工具不执行。
- Oxlint、Stylelint、Oxfmt 按顺序执行；某个工具失败不会阻止后续工具执行，任一工具失败都会使命令失败。
- 指定文件时，Oxlint 和 Oxfmt 接收全部文件，Stylelint 仅接收其支持的文件类型。
- 未指定文件时，各工具按自身配置检查项目；Stylelint 使用内置样式文件匹配模式。
- Stylelint 支持 `.astro`、`.css`、`.ejs`、`.html`、`.less`、`.md`、`.mdx`、`.pcss`、`.sass`、`.scss`、`.svelte` 和 `.vue` 文件。

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

该命令对 Git pathspec 匹配的已暂存普通文件执行一个命令，同时保护 Git 暂存区和已跟踪工作树状态。

命令形式：

```text
sm staged-run [--allow-empty] [pathspec...] -- <command> [args...]
sm staged-run --list-recoveries
sm staged-run --recover <id>
sm staged-run --discard-recovery <id> --force
```

输入与文件选择规则：

- 执行任务时必须提供 `--`。其后的第一个参数为可执行文件，其余参数不经过 Shell 或命令字符串解析，原样传递。
- `--` 后的选项属于子命令。`staged-run` 不会再插入 `--`；子命令需要参数分隔符时，由调用方提供。
- `pathspec...` 使用 Git pathspec 语义，默认为 `.`，并从调用目录解释。
- 匹配状态为新增、复制、修改或重命名的已暂存普通文件。复制或重命名使用目标路径，排除删除、符号链接和 gitlink。
- 没有文件匹配时成功退出，不获取事务锁、不创建备份、不执行命令，也不输出内容。
- 子进程的工作目录保持为调用目录；优先解析项目本地可执行文件，再解析全局可执行文件；匹配文件以绝对路径追加到参数末尾。
- 操作系统因参数列表过长而拒绝执行时，递归拆分匹配路径并串行执行。单个路径仍无法执行时，事务失败。

预检规则：

- 要求 Git 2.32 或更高版本及非裸工作树。任何修改发生前，解析仓库根目录、当前 worktree 的 Git 目录和活动暂存区，包括继承的 `GIT_INDEX_FILE`。
- 每个 worktree 同时只允许一个活动事务。存在活动锁时立即失败；存在未完成的持久事务时，普通执行被阻止，直至显式恢复或丢弃；不存在事务资产的孤立锁可以安全移除。
- 首次修改前拒绝未合并暂存区条目、intent-to-add 条目、sparse-checkout、sparse index 和 skip-worktree 条目。
- 支持 unborn 分支、linked worktree，以及已解决的 merge、cherry-pick、revert、rebase 和 am 状态。保留 `MERGE_HEAD`、sequencer 或 rebase 状态等操作元数据。

事务规则：

- 事务保护精确的暂存区和已跟踪工作树状态。未跟踪及忽略文件不在事务范围内；回滚期间不备份、不隐藏、不暂存也不删除这些文件。
- 修改工作树前，持久化原子事务清单、精确暂存区备份和已跟踪工作树备份。存在 `HEAD` 时，在不修改工作树的前提下创建备份，并锚定到私有事务 ref 而非 `refs/stash`；unborn 分支使用暂存区树和工作树树。
- 隐藏工作树中每个部分暂存的已跟踪文件的未暂存修改，包括 `pathspec...` 未匹配的文件。隐藏内容保存为 binary、full-index patch。
- 命令分块按顺序执行。非零退出、信号中断、启动失败或后续分块失败都会使完整事务失败。
- 子命令不得修改任何活动 Git 暂存区。检测到暂存区变更时视为违反契约并回滚。
- 所有命令分块成功后，只重新加入命令执行前已经匹配的文件。子命令成功修改的未匹配已跟踪文件保留为未暂存状态。
- 在命令结果之上恢复隐藏的未暂存 patch。首先执行仅修改工作树的普通 apply；无法干净应用时，使用已修复暂存区的临时副本尝试三方 apply。禁止对真实暂存区执行三方 apply。apply 失败或临时暂存区存在未合并条目时，事务失败。
- 在 `git commit -- <path>` 中，同时更新 Git 活动候选暂存区和父 Git 进程的默认暂存区锁中的匹配文件。默认提交和 `git commit -a` 只更新各自的活动暂存区。所有场景均保留无关暂存条目。
- 结果提交不再包含任何暂存修改时失败并回滚，除非指定 `--allow-empty`。merge 中同时考虑两个父提交，避免将有意义的 merge commit 误判为空。
- 仅在已修复暂存区、已恢复工作树和 Git 操作元数据全部验证后，才视为事务已提交。此前发生任何任务或内部失败时，恢复原始暂存区和已跟踪工作树。仅当回滚成功后才传递子命令退出码；回滚失败时报告内部错误并保留恢复数据。
- 成功时只输出子进程内容；事务诊断仅在失败时输出。

中断与清理规则：

- 收到 `SIGINT` 或 `SIGTERM` 时，终止子进程组、执行回滚，然后终止。`SIGKILL` 和进程崩溃通过持久事务数据恢复。
- 到达提交点后，删除清单、备份、私有 ref 和锁。清理失败时，保留已经正确修复的用户状态、返回失败，并留下 `cleanup-only` 恢复记录；不得仅因私有数据清理失败而回滚已提交事务。

恢复规则：

- 在当前 worktree 的 Git 目录下原子存储清单和备份文件。私有 ref 包含 worktree 与事务标识，避免 linked worktree 冲突。
- `--list-recoveries` 为只读操作，列出每个恢复标识及其状态。
- `--recover <id>` 先将当前暂存区和已跟踪工作树保存为新的恢复记录，再恢复所选记录。恢复成功后消费所选记录，并保留新记录，使恢复操作可以撤销。恢复 `cleanup-only` 时只删除私有事务数据，不修改用户文件。
- `--discard-recovery <id> --force` 永久删除一条恢复记录，不修改暂存区或工作树。事务仍由活动进程持有时拒绝丢弃。
- 恢复操作仅作用于创建记录的 worktree。

### set-git-hook

该命令会安装预设的 Git Hooks。

安装规则：

- 仅在当前目录存在 `.git` 时安装，否则跳过。
- 在 Git 公共目录的 `hooks` 中写入带有 `sm` 标记且可执行的 `pre-commit` 和 `commit-msg`。
- Hook 会将仓库根目录的 `node_modules/.bin` 加入 `PATH` 后再调用 `sm`。
- `pre-commit` 执行 `sm staged-run . -- <package-manager> run check --`；包管理器从 `package.json#devEngines.packageManager` 读取，仅明确配置为 `npm` 时使用 npm，否则使用 pnpm。
- `commit-msg` 使用 `sm check commit-message "$1"` 检查提交信息。
- 直接覆盖已有的 `pre-commit` 和 `commit-msg`，无论是否由 `sm` 管理。
- 存在 `core.hooksPath` 配置时自动取消该配置，并改用 `.git/hooks`。
