# 金良提示语 (Jinliang Prompts)

专为 AI 辅助编程设计的 VSCode 扩展。
高效维护、管理和使用 AI 提示语模板 (Prompt Templates)，支持变量动态解析，让与 AI 的对话更精准、更快捷。

## 核心功能

*   **✨ 提示语管理**：在侧边栏统一管理你的 Prompt 模板。
*   **📝 模板变量支持**：
    *   `{{selection}}`：自动替换为当前编辑器选中的代码/文本。
    *   `{{variable}}`：支持自定义变量，使用时自动弹出输入框请求填写。
*   **🚀 快速使用**：
    *   **插入模式**：解析模板后直接插入当前光标位置。
    *   **复制模式**：解析模板后复制到剪贴板，方便粘贴到 AI Chat 窗口。
*   **📂 本地化存储**：
    *   默认使用工作区根目录下的 `jinliang-prompts/*.md` 文件存储模板，方便随项目进行版本控制 (Git)。
    *   支持全局存储（配置可选）。

## 快速开始

1.  **新建模板**：点击侧边栏“新建提示语”按钮，或运行命令 `prompts.create`。
2.  **编写模板**：
    ```markdown
    请帮我优化以下代码，重点关注 {{focus_area}}：

    ```{{language}}
    {{selection}}
    ```
    ```
3.  **使用模板**：
    *   选中一段代码。
    *   点击侧边栏模板旁的“使用”图标，或运行 `prompts.use`。
    *   按提示输入变量（如 `focus_area` 和 `language`）。
    *   生成的内容将自动插入或复制。

## 配置项

*   `prompts.triggerChars`: 触发补全的字符列表。
*   `prompts.workspaceFilePreferred`: 是否优先使用工作区文件 (默认为 true)。
*   `prompts.enableInline`: 是否启用行内幽灵文本建议。

## 目录结构
你的提示语默认存储在：
```
${workspaceFolder}/jinliang-prompts/
  ├── optimize-code.md
  ├── explain-bug.md
  └── ...
```

## License
MIT
