// =============================================================================
// Mastors CDN Core intelligence
// extension.ts — Activation entry point
// =============================================================================

import * as vscode from 'vscode';
import { MastorsRegistry } from './registry/mastorsRegistry';
import { ScssCompletionProvider } from './providers/scssCompletionProvider';
import { HoverProvider } from './providers/hoverProvider';
import { SignatureHelpProvider } from './providers/signatureHelpProvider';
import { Logger } from './utils/logger';

// Singleton registry — shared across all providers
let registry: MastorsRegistry | undefined;

/** Language selectors that Mastors intelligence activates on */
const LANG_SELECTORS: vscode.DocumentSelector = [
  { language: 'scss', scheme: 'file' },
  { language: 'sass', scheme: 'file' },
  { language: 'css',  scheme: 'file' },
  // Untitled / in-memory buffers (useful in scratchpads)
  { language: 'scss', scheme: 'untitled' },
  { language: 'sass', scheme: 'untitled' },
];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('mastorsintelligence');

  if (!config.get<boolean>('enable', true)) {
    Logger.info('Mastors intelligence is disabled via configuration.');
    return;
  }

  Logger.info('Mastors CDN Core intelligence activating...');

  // ── 1. Initialise registry (lazy, cached) ────────────────────────────────
  registry = new MastorsRegistry(context);

  // Initialise in background — providers degrade gracefully during load
  registry.initialise().then(() => {
    Logger.info(`Registry loaded: ${registry!.size()} entries.`);
    vscode.window.setStatusBarMessage('$(zap) Mastors intelligence ready', 3000);
  }).catch((err: unknown) => {
    Logger.error('Registry initialisation failed', err);
  });

  // ── 2. Register completion provider ──────────────────────────────────────
  // Trigger characters:
  //   '.'  → after "mc."
  //   '('  → after "mc.color("
  //   "'"  → inside string params like mc.color('|')
  //   '"'  → inside double-quoted params
  const completionProvider = new ScssCompletionProvider(registry);
  const completionDisposable = vscode.languages.registerCompletionItemProvider(
    LANG_SELECTORS,
    completionProvider,
    '.',  // mc.  → show function list
    '(',  // mc.color(  → show values
    "'",  // mc.color('  → show values
    '"'   // mc.color("  → show values
  );

  // ── 3. Register hover provider ────────────────────────────────────────────
  const hoverProvider = new HoverProvider(registry);
  const hoverDisposable = vscode.languages.registerHoverProvider(
    LANG_SELECTORS,
    hoverProvider
  );

  // ── 4. Register signature help provider ──────────────────────────────────
  const signatureProvider = new SignatureHelpProvider(registry);
  const signatureDisposable = vscode.languages.registerSignatureHelpProvider(
    LANG_SELECTORS,
    signatureProvider,
    '(',  // retrigger on open paren
    ','   // retrigger on comma
  );

  // ── 5. Commands ───────────────────────────────────────────────────────────
  const refreshCommand = vscode.commands.registerCommand(
    'mastorsintelligence.refreshRegistry',
    async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Mastors: Refreshing registry...',
          cancellable: false,
        },
        async () => {
          await registry?.refresh();
          vscode.window.showInformationMessage(
            `✅ Mastors registry refreshed (${registry?.size()} entries).`
          );
        }
      );
    }
  );

  const showRegistryCommand = vscode.commands.registerCommand(
    'mastorsintelligence.showRegistry',
    async () => {
      const entries = registry?.getAllEntries() ?? [];
      if (entries.length === 0) {
        vscode.window.showWarningMessage('Mastors registry is empty or not yet loaded.');
        return;
      }
      const items = entries.map((e) => ({
        label: `$(${e.type === 'mixin' ? 'symbol-module' : 'symbol-function'}) ${e.name}`,
        detail: e.category,
        description: e.description.slice(0, 80),
      }));
      const picked = await vscode.window.showQuickPick(items, {
        title: `Mastors CDN — Function Registry (${entries.length} entries)`,
        placeHolder: 'Search functions, mixins, variables...',
        matchOnDetail: true,
        matchOnDescription: true,
      });
      if (picked) {
        const label = picked.label.replace(/^\$\([\w-]+\)\s+/, '');
        const entry = entries.find((e) => e.name === label);
        if (entry) {
          showEntryWebview(context, entry);
        }
      }
    }
  );

  const clearCacheCommand = vscode.commands.registerCommand(
    'mastorsintelligence.clearCache',
    async () => {
      await registry?.clearCache();
      vscode.window.showInformationMessage('🗑️ Mastors cache cleared.');
    }
  );

  const generateRegistryCommand = vscode.commands.registerCommand(
    'mastorsintelligence.generateRegistry',
    async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Mastors: Generating registry JSON...',
          cancellable: false,
        },
        async () => {
          const path = await registry?.generateRegistryJson(context);
          if (path) {
            vscode.window.showInformationMessage(
              `✅ Registry JSON written to: ${path}`,
              'Open File'
            ).then((action) => {
              if (action === 'Open File') {
                vscode.workspace.openTextDocument(path).then(doc => {
                  vscode.window.showTextDocument(doc);
                });
              }
            });
          } else {
            vscode.window.showErrorMessage('Failed to generate registry JSON.');
          }
        }
      );
    }
  );

  // ── 6. Watch scss/sass/css file changes to detect alias changes ───────────
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{scss,sass,css}');
  watcher.onDidChange(() => registry?.invalidateAlias());
  watcher.onDidCreate(() => registry?.invalidateAlias());

  // ── 7. Configuration change handler ──────────────────────────────────────
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('mastorsintelligence')) {
      Logger.info('Configuration changed — refreshing registry...');
      registry?.refresh().catch((err: unknown) => Logger.error('Refresh failed', err));
    }
  });

  // ── 8. Dispose on deactivation ───────────────────────────────────────────
  context.subscriptions.push(
    completionDisposable,
    hoverDisposable,
    signatureDisposable,
    refreshCommand,
    showRegistryCommand,
    clearCacheCommand,
    generateRegistryCommand,
    watcher,
    configWatcher
  );

  Logger.info('Mastors CDN Core intelligence activation complete.');
}

