import * as vscode from 'vscode'
import { Prompt } from '../prompts/models'
import { PromptService } from '../prompts/service'

class PromptItem extends vscode.TreeItem {
  constructor(public readonly prompt: Prompt) {
    super(prompt.title)
    this.contextValue = 'prompt'
    this.description = prompt.tags?.join(', ')
    this.tooltip = prompt.content?.slice(0, 120) ?? ''
    if (prompt.fileUri) this.resourceUri = vscode.Uri.parse(prompt.fileUri)
    this.command = { command: 'prompts.edit', title: 'Edit', arguments: [this] }
    this.iconPath = new vscode.ThemeIcon(prompt.pinned ? 'pin' : 'sparkle')
  }
}

export class PromptsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private filter = ''

  constructor(private service: PromptService) {
    vscode.commands.registerCommand('prompts.refresh', () => this.refresh())
    vscode.commands.registerCommand('prompts.edit', async (item: PromptItem) => {
      await this.service.openPrompt(item.prompt)
    })
  }

  refresh() {
    this._onDidChangeTreeData.fire()
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return []
    const prompts = await this.service.getSuggestions(this.filter)
    return prompts.map((n) => new PromptItem(n))
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element
  }
}
