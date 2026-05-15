// =============================================================================
// Mastors CDN Core intelligence
// providers/signatureHelpProvider.ts
//
// Implements vscode.SignatureHelpProvider for SCSS/SASS files.
//
// Shows parameter hints when user types:
//   mc.color(         → signature: color($key, $fallback?)
//   mc.shadow(        → signature: shadow($key, $fallback?)
//   mc.up(            → signature: up($bp) { @content }
//   …etc. for all registry entries
//
// Retriggers on '(' and ',' to update active parameter index.
// =============================================================================

import * as vscode from 'vscode';
import type { MastorsRegistry, ParamDef } from '../registry/mastorsRegistry';
import { Logger } from '../utils/logger';

export class SignatureHelpProvider implements vscode.SignatureHelpProvider {
  constructor(private _registry: MastorsRegistry) {}

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.SignatureHelpContext
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    const lineText = document.lineAt(position).text;
    const prefix   = lineText.slice(0, position.character);
    const alias    = this._registry.resolveAlias(document.getText());

    // Pattern: alias.fnName(  — find the innermost open call
    // We walk backwards to find the matching 'alias.fnName(' still open
    const callInfo = this._findActiveCall(prefix, alias);
    if (!callInfo) return undefined;

    const { fnName, argIndex } = callInfo;
    const entry = this._registry.get(fnName);
    if (!entry || entry.params.length === 0) return undefined;

    Logger.debug(`Signature: ${alias}.${fnName} — arg ${argIndex}`);

    // ── Build SignatureInformation ─────────────────────────────────────────
    const paramLabels = entry.params.map((p) => this._paramLabel(p));
    const sigLabel    =
      entry.type === 'mixin'
        ? `@include ${alias}.${fnName}(${paramLabels.join(', ')})`
        : `${alias}.${fnName}(${paramLabels.join(', ')})`;

    const sig = new vscode.SignatureInformation(sigLabel);
    sig.documentation = new vscode.MarkdownString(entry.description);

    // ── Parameter info items ───────────────────────────────────────────────
    sig.parameters = entry.params.map((p) => {
      const pi  = new vscode.ParameterInformation(this._paramLabel(p));
      const def = p.default !== undefined ? ` *(default: \`${p.default}\`)* ` : ' ';
      const doc =
        `**\`$${p.name}\`**${p.type ? ` · \`${p.type}\`` : ''}${def}\n\n` +
        (p.description ?? '');

      pi.documentation = new vscode.MarkdownString(doc);
      return pi;
    });

    // ── Accepted values hint for first param ──────────────────────────────
    if (argIndex === 0 && entry.values && entry.values.length > 0) {
      const preview = entry.values.slice(0, 8).map((v) => `'${v}'`).join(' | ');
      const more    = entry.values.length > 8
        ? ` … (+${entry.values.length - 8} more)`
        : '';
      sig.parameters[0].documentation = new vscode.MarkdownString(
        `${sig.parameters[0].documentation instanceof vscode.MarkdownString
          ? (sig.parameters[0].documentation as vscode.MarkdownString).value
          : ''}\n\n**Accepted values:** ${preview}${more}`
      );
    }

    const help            = new vscode.SignatureHelp();
    help.signatures       = [sig];
    help.activeSignature  = 0;
    help.activeParameter  = Math.min(argIndex, entry.params.length - 1);

    return help;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Walk backwards through `prefix` to locate the most recent open
   * `alias.fnName(` call, counting commas at depth 1 for argIndex.
   */
  private _findActiveCall(
    prefix: string,
    alias: string
  ): { fnName: string; argIndex: number } | undefined {
    let depth     = 0;
    let argIndex  = 0;
    let i         = prefix.length - 1;
    let inString  = false;
    let stringChar = '';

    // Walk backwards, tracking paren depth and commas at depth 1
    while (i >= 0) {
      const ch = prefix[i];

      if (!inString) {
        if (ch === ')') {
          depth++;
        } else if (ch === '(') {
          if (depth === 0) {
            // This is our target open paren — find the function name before it
            const before = prefix.slice(0, i);
            const m = before.match(
              new RegExp(`${escapeRegex(alias)}\\.([\\.\\w-]+)$`)
            );
            if (m) {
              return { fnName: m[1], argIndex };
            }
            return undefined;
          }
          depth--;
        } else if (ch === ',' && depth === 0) {
          argIndex++;
        } else if (ch === '"' || ch === "'") {
          inString   = true;
          stringChar = ch;
        }
      } else {
        if (ch === stringChar && prefix[i - 1] !== '\\') {
          inString = false;
        }
      }

      i--;
    }

    return undefined;
  }

  /** Format a parameter for the signature label. */
  private _paramLabel(p: ParamDef): string {
    const name = `$${p.name}`;
    const type = p.type ? `: ${p.type}` : '';
    const def  = p.default !== undefined ? ` = ${p.default}` : '';
    return `${name}${type}${def}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