export function deactivate(): void {
  registry = undefined;
  Logger.dispose();
  Logger.info('Mastors CDN Core intelligence deactivated.');
}

// ── Webview helper ─────────────────────────────────────────────────────────
function showEntryWebview(
  context: vscode.ExtensionContext,
  entry: import('./registry/mastorsRegistry').RegistryEntry
): void {
  const panel = vscode.window.createWebviewPanel(
    'mastorsEntry',
    `Mastors: ${entry.name}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  const paramsHtml = entry.params
    .map(
      (p) =>
        `<tr>
          <td><code>$${p.name}</code></td>
          <td>${p.type ?? '<em>any</em>'}</td>
          <td>${p.default !== undefined ? `<code>${escapeHtml(p.default)}</code>` : '—'}</td>
          <td>${escapeHtml(p.description ?? '')}</td>
        </tr>`
    )
    .join('');

  const valuesHtml =
    entry.values && entry.values.length > 0
      ? `<h3>Accepted values</h3>
         <div class="values">${entry.values.map((v) => `<span class="value">'${escapeHtml(v)}'</span>`).join('')}</div>`
      : '';

  const exampleHtml = entry.example
    ? `<h3>Example</h3><div class="example">${escapeHtml(entry.example)}</div>`
    : '';

  const isMixin = entry.type === 'mixin';
  const titlePrefix = isMixin ? '@include ' : '';

  panel.webview.html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${entry.name}</title>
  <style>
    :root { --radius: 6px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-editor-font-family, -apple-system, sans-serif);
      font-size: 14px;
      line-height: 1.6;
      padding: 28px 32px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      max-width: 800px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--vscode-textLink-foreground);
      margin-bottom: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    h3 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin: 20px 0 8px;
    }
    p { margin: 10px 0; color: var(--vscode-editor-foreground); }
    code {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
    }
    .badges { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .badge.type { background: var(--vscode-textLink-foreground); color: #fff; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 8px;
      font-size: 13px;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.1));
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .values { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .value {
      display: inline-block;
      padding: 3px 8px;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    .example {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      padding: 14px 16px;
      border-radius: var(--radius);
      margin-top: 8px;
      white-space: pre;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      border-left: 3px solid var(--vscode-textLink-foreground);
      overflow-x: auto;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      margin: 20px 0;
    }
    .returns {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1>${titlePrefix}${escapeHtml(entry.name)}()</h1>
  <div class="badges">
    <span class="badge type">${entry.type}</span>
    <span class="badge">${entry.category}</span>
  </div>
  <p>${escapeHtml(entry.description)}</p>
  <hr class="divider" />
  ${entry.params.length > 0 ? `
    <h3>Parameters</h3>
    <table>
      <thead>
        <tr><th>Name</th><th>Type</th><th>Default</th><th>Description</th></tr>
      </thead>
      <tbody>${paramsHtml}</tbody>
    </table>` : ''}
  ${entry.returns ? `
    <h3>Returns</h3>
    <div class="returns"><code>${escapeHtml(entry.returns)}</code></div>` : ''}
  ${valuesHtml}
  ${exampleHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
