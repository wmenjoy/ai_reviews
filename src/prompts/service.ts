import * as vscode from 'vscode'
import { Prompt, PromptFile } from './models'
import { GlobalPromptRepository, WorkspacePromptRepository, WorkspaceFilePromptRepository } from './repositories'
import { rank } from './ranking'

export class PromptService {
  private workspaceRepo: WorkspacePromptRepository
  private globalRepo: GlobalPromptRepository
  private fileRepo: WorkspaceFilePromptRepository

  constructor(private context: vscode.ExtensionContext) {
    this.workspaceRepo = new WorkspacePromptRepository(context)
    this.globalRepo = new GlobalPromptRepository(context)
    this.fileRepo = new WorkspaceFilePromptRepository(context)
  }

  private async loadAll(): Promise<{ ws: PromptFile; gl: PromptFile; files: Prompt[] }> {
    const [ws, gl, files] = await Promise.all([this.workspaceRepo.load(), this.globalRepo.load(), this.fileRepo.load()])
    return { ws, gl, files }
  }

  async createPrompt(title: string, content: string): Promise<void> {
    // Default to creating a file in the workspace
    await this.fileRepo.save({
      id: '', // id determined by file path
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      pinned: false
    })
  }

  async getSuggestions(prefix: string): Promise<Prompt[]> {
    const { ws, gl, files } = await this.loadAll()
    // workspace overrides global when same title
    const map = new Map<string, Prompt>()
    
    // Global prompts (JSON)
    for (const n of gl.prompts) map.set(n.title, n)
    // Workspace prompts (JSON)
    for (const n of ws.prompts) map.set(n.title, n)
    // Workspace prompts (Files) - Override JSON
    for (const n of files) map.set(n.title, n)

    const list = Array.from(map.values())
    // Reuse rank function (assuming it works on generic objects with title/tags)
    // We cast Prompt to any because rank expects Note-like structure which Prompt shares
    return rank(list as any, prefix).slice(0, (vscode.workspace.getConfiguration('prompts').get<number>('maxSuggestions') ?? 20))
  }

  async bumpUsage(id: string): Promise<void> {
    // Usage tracking for JSON-based prompts
    const { ws } = await this.loadAll()
    const n = ws.prompts.find((x) => x.id === id)
    if (n) {
      n.usageCount += 1
      n.updatedAt = Date.now()
      await this.workspaceRepo.save(ws)
    }
    // For file-based prompts, we'd need a separate metadata store, skipping for V1
  }

  async openPrompt(prompt: Prompt): Promise<void> {
    if (prompt.fileUri) {
      const uri = vscode.Uri.parse(prompt.fileUri)
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc, { preview: false })
      return
    }
    // If it's a JSON prompt without a file, maybe create a temp file or just insert?
    // Ideally we migrate it to a file, or open a virtual doc.
    // For simplicity, let's just create a file for it if requested to edit.
    await this.fileRepo.save(prompt)
    const dir = await this.fileRepo.dir()
    if (dir) {
        const uri = vscode.Uri.joinPath(dir, `${prompt.title}.md`)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: false })
    }
  }

  async processTemplate(content: string): Promise<string | null> {
    const editor = vscode.window.activeTextEditor
    const selection = editor ? editor.document.getText(editor.selection) : ''

    // Replace {{selection}} first
    let result = content.replace(/\{\{\s*selection\s*\}\}/gi, selection)

    // Find other variables: {{variable}}
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
    let match
    const variables = new Set<string>()
    while ((match = regex.exec(content)) !== null) {
      const varName = match[1]
      if (varName.toLowerCase() !== 'selection') {
        variables.add(varName)
      }
    }

    for (const v of variables) {
      const val = await vscode.window.showInputBox({ prompt: `请输入变量 '${v}' 的值` })
      if (val === undefined) return null // Cancelled
      // Replace all instances of this variable
      const vRegex = new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g')
      result = result.replace(vRegex, val)
    }
    return result
  }
}
