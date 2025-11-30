# 共识（CONSENSUS）- 金良提示语 (Jinliang Prompts)

## 1. 需求描述与验收标准

### 1.1 核心需求
将 VSCode 插件从“简单记事本”转型为“AI 提示语模板管理器”。
核心价值在于维护一套固定的、高质量的 AI Prompt 模板，并能方便地结合当前上下文（如选中的代码）生成最终 Prompt，用于与 AI 交互。

### 1.2 验收标准
1.  **插件标识**：插件名称显示为“金良提示语”，图标和命令风格与 AI 提示语场景一致（使用 Sparkle 图标）。
2.  **模板管理**：
    *   用户可以在侧边栏查看所有提示语模板。
    *   支持新建、编辑、删除模板。
    *   模板以 `.md` 文件形式存储在工作区 `jinliang-notes/` (后续建议改为 `prompts/`) 或全局存储中。
3.  **模板使用**：
    *   支持 `{{selection}}` 变量：自动替换为当前编辑器选中的文本。
    *   支持自定义变量 `{{variable}}`：使用时弹出输入框让用户填写。
    *   提供“使用”命令：处理变量后直接插入当前编辑器光标处。
    *   提供“复制”命令：处理变量后复制到剪贴板。
4.  **数据模型**：
    *   代码内部实体从 `Note` 重构为 `Prompt`。
    *   文件存储结构保持兼容或迁移至更清晰的目录结构。

## 2. 技术实现方案

### 2.1 架构调整
*   **Model Layer**: 重命名 `Note` -> `Prompt`, `NoteScope` -> `PromptScope`.
*   **Repository Layer**: 保持文件系统读写逻辑，但变量名和目录名需调整以符合语境（如 `jinliang-prompts`）。
*   **Service Layer**: `PromptService` 负责模板解析（Template Processing）和 CRUD 操作。
*   **UI Layer**: TreeView 显示 Prompt 列表，Status Bar 提供快速入口。

### 2.2 关键技术点
*   **变量解析正则**: `\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`。
*   **VSCode Context**: 获取 `activeTextEditor` 和 `selection`。

## 3. 边界限制
*   **V1 版本**：
    *   不引入复杂的 YAML Frontmatter，文件名即标题，文件内容即 Prompt。
    *   不引入复杂的 AST 解析，仅基于正则的字符串替换。
    *   不自行构建 AI Chat 界面，仅辅助生成 Prompt 文本。

## 4. 确认不确定性
*   已确认：数据存储优先使用工作区目录，便于随项目版本控制。
*   已确认：不再支持纯文本笔记的插入功能，所有“Note”皆视为“Prompt Template”。

此文档标志着 [Align] 阶段完成，进入 [Architect] 阶段。
