import * as vscode from 'vscode';
import type { MastorsRegistry } from '../registry/mastorsRegistry';
export declare class ScssCompletionProvider implements vscode.CompletionItemProvider {
    private _registry;
    constructor(_registry: MastorsRegistry);
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionList>;
    private _functionCompletions;
    private _toCompletionItem;
    private _defaultSnippet;
    private _buildMarkdownDoc;
    private _valueCompletions;
}
//# sourceMappingURL=scssCompletionProvider.d.ts.map