"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureHelpProvider = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class SignatureHelpProvider {
    constructor(_registry) {
        this._registry = _registry;
    }
    provideSignatureHelp(document, position, _token, _context) {
        const lineText = document.lineAt(position).text;
        const prefix = lineText.slice(0, position.character);
        const alias = this._registry.resolveAlias(document.getText());
        // Pattern: alias.fnName(  — find the innermost open call
        // We walk backwards to find the matching 'alias.fnName(' still open
        const callInfo = this._findActiveCall(prefix, alias);
        if (!callInfo)
            return undefined;
        const { fnName, argIndex } = callInfo;
        const entry = this._registry.get(fnName);
        if (!entry || entry.params.length === 0)
            return undefined;
        logger_1.Logger.debug(`Signature: ${alias}.${fnName} — arg ${argIndex}`);
        // ── Build SignatureInformation ─────────────────────────────────────────
        const paramLabels = entry.params.map((p) => this._paramLabel(p));
        const sigLabel = entry.type === 'mixin'
            ? `@include ${alias}.${fnName}(${paramLabels.join(', ')})`
            : `${alias}.${fnName}(${paramLabels.join(', ')})`;
        const sig = new vscode.SignatureInformation(sigLabel);
        sig.documentation = new vscode.MarkdownString(entry.description);
        // ── Parameter info items ───────────────────────────────────────────────
        sig.parameters = entry.params.map((p) => {
            const pi = new vscode.ParameterInformation(this._paramLabel(p));
            const def = p.default !== undefined ? ` *(default: \`${p.default}\`)* ` : ' ';
            const doc = `**\`$${p.name}\`**${p.type ? ` · \`${p.type}\`` : ''}${def}\n\n` +
                (p.description ?? '');
            pi.documentation = new vscode.MarkdownString(doc);
            return pi;
        });
        // ── Accepted values hint for first param ──────────────────────────────
        if (argIndex === 0 && entry.values && entry.values.length > 0) {
            const preview = entry.values.slice(0, 8).map((v) => `'${v}'`).join(' | ');
            const more = entry.values.length > 8
                ? ` … (+${entry.values.length - 8} more)`
                : '';
            sig.parameters[0].documentation = new vscode.MarkdownString(`${sig.parameters[0].documentation instanceof vscode.MarkdownString
                ? sig.parameters[0].documentation.value
                : ''}\n\n**Accepted values:** ${preview}${more}`);
        }
        const help = new vscode.SignatureHelp();
        help.signatures = [sig];
        help.activeSignature = 0;
        help.activeParameter = Math.min(argIndex, entry.params.length - 1);
        return help;
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /**
     * Walk backwards through `prefix` to locate the most recent open
     * `alias.fnName(` call, counting commas at depth 1 for argIndex.
     */
    _findActiveCall(prefix, alias) {
        let depth = 0;
        let argIndex = 0;
        let i = prefix.length - 1;
        let inString = false;
        let stringChar = '';
        // Walk backwards, tracking paren depth and commas at depth 1
        while (i >= 0) {
            const ch = prefix[i];
            if (!inString) {
                if (ch === ')') {
                    depth++;
                }
                else if (ch === '(') {
                    if (depth === 0) {
                        // This is our target open paren — find the function name before it
                        const before = prefix.slice(0, i);
                        const m = before.match(new RegExp(`${escapeRegex(alias)}\\.([\\.\\w-]+)$`));
                        if (m) {
                            return { fnName: m[1], argIndex };
                        }
                        return undefined;
                    }
                    depth--;
                }
                else if (ch === ',' && depth === 0) {
                    argIndex++;
                }
                else if (ch === '"' || ch === "'") {
                    inString = true;
                    stringChar = ch;
                }
            }
            else {
                if (ch === stringChar && prefix[i - 1] !== '\\') {
                    inString = false;
                }
            }
            i--;
        }
        return undefined;
    }
    /** Format a parameter for the signature label. */
    _paramLabel(p) {
        const name = `$${p.name}`;
        const type = p.type ? `: ${p.type}` : '';
        const def = p.default !== undefined ? ` = ${p.default}` : '';
        return `${name}${type}${def}`;
    }
}
exports.SignatureHelpProvider = SignatureHelpProvider;
// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=signatureHelpProvider.js.map