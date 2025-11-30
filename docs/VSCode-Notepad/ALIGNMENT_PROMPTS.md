# 对齐（ALIGNMENT）- 金良提示语 (Jinliang Prompts)

## 原始需求变更
- **原目标**：简单的 Notepad 记事本，用于记录零散信息。
- **新目标**：**AI 提示语模板管理器**。
- **核心场景**：用户在与 AI（ChatGPT, Copilot, etc.）交互时，需要调用经过打磨的、固定的提示语（Prompts），并可能结合当前代码上下文。

## 核心价值
1. **模板化**：维护高质量的 Prompt 模板，支持变量（Placeholders）。
2. **上下文增强**：能够将当前编辑器选中的代码或文本作为参数填入 Prompt。
3. **快速复用**：一键复制或插入到 Chat 输入框。

## 功能规范

### 1. 数据模型 (Prompt)
- **Title**: 提示语名称（如 "代码重构", "解释 Bug"）。
- **Content**: 提示语模板内容，支持 `{{variable}}` 语法。
  - 示例：`请作为一位资深 {{language}} 专家，帮我重构以下代码，重点优化 {{aspect}}：\n\n{{selection}}`
- **Tags**: 分类标签（如 `coding`, `writing`, `review`）。
- **Scope**: 适用范围（语言、路径）。

### 2. 交互设计
- **侧边栏 (Sidebar)**:
  - 展示所有 Prompt（按标签分组或列表）。
  - **图标**：使用 `sparkle` 或 `comment` 相关图标。
  - **操作**：
    - `Use` (点击): 触发使用流程。
    - `Edit` (右键): 编辑模板文件。
    - `Copy` (右键/按钮): 直接复制内容到剪贴板。

- **使用流程 (The "Use" Flow)**:
  1. 用户点击某个 Prompt。
  2. **变量解析**：
     - 系统检测内容中的 `{{selection}}`：自动替换为当前编辑器选中的文本。
     - 系统检测其他 `{{variable}}`：弹出 InputBox 询问用户输入。
  3. **输出**：
     - 将最终生成的 Prompt 插入到当前光标处（如果是 Chat 输入框）。
     - 或者 复制到剪贴板。

- **新建流程**:
  - 类似于“新建文件”，在 `prompts/` 目录下创建 Markdown 文件。

### 3. 存储结构
- 推荐使用 `.vscode/prompts/` 目录存放 `.md` 文件。
- 每个文件代表一个 Prompt。
- 文件名即 Title。
- Frontmatter (YAML) 可用于存储 Tags 等元数据（可选，或仅纯文本）。

## 待确认点
- 是否需要支持全局模板？(是，保留全局存储能力)
- 是否支持 Frontmatter？(为了简单起见，V1 仅把文件内容当做 Prompt，文件名当做 Title。如果需要 Tags，后续支持 YAML header)。

## 变更计划
1. **Rename**: Extension `displayName` -> `金良提示语 (Jinliang Prompts)`.
2. **Refactor**: `Note` -> `Prompt`.
3. **Feature**: `PromptService` 解析 `{{}}`.
4. **Commands**: `prompts.use`, `prompts.create`.
