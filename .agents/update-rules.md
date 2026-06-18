https://oxc.rs/docs/guide/usage/linter/rules.html

启动多个子代理逐一排查，列出所有 ts 编译器能检查出问题的 oxlint 规则（并标注 tsconfig 需要打开什么选项）。

---

/Users/smallmain/Documents/Work/dev/configs/web/stylelint

这是我的 stylelint 配置，请按照官方推荐 + 社区主流 + 现代 css 推荐的思路，逐一决定所有规则（包括我使用的 extend 扩展 插件包新增的规则）是否开启，和如何配置参数的配置，最后给我一段 rules 代码（不要直接改我的配置）和列表列出每个规则这样决定的原因和每个规则的作用描述。

对于当前推荐的已经默认启用的规则，如果你的决定不是将其关闭或者需要配置自定义参数，则无需出现在 rules 中。

规则数量可能有点大，有上百条规则，考虑使用并行多个子代理，每个只处理少量的规则避免模型幻觉。
