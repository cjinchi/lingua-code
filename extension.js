const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LINGUA_COMMAND_CONTENT = `Scan the entire project for all \`__LINGUA_CODE_TODO_START__\` / \`__LINGUA_CODE_TODO_END__\` blocks.

For each block found:

1. Read the text content between \`__LINGUA_CODE_TODO_START__\` and \`__LINGUA_CODE_TODO_END__\` — this is a natural language description of the functionality to implement.
2. Understand the surrounding code context (the file, the position in the file, the language, imports, etc.).
3. Implement the described functionality as actual working code that fits naturally into the surrounding context.
4. Replace the **entire block** (including the \`__LINGUA_CODE_TODO_START__\` and \`__LINGUA_CODE_TODO_END__\` marker lines) with the implementation.

Rules:
- Process ALL lingua blocks found across all files in the project.
- The implementation must match the coding style, language, and conventions of the surrounding code.
- Do not leave any \`__LINGUA_CODE_TODO_START__\` or \`__LINGUA_CODE_TODO_END__\` markers behind after processing.
- If a block's description is ambiguous, make a reasonable interpretation based on context and proceed.
`;

const COMMAND_FILE = path.join(os.homedir(), '.claude', 'commands', 'lingua.md');

let blockDecorationType;
let markerDecorationType;

// --- Check command status ---

function getCommandStatus() {
  try {
    if (!fs.existsSync(COMMAND_FILE)) {
      return 'not_installed';
    }
    const existing = fs.readFileSync(COMMAND_FILE, 'utf-8');
    return existing === LINGUA_COMMAND_CONTENT ? 'installed' : 'outdated';
  } catch {
    return 'not_installed';
  }
}

function installCommand() {
  const commandsDir = path.dirname(COMMAND_FILE);
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.writeFileSync(COMMAND_FILE, LINGUA_COMMAND_CONTENT);
}

// --- Webview for command status ---

class StatusViewProvider {
  constructor() {
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'install') {
        try {
          installCommand();
          vscode.window.showInformationMessage('/lingua command installed.');
        } catch (err) {
          vscode.window.showErrorMessage('Failed to install: ' + err.message);
        }
        this.refresh();
      }
    });

    this.refresh();
  }

  refresh() {
    if (!this._view) return;
    const status = getCommandStatus();
    this._view.webview.html = this._getHtml(status);
  }

  _getHtml(status) {
    if (status === 'installed') {
      return `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; font-size: 13px; }
  .status { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #4caf50; flex-shrink: 0; }
  .hint { opacity: 0.7; font-size: 12px; }
</style></head><body>
  <div class="status"><span class="dot"></span> /lingua command installed</div>
  <div class="hint">Run <code>/lingua</code> in Claude Code to process all TODO blocks.</div>
</body></html>`;
    }

    const label = status === 'outdated' ? 'Update' : 'Install';
    const desc = status === 'outdated'
      ? '/lingua command is outdated'
      : '/lingua command not installed';

    return `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; font-size: 13px; }
  .status { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${status === 'outdated' ? '#ff9800' : '#f44336'}; flex-shrink: 0; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; cursor: pointer; border-radius: 2px; font-size: 13px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .hint { opacity: 0.7; font-size: 12px; margin-top: 8px; }
</style></head><body>
  <div class="status"><span class="dot"></span> ${desc}</div>
  <button onclick="install()">${label} /lingua Command</button>
  <div class="hint">Installs to ~/.claude/commands/lingua.md</div>
  <script>
    const vscode = acquireVsCodeApi();
    function install() { vscode.postMessage({ command: 'install' }); }
  </script>
</body></html>`;
  }
}

// --- Webview for blocks list ---

