import * as vscode from 'vscode'
import { PromptsTreeProvider } from './ui/promptsTree'
import { PromptService } from './prompts/service'

export function activate(context: vscode.ExtensionContext) {
  const service = new PromptService(context)

  const tree = new PromptsTreeProvider(service)
  // Updated view ID to match package.json
  const treeView = vscode.window.createTreeView('prompts.views', {
    treeDataProvider: tree,
  })
  context.subscriptions.push(treeView)

  // Command: Open View
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.open', async () => {
      await vscode.commands.executeCommand('workbench.view.explorer')
      await vscode.commands.executeCommand('workbench.views.service.openView', 'prompts.views', true)
    }),
  )

  // Command: Create Prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.create', async () => {
      const title = await vscode.window.showInputBox({ prompt: '新建提示语模板标题 (Prompt Title)' })
      if (!title) return
      // If there is a selection, use it as initial content
      const pre = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection) ?? ''
      
      // Create prompt (file)
      await service.createPrompt(title, pre)
      
      // Refresh and notify
      tree.refresh()
      vscode.window.showInformationMessage(`已创建提示语模板: ${title}`)
    }),
  )

  // Command: Use Prompt (Insert)
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.use', async (item?: any) => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        vscode.window.showWarningMessage('请先打开一个编辑器以插入提示语')
        return
      }

      let content = ''
      let promptId = ''
      
      if (item?.prompt?.content) {
        content = item.prompt.content
        promptId = item.prompt.id
      } else {
        const pick = await vscode.window.showQuickPick(
          (await service.getSuggestions('')).map((n) => ({ label: n.title, description: n.tags?.join(', '), n })),
          { placeHolder: '选择要使用的提示语模板' }
        )
        if (!pick) return
        content = pick.n.content ?? ''
        promptId = pick.n.id
      }

      // Process Template
      const finalContent = await service.processTemplate(content)
      if (finalContent === null) return // User cancelled

      await editor.edit((ed) => ed.insert(editor.selection.active, finalContent))
      if (promptId) await service.bumpUsage(promptId)
    }),
  )

  // Command: Copy Prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.copy', async (item?: any) => {
      let content = ''
      let promptId = ''

      if (item?.prompt?.content) {
        content = item.prompt.content
        promptId = item.prompt.id
      } else {
        const pick = await vscode.window.showQuickPick(
          (await service.getSuggestions('')).map((n) => ({ label: n.title, description: n.tags?.join(', '), n })),
          { placeHolder: '选择要复制的提示语模板' }
        )
        if (!pick) return
        content = pick.n.content ?? ''
        promptId = pick.n.id
      }

      // Process Template
      const finalContent = await service.processTemplate(content)
      if (finalContent === null) return // User cancelled

      await vscode.env.clipboard.writeText(finalContent)
      vscode.window.showInformationMessage('提示语已复制到剪贴板')
      if (promptId) await service.bumpUsage(promptId)
    }),
  )

  // Command: Search (and Use)
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.search', async () => {
      await vscode.commands.executeCommand('prompts.use')
    }),
  )

  // Command: Toggle Scope
  context.subscriptions.push(
    vscode.commands.registerCommand('prompts.toggleScope', async () => {
      const cfg = vscode.workspace.getConfiguration('prompts')
      const current = cfg.get<boolean>('workspaceFilePreferred') ?? true
      await cfg.update('workspaceFilePreferred', !current, vscode.ConfigurationTarget.Workspace)
      vscode.window.showInformationMessage(`Workspace file preferred: ${!current}`)
      tree.refresh()
    }),
  )

  // Providers (Completion / Inline)
  const triggerChars = vscode.workspace.getConfiguration('prompts').get<string[]>('triggerChars') ?? [
    ' ',
    '.',
    '/',
    '-',
    '_',
  ]
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file' },
      {
        async provideCompletionItems(doc, pos) {
          const line = doc.lineAt(pos.line).text.slice(0, pos.character)
          const prefix = line.split(/\s|\(|\{|\[|\.|,|;|:/).pop() ?? ''
          const prompts = await service.getSuggestions(prefix)
          const items = prompts.map((n) => {
            const it = new vscode.CompletionItem(n.title, vscode.CompletionItemKind.Snippet)
            it.insertText = new vscode.SnippetString(n.content ?? '')
            it.detail = n.tags?.join(', ')
            return it
          })
          return items
        },
      },
      ...triggerChars,
    ),
  )

  if (vscode.workspace.getConfiguration('prompts').get('enableInline') !== false) {
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, {
        async provideInlineCompletionItems(doc, pos) {
          const line = doc.lineAt(pos.line).text.slice(0, pos.character)
          const prefix = line.split(/\s|\(|\{|\[|\.|,|;|:/).pop() ?? ''
          const [top] = await service.getSuggestions(prefix)
          if (!top?.content) return []
          return [
            {
              insertText: top.content,
              range: new vscode.Range(pos, pos),
            },
          ]
        },
      }),
    )
  }

  // Status Bar
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.text = '$(sparkle) 金良提示语'
  status.command = 'prompts.search'
  status.show()
  context.subscriptions.push(status)
}
