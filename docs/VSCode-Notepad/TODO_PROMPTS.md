# 待办事项（TODO）- 金良提示语

## 1. 待优化功能
- [ ] **多行输入支持**: 目前 `vscode.window.showInputBox` 仅支持单行输入，对于复杂的变量值体验不佳。建议引入 Webview 或使用 QuickPick 的多选模式。
- [ ] **标签筛选**: 数据模型已支持 `tags`，但 UI 侧边栏暂不支持按标签筛选或分组显示。
- [ ] **元数据持久化**: 目前 `.md` 文件仅保存内容，无法保存 `tags`, `pinned`, `usageCount` 等元数据。建议引入 YAML Frontmatter (如 Jekyll/Hexo 格式)。

## 2. 缺失配置
- [ ] **图标资源**: 目前 View Container 缺少自定义 SVG 图标，仅使用了默认或 Warning 状态。
- [ ] **国际化 (i18n)**: 目前界面主要是中文，若需发布到 Marketplace 建议增加英文支持。

## 3. 用户操作建议
- 推荐在项目根目录创建 `jinliang-prompts` 文件夹，并提交到 Git，以便团队成员共享 Prompt 模板。
- 可以在 `.vscode/settings.json` 中配置 `prompts.triggerChars` 来自定义触发补全的快捷键。