class BlocksViewProvider {
  constructor() {
    this._view = null;
    this._viewAsTree = false;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'goto') {
        vscode.commands.executeCommand('linguaCode.gotoBlock', msg.filePath, msg.line);
      } else if (msg.command === 'toggleView') {
        this._viewAsTree = !this._viewAsTree;
        this.refresh();
      } else if (msg.command === 'refresh') {
        this.refresh();
      }
    });

    this.refresh();
  }

  async refresh() {
    if (!this._view) return;
    const blocks = await this._scanBlocks();
    this._view.webview.html = this._getHtml(blocks);
  }

  async _scanBlocks() {
    const results = [];
    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');

    for (const fileUri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const blocks = findBlocks(doc);

        for (const block of blocks) {
          let preview = '(empty)';
          if (block.endLine - block.startLine > 1) {
            const lines = [];
            for (let i = block.startLine + 1; i < block.endLine; i++) {
              lines.push(doc.lineAt(i).text.trim());
            }
            preview = lines.join(' ').substring(0, 80) || '(empty)';
          }

          results.push({
            preview,
            relativePath: vscode.workspace.asRelativePath(fileUri),
            filePath: fileUri.fsPath,
            line: block.startLine,
          });
        }
      } catch {
        // skip binary / unreadable files
      }
    }

    return results;
  }

  _getHtml(blocks) {
    const treeMode = this._viewAsTree;
    const toggleIcon = treeMode ? 'list-flat' : 'list-tree';
    const toggleTitle = treeMode ? 'View as List' : 'View as Tree';

    let listHtml = '';

    if (blocks.length === 0) {
      listHtml = '<div class="empty">No Lingua blocks found</div>';
    } else if (treeMode) {
      // Group by file
      const grouped = {};
      for (const b of blocks) {
        if (!grouped[b.relativePath]) grouped[b.relativePath] = [];
        grouped[b.relativePath].push(b);
      }

      for (const [filePath, fileBlocks] of Object.entries(grouped)) {
        listHtml += `<div class="file-header" onclick="toggleFile(this)">
          <span class="codicon codicon-chevron-down"></span>
          <span class="codicon codicon-file"></span>
          <span class="file-name">${this._escapeHtml(filePath)}</span>
          <span class="badge">${fileBlocks.length}</span>
        </div>
        <div class="file-children">`;

        for (const b of fileBlocks) {
          listHtml += `<div class="item tree-item" onclick="goto('${this._escapeJs(b.filePath)}', ${b.line})">
            <div class="preview">${this._escapeHtml(b.preview)}</div>
            <div class="location">Line ${b.line + 1}</div>
          </div>`;
        }

        listHtml += '</div>';
      }
    } else {
      // Flat list
      for (const b of blocks) {
        listHtml += `<div class="item" onclick="goto('${this._escapeJs(b.filePath)}', ${b.line})">
          <div class="preview">${this._escapeHtml(b.preview)}</div>
          <div class="location">${this._escapeHtml(b.relativePath)}:${b.line + 1}</div>
        </div>`;
      }
    }

    return `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0; margin: 0; font-size: 13px; }
  .toolbar { display: flex; justify-content: flex-end; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .toolbar button { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; opacity: 0.7; font-size: 14px; }
  .toolbar button:hover { opacity: 1; }
  .item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15)); }
  .item:hover { background: var(--vscode-list-hoverBackground); }
  .tree-item { padding-left: 28px; }
  .preview { font-size: 13px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .location { font-size: 11px; opacity: 0.6; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .file-header { display: flex; align-items: center; gap: 4px; padding: 6px 8px; cursor: pointer; font-weight: 500; font-size: 12px; opacity: 0.85; }
  .file-header:hover { background: var(--vscode-list-hoverBackground); }
  .file-children.collapsed { display: none; }
  .file-header .codicon-chevron-down.collapsed { transform: rotate(-90deg); }
  .badge { margin-left: auto; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 6px; border-radius: 8px; font-size: 11px; }
  .empty { padding: 16px; text-align: center; opacity: 0.6; }
  .codicon { font-family: 'codicon'; font-size: 14px; }
</style></head><body>
  <div class="toolbar">
    <button onclick="toggleView()" title="${toggleTitle}">
      <span class="codicon codicon-${toggleIcon}"></span>
    </button>
    <button onclick="refresh()" title="Refresh">
      <span class="codicon codicon-refresh"></span>
    </button>
  </div>
  ${listHtml}
  <script>
    const vscode = acquireVsCodeApi();
    function goto(filePath, line) { vscode.postMessage({ command: 'goto', filePath, line }); }
    function toggleView() { vscode.postMessage({ command: 'toggleView' }); }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function toggleFile(el) {
      const chevron = el.querySelector('.codicon-chevron-down');
      const children = el.nextElementSibling;
      chevron.classList.toggle('collapsed');
      children.classList.toggle('collapsed');
    }
  </script>
</body></html>`;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _escapeJs(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}

// --- Main ---

function activate(context) {
  // Decorations
  blockDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 50, 50, 0.08)',
    border: '1px solid rgba(255, 50, 50, 0.3)',
    borderRadius: '6px',
    isWholeLine: true,
  });

  markerDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.35',
    fontStyle: 'italic',
    isWholeLine: true,
  });

  // Sidebar: command status webview
  const statusProvider = new StatusViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('linguaCodeStatus', statusProvider)
  );

  // Sidebar: blocks webview
  const blocksProvider = new BlocksViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('linguaCodeBlocks', blocksProvider)
  );

  // Insert block command
  const insertCmd = vscode.commands.registerCommand('linguaCode.insertTodoBlock', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const line = editor.selection.active.line;
    const insertPos = new vscode.Position(line, 0);
    const block = `__LINGUA_CODE_TODO_START__\n\n__LINGUA_CODE_TODO_END__\n`;

    editor.edit(editBuilder => {
      editBuilder.insert(insertPos, block);
    }).then(success => {
      if (success) {
        const cursorPos = new vscode.Position(line + 1, 0);
        editor.selection = new vscode.Selection(cursorPos, cursorPos);
      }
    });
  });

  // Delete block command
  const deleteCmd = vscode.commands.registerCommand('linguaCode.deleteBlock', async (startLine, endLine) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const answer = await vscode.window.showWarningMessage(
      'Are you sure to delete this Lingua block?',
      { modal: true },
      'Delete'
    );

    if (answer === 'Delete') {
      const endPos = endLine + 1 < editor.document.lineCount
        ? new vscode.Position(endLine + 1, 0)
        : new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
      const range = new vscode.Range(new vscode.Position(startLine, 0), endPos);
      editor.edit(editBuilder => {
        editBuilder.delete(range);
      });
    }
  });

  // Install command (also callable from command palette)
  const installCmd = vscode.commands.registerCommand('linguaCode.installCommand', () => {
    try {
      installCommand();
      vscode.window.showInformationMessage('/lingua command installed.');
    } catch (err) {
      vscode.window.showErrorMessage('Failed to install: ' + err.message);
    }
  });

  // Refresh sidebar command
  const refreshCmd = vscode.commands.registerCommand('linguaCode.refreshBlocks', () => {
    blocksProvider.refresh();
  });

  // Goto block command
  const gotoCmd = vscode.commands.registerCommand('linguaCode.gotoBlock', async (filePath, line) => {
    const doc = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  });

  // CodeLens provider
  const codeLensProvider = vscode.languages.registerCodeLensProvider('*', {
    provideCodeLenses(document) {
      const lenses = [];
      const blocks = findBlocks(document);

      for (const block of blocks) {
        const range = new vscode.Range(block.startLine, 0, block.startLine, 0);

        lenses.push(new vscode.CodeLens(range, {
          title: 'Delete',
          command: 'linguaCode.deleteBlock',
          arguments: [block.startLine, block.endLine],
        }));
      }

      return lenses;
    },
  });

  // Update decorations
  function updateDecorations(editor) {
    if (!editor) return;

    const blocks = findBlocks(editor.document);
    const blockRanges = [];
    const markerRanges = [];

    for (const block of blocks) {
      const startLineEnd = editor.document.lineAt(block.startLine).text.length;
      const endLineEnd = editor.document.lineAt(block.endLine).text.length;

      blockRanges.push(new vscode.Range(block.startLine, 0, block.endLine, endLineEnd));
      markerRanges.push(new vscode.Range(block.startLine, 0, block.startLine, startLineEnd));
      markerRanges.push(new vscode.Range(block.endLine, 0, block.endLine, endLineEnd));
    }

    editor.setDecorations(blockDecorationType, blockRanges);
    editor.setDecorations(markerDecorationType, markerRanges);
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) updateDecorations(editor);
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor);
      blocksProvider.refresh();
    }
  }, null, context.subscriptions);

  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(
    insertCmd, deleteCmd, installCmd, refreshCmd, gotoCmd,
    codeLensProvider,
    blockDecorationType, markerDecorationType
  );
}

function findBlocks(document) {
  const blocks = [];
  const lineCount = document.lineCount;
  let startLine = null;

  for (let i = 0; i < lineCount; i++) {
    const trimmed = document.lineAt(i).text.trim();
    if (trimmed === '__LINGUA_CODE_TODO_START__') {
      startLine = i;
    } else if (trimmed === '__LINGUA_CODE_TODO_END__' && startLine !== null) {
      blocks.push({ startLine, endLine: i });
      startLine = null;
    }
  }

  return blocks;
}

function deactivate() { }

module.exports = { activate, deactivate };
