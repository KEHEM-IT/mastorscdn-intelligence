import * as vscode from 'vscode';
import type { MastorsRegistry } from '../registry/mastorsRegistry';
export declare class SignatureHelpProvider implements vscode.SignatureHelpProvider {
    private _registry;
    constructor(_registry: MastorsRegistry);
    provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.SignatureHelpContext): vscode.ProviderResult<vscode.SignatureHelp>;
    /**
     * Walk backwards through `prefix` to locate the most recent open
     * `alias.fnName(` call, counting commas at depth 1 for argIndex.
     */
    private _findActiveCall;
    /** Format a parameter for the signature label. */
    private _paramLabel;
}
//# sourceMappingURL=signatureHelpProvider.d.ts.map