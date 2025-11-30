# 架构设计（DESIGN）- 金良提示语

## 1. 整体架构图

```mermaid
graph TD
    User[用户] -->|点击/命令| VSCodeUI[VSCode 界面 (TreeView/CommandPalette)]
    VSCodeUI -->|调用| Extension[Extension 主程序]
    Extension -->|依赖| PromptService[Prompt 业务服务]
    PromptService -->|CRUD| Repository[数据仓库层]
    PromptService -->|解析| TemplateEngine[模板解析引擎]
    Repository -->|读写| FileSystem[文件系统 (.md files)]
```

## 2. 核心模块设计

### 2.1 数据模型 (Domain Model)
文件: `src/prompts/models.ts` (原 `src/notes/models.ts`)

```typescript
export interface Prompt {
  id: string          // 唯一标识 (文件路径)
  title: string       // 标题 (文件名)
  content: string     // 模板内容
  tags?: string[]     // 标签 (暂未实现，预留)
  variables?: string[] // 自动分析出的变量列表
  createdAt: number
  updatedAt: number
}
```

### 2.2 数据仓库 (Repository)
文件: `src/prompts/repositories.ts` (原 `src/notes/repositories.ts`)

*   **WorkspacePromptRepository**:
    *   目录: `.vscode/prompts/` 或 `jinliang-prompts/` (项目根目录)。
    *   职责: 读写工作区内的 Markdown 文件。
*   **GlobalPromptRepository**:
    *   目录: `globalStorage/prompts/`。
    *   职责: 读写全局通用的 Prompt。

### 2.3 业务服务 (Service)
文件: `src/prompts/service.ts` (原 `src/notes/service.ts`)

*   **getPrompts()**: 获取所有 Prompt，按 Workspace 优先合并。
*   **createPrompt(title, content)**: 创建新文件。
*   **processTemplate(content)**:
    1.  替换 `{{selection}}`。
    2.  正则提取其他 `{{var}}`。
    3.  `window.showInputBox` 循环获取用户输入。
    4.  替换所有变量并返回结果。

### 2.4 UI 交互
*   **PromptsTreeDataProvider**: 实现 `TreeDataProvider<Prompt>`。
*   **Commands**:
    *   `prompts.create`: 调用 Service 创建。
    *   `prompts.use`: 调用 Service 解析 -> `editor.edit` 插入。
    *   `prompts.copy`: 调用 Service 解析 -> `env.clipboard.writeText`。

## 3. 目录结构重构
```
src/
  ├── extension.ts       // 入口，注册命令
  ├── prompts/           // [New] 提示语核心模块
  │   ├── models.ts      // 数据模型
  │   ├── repositories.ts// 存取逻辑
  │   └── service.ts     // 业务逻辑
  └── ui/
      └── promptsTree.ts // [Rename] TreeView 实现
```

## 4. 接口契约
*   `processTemplate(content: string): Promise<string | null>`
    *   Input: 原始模板字符串
    *   Output: 解析后的字符串，或 null (若用户取消)

## 5. 异常处理
*   文件读写失败: catch 并提示 Error Message。
*   用户取消输入: 返回 null，中断操作。
*   无编辑器选中: `{{selection}}` 替换为空字符串或提示警告。
