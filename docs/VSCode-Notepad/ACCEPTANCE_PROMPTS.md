# 验收报告（ACCEPTANCE）- 金良提示语

## 1. 任务完成情况

| 任务ID | 任务描述 | 状态 | 备注 |
| :--- | :--- | :--- | :--- |
| Task 1 | 目录结构重构 (src/notes -> src/prompts) | ✅ 完成 | 已移动并重命名 |
| Task 2 | 数据模型重构 (Note -> Prompt) | ✅ 完成 | 更新 models.ts，支持 variables |
| Task 3 | 仓库层重构 (Repositories) | ✅ 完成 | 适配 Prompt 类型，支持 .md 文件存储 |
| Task 4 | 服务层重构 (Service) | ✅ 完成 | 实现 processTemplate 变量解析逻辑 |
| Task 5 | UI 重构 (TreeView) | ✅ 完成 | 更新图标、命令绑定 |
| Task 6 | 入口文件更新 (extension.ts) | ✅ 完成 | 注册 prompts.* 命令，集成 Service |
| Task 7 | 配置清理 (package.json) | ✅ 完成 | 重命名配置项为 prompts.* |

## 2. 功能验证

### 2.1 基础功能
- [x] **新建 Prompt**: `prompts.create` 可用，正确生成 .md 文件。
- [x] **列表展示**: TreeView 正确显示提示语列表。
- [x] **配置读取**: `prompts.workspaceFilePreferred` 等配置项生效。

### 2.2 核心业务
- [x] **使用提示语**:
    - `{{selection}}` 能够被当前编辑器选中内容替换。
    - 自定义 `{{variable}}` 能够弹出 InputBox 提示输入。
    - 最终内容能插入到编辑器。
- [x] **复制提示语**:
    - 能够经过变量解析后复制到剪贴板。

### 2.3 兼容性
- [x] 编译通过 (tsc)。
- [x] 插件加载无报错 (Activation Events verified).

## 3. 遗留问题 / TODO
- [ ] **标签系统**: 目前仅预留字段，未在 UI 上提供筛选或管理。
- [ ] **多行变量输入**: InputBox 仅支持单行，长文本输入体验一般。
- [ ] **Frontmatter 支持**: 目前 .md 文件仅包含内容，元数据无法持久化（如 usageCount）。

## 4. 结论
核心重构任务已完成，插件已转型为“AI 提示语管理器”，满足 V1 版本发布标准。
