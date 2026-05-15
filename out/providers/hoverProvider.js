"use strict";
// =============================================================================
// Mastors CDN Core intelligence
// providers/hoverProvider.ts
//
// Implements vscode.HoverProvider for SCSS/SASS files.
//
// Hover triggers:
//   • mc.functionName    → shows full docs for that function/mixin
//   • mc.color('primary')→ shows the hex value of the token
//
// Alias detection reads the @use line at the top of the active file.
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
exports.HoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
// Category → VS Code theme icon
const CATEGORY_ICON = {
    color: 'symbol-color',
    shadow: 'symbol-keyword',
    radius: 'symbol-ruler',
    'z-index': 'symbol-numeric',
    opacity: 'symbol-field',
    breakpoint: 'symbol-event',
    motion: 'symbol-variable',
    border: 'symbol-ruler',
    math: 'symbol-operator',
    layout: 'symbol-structure',
    responsive: 'symbol-interface',
    typography: 'symbol-text',
    effect: 'symbol-constructor',
    utility: 'symbol-misc',
    map: 'symbol-array',
};
class HoverProvider {
    constructor(_registry) {
        this._registry = _registry;
    }
    provideHover(document, position, _token) {
        const lineText = document.lineAt(position).text;
        const docText = document.getText();
        const alias = this._registry.resolveAlias(docText);
        const charPos = position.character;
        // ── 1. Try to find "alias.fnName" under cursor ────────────────────────
        // Walk left/right from cursor to extract the token
        const wordRange = this._getWordRangeAtPosition(lineText, charPos, alias);
        if (!wordRange)
            return undefined;
        const { fnName, range } = wordRange;
        const entry = this._registry.get(fnName);
        if (!entry)
            return undefined;
        logger_1.Logger.debug(`Hover: ${alias}.${fnName}`);
        // ── 2. Try to extract the current value argument for extra info ────────
        // Pattern: alias.fnName('value')
        const valueMatch = lineText.match(new RegExp(`${escapeRegex(alias)}\\.${escapeRegex(fnName)}\\s*\\(\\s*['"]([^'"]+)['"]`));
        const currentValue = valueMatch ? valueMatch[1] : undefined;
        const vsRange = new vscode.Range(position.line, range.start, position.line, range.end);
        return new vscode.Hover(this._buildHoverContent(entry, alias, currentValue), vsRange);
    }
    // ── Hover markdown builder ────────────────────────────────────────────────
    _buildHoverContent(entry, alias, currentValue) {
        const md = new vscode.MarkdownString('', true);
        md.isTrusted = true;
        md.supportThemeIcons = true;
        const icon = CATEGORY_ICON[entry.category] ?? 'symbol-misc';
        const prefix = entry.type === 'mixin' ? '@include ' : '';
        // ── Title ──
        md.appendMarkdown(`### $(${icon}) \`${prefix}${alias}.${entry.name}()\`\n\n`);
        // ── Category badge ──
        md.appendMarkdown(`$(tag) **${entry.type}** · $(folder) **${entry.category}**\n\n`);
        // ── Description ──
        md.appendMarkdown(`${entry.description}\n\n`);
        // ── Current value highlight ──────────────────────────────────────────
        if (currentValue && entry.values) {
            if (entry.values.includes(currentValue)) {
                md.appendMarkdown(`> 🎯 Current value: \`'${currentValue}'\`\n\n`);
            }
            else {
                md.appendMarkdown(`> ⚠️ \`'${currentValue}'\` is not a recognised token key.\n\n`);
            }
        }
        // ── Parameters ──
        if (entry.params.length > 0) {
            md.appendMarkdown('**Parameters**\n\n');
            for (const p of entry.params) {
                const type = p.type ? ` \`${p.type}\`` : '';
                const def = p.default !== undefined ? ` *(default: \`${p.default}\`)* ` : ' ';
                const desc = p.description ? `— ${p.description}` : '';
                md.appendMarkdown(`- \`$${p.name}\`${type}${def}${desc}\n`);
            }
            md.appendMarkdown('\n');
        }
        // ── Returns ──
        if (entry.returns) {
            md.appendMarkdown(`**Returns** \`${entry.returns}\`\n\n`);
        }
        // ── Accepted values (compact) ──
        if (entry.values && entry.values.length > 0) {
            const preview = entry.values
                .slice(0, 10)
                .map((v) => `\`'${v}'\``)
                .join(' ');
            const more = entry.values.length > 10
                ? ` *(+${entry.values.length - 10} more)*`
                : '';
            md.appendMarkdown(`**Values** ${preview}${more}\n\n`);
        }
        // ── Example ──
        if (entry.example) {
            md.appendMarkdown('**Example**\n\n');
            md.appendCodeblock(entry.example, 'scss');
        }
        return md;
    }
    // ── Extract "fnName" from "alias.fnName" under cursor ─────────────────────
    _getWordRangeAtPosition(lineText, charPos, alias) {
        // Scan all "alias.something" occurrences in the line
        const pattern = new RegExp(`${escapeRegex(alias)}\\.([\\.\\w-]+)`, 'g');
        let match;
        while ((match = pattern.exec(lineText)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;
            // Check if cursor is within this match
            if (charPos >= start && charPos <= end) {
                return {
                    fnName: match[1],
                    range: { start, end },
                };
            }
        }
        return undefined;
    }
}
exports.HoverProvider = HoverProvider;
// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=hoverProvider.js.map