# 项目本地 pstack skills

本目录保存 [cursor/plugins 的 pstack](https://github.com/cursor/plugins/tree/main/pstack) 普通文件副本，不依赖符号链接、全局安装或 Git 子模块。

- 上游版本：`0.15.28`。
- 上游提交：`d457567332aa6989e753ea289f30ea2bfbc80bc0`。
- 56 个技能直接位于 `<技能名>/SKILL.md`，同目录的脚本、playbooks 和 references 一并保留。
- 原版文档、agent 定义、可选自动化模板和 MIT 许可证保存在 [`.pstack/`](.pstack/README.md)。其中的自动化文件仅作为参考，不代表已启用自动化。
- 来源、文件 SHA-256 和本地相对链接调整记录在 [`.pstack/source.json`](.pstack/source.json)。除修正目录布局变化造成的 Markdown 链接外，技能内容保留上游原样。

在支持 `.agents/skills` 的代理中重新开始会话后，通过 `$poteto-help` 查看用途，或显式调用 `$poteto-mode`、`$how`、`$tdd` 等技能。实际发现和调用方式由代理宿主决定。

本目录是 Cursor 原版 pstack，并非 Codex 移植版。原版的 `setup-pstack` 会配置 `~/.cursor/rules/`，部分工作流依赖 Cursor 的 Task、模型名称、Automations 等能力；当前宿主没有对应能力时，应说明限制，不能把复制文件视为已配置这些集成。添加这些文件不会执行技能、注册自定义 agent 或修改用户全局配置。

## 更新

从上游选择明确提交，更新各技能及 `.pstack/` 内配套资料，保留许可证，修复相对链接并刷新 `source.json`。更新前先检查本地修改，避免覆盖项目定制。
