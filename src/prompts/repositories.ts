import * as vscode from 'vscode'
import { Prompt, PromptFile } from './models'

const FILE_NAME = 'prompts.json'

async function readJson(uri: vscode.Uri): Promise<PromptFile | null> {
  try {
    const buf = await vscode.workspace.fs.readFile(uri)
    const txt = Buffer.from(buf).toString('utf8')
    return JSON.parse(txt)
  } catch {
    return null
  }
}

async function writeJson(uri: vscode.Uri, data: PromptFile): Promise<void> {
  const txt = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
  await vscode.workspace.fs.writeFile(uri, txt)
}

export class WorkspacePromptRepository {
  constructor(private context: vscode.ExtensionContext) {}
  async getUri(): Promise<vscode.Uri | null> {
    const prefer = vscode.workspace.getConfiguration('prompts').get<boolean>('workspaceFilePreferred') ?? true
    const ws = vscode.workspace.workspaceFolders?.[0]
    if (!ws) return null
    const uri = vscode.Uri.joinPath(ws.uri, '.vscode', FILE_NAME)
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(ws.uri, '.vscode'))
    } catch {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(ws.uri, '.vscode'))
    }
    if (prefer) return uri
    if (this.context.storageUri) {
      await vscode.workspace.fs.createDirectory(this.context.storageUri)
      return vscode.Uri.joinPath(this.context.storageUri, FILE_NAME)
    }
    return uri
  }
  async load(): Promise<PromptFile> {
    const uri = await this.getUri()
    if (!uri) return { version: 1, prompts: [] }
    const data = await readJson(uri)
    return data ?? { version: 1, prompts: [] }
  }
  async save(file: PromptFile): Promise<void> {
    const uri = await this.getUri()
    if (!uri) return
    await writeJson(uri, file)
  }
}

export class GlobalPromptRepository {
  constructor(private context: vscode.ExtensionContext) {}
  getUri(): vscode.Uri {
    const base = this.context.globalStorageUri
    // ensure directory exists
    vscode.workspace.fs.createDirectory(base)
    return vscode.Uri.joinPath(base, FILE_NAME)
  }
  async load(): Promise<PromptFile> {
    const uri = this.getUri()
    const data = await readJson(uri)
    return data ?? { version: 1, prompts: [] }
  }
  async save(file: PromptFile): Promise<void> {
    const uri = this.getUri()
    await writeJson(uri, file)
  }
}

export class WorkspaceFilePromptRepository {
  constructor(private context: vscode.ExtensionContext) {}
  async dir(): Promise<vscode.Uri | null> {
    const ws = vscode.workspace.workspaceFolders?.[0]
    if (!ws) return null
    const d = vscode.Uri.joinPath(ws.uri, 'jinliang-prompts')
    try {
      await vscode.workspace.fs.stat(d)
    } catch {
      await vscode.workspace.fs.createDirectory(d)
    }
    return d
  }
  async load(): Promise<Prompt[]> {
    const d = await this.dir()
    if (!d) return []
    const entries = await vscode.workspace.fs.readDirectory(d)
    const prompts: Prompt[] = []
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) continue
      if (!name.endsWith('.md')) continue // Only read .md files as prompts

      const uri = vscode.Uri.joinPath(d, name)
      const buf = await vscode.workspace.fs.readFile(uri)
      const txt = Buffer.from(buf).toString('utf8')
      const stat = await vscode.workspace.fs.stat(uri)
      prompts.push({
        id: uri.fsPath,
        title: name.replace(/\.md$/, ''), // Remove .md extension for title
        content: txt,
        createdAt: stat.ctime,
        updatedAt: stat.mtime,
        usageCount: 0, // Files don't track usage count internally unless we parse frontmatter
        fileUri: uri.toString()
      })
    }
    return prompts
  }

  async save(prompt: Prompt): Promise<void> {
    const d = await this.dir()
    if (!d) return
    const uri = vscode.Uri.joinPath(d, `${prompt.title}.md`)
    const txt = Buffer.from(prompt.content || '', 'utf8')
    await vscode.workspace.fs.writeFile(uri, txt)
  }
  
  async delete(prompt: Prompt): Promise<void> {
      if (prompt.fileUri) {
          const uri = vscode.Uri.parse(prompt.fileUri)
          await vscode.workspace.fs.delete(uri)
      }
  }
}
