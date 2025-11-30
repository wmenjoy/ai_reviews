import * as assert from 'assert'
import * as vscode from 'vscode'

suite('Notepad Integration', () => {
  test('activates extension', async () => {
    const ext = vscode.extensions.getExtension('ai-dev.vscode-notepad-hints')
    assert.ok(ext)
    await ext!.activate()
    assert.ok(ext!.isActive)
  })

  test('provides completion from workspace notes', async () => {
    const ws = vscode.workspace.workspaceFolders?.[0]
    assert.ok(ws)
    const dir = vscode.Uri.joinPath(ws!.uri, '.vscode')
    try {
      await vscode.workspace.fs.stat(dir)
    } catch {
      await vscode.workspace.fs.createDirectory(dir)
    }
    const file = vscode.Uri.joinPath(dir, 'notepad.json')
    const note = {
      version: 1,
      notes: [
        {
          id: 't1',
          title: 'select',
          content: 'SELECT * FROM users;',
          tags: ['sql'],
          scope: {},
          snippet: true,
          triggers: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          usageCount: 0,
          pinned: false,
        },
      ],
    }
    await vscode.workspace.fs.writeFile(file, Buffer.from(JSON.stringify(note)))

    const target = vscode.Uri.joinPath(ws!.uri, 'a.txt')
    await vscode.workspace.fs.writeFile(target, Buffer.from('sel'))
    const doc = await vscode.workspace.openTextDocument(target)
    await vscode.window.showTextDocument(doc)
    const pos = new vscode.Position(0, 3)
    const list: vscode.CompletionList = await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      pos,
    )
    const labels = (list.items || []).map((i) => i.label)
    assert.ok(labels.includes('select'))
  })
})
