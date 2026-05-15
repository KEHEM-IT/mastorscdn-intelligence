import * as vscode from 'vscode';
import type { MastorsRegistry } from '../registry/mastorsRegistry';
export declare class HoverProvider implements vscode.HoverProvider {
    private _registry;
    constructor(_registry: MastorsRegistry);
    provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover>;
    private _buildHoverContent;
    private _getWordRangeAtPosition;
}
//# sourceMappingURL=hoverProvider.d.ts.map