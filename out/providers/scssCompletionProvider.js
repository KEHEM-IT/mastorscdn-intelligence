"use strict";
// =============================================================================
// Mastors CDN Core IntelliSense
// providers/scssCompletionProvider.ts
//
// Implements vscode.CompletionItemProvider for SCSS/SASS files.
//
// Trigger flow:
//   1. User types "mc."       → show all function/mixin completions
//   2. User types "mc.color(" → show value completions for that function
//   3. User types "mc.up("    → show breakpoint values
//
// Alias detection: reads the @use line at the top of the active file and
// adapts the prefix accordingly (e.g. "mcore." instead of "mc.").
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
exports.ScssCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
const fuzzy_1 = require("../utils/fuzzy");
const logger_1 = require("../utils/logger");
// Category → VS Code icon
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
// Category sort order (lower = first)
const CATEGORY_ORDER = {
    color: 0, shadow: 1, radius: 2, 'z-index': 3, opacity: 4,
    breakpoint: 5, motion: 6, border: 7, typography: 8, layout: 9,
    responsive: 10, effect: 11, utility: 12, math: 13, map: 14,
};
class ScssCompletionProvider {
    constructor(_registry) {
        this._registry = _registry;
    }
    provideCompletionItems(document, position, _token, _context) {
        const lineText = document.lineAt(position).text;
        const prefix = lineText.slice(0, position.character);
        // Resolve the alias used in this file (e.g. 'mc', 'mcore')
        const alias = this._registry.resolveAlias(document.getText());
        const cfg = vscode.workspace.getConfiguration('mastorsIntellisense');
        const fuzzy = cfg.get('enableFuzzySearch', true);
        // ── Case 1: mc.functionName('|') — value completions ─────────────────
        // Pattern: alias.fnName('  or  alias.fnName("
        const valueMatch = prefix.match(new RegExp(`${escapeRegex(alias)}\\.([\\w-]+)\\s*\\(\\s*['"]([^'"]*)$`));
        if (valueMatch) {
            const fnName = valueMatch[1];
            const partialValue = valueMatch[2];
            return this._valueCompletions(fnName, partialValue, position);
        }
        // ── Case 2: mc. — function/mixin completions ──────────────────────────
        // Match: alias. followed by optional partial function name
        const dotMatch = prefix.match(new RegExp(`${escapeRegex(alias)}\\.(\\S*)$`));
        if (dotMatch) {
            const partial = dotMatch[1]; // what has been typed after the dot
            // The range that should be replaced: from just after the dot to the cursor
            // e.g. if user typed "mc.sha", we want to replace "sha" with the completion
            const dotIndex = prefix.lastIndexOf(`${alias}.`);
            const replaceStart = dotIndex + alias.length + 1; // position after the dot
            const replaceRange = new vscode.Range(position.line, replaceStart, position.line, position.character);
            return this._functionCompletions(partial, alias, fuzzy, position, replaceRange);
        }
        // ── Case 3: @include mc — mixin completions (no dot yet) ─────────────
        const includeMatch = prefix.match(new RegExp(`@include\\s+${escapeRegex(alias)}\\.(\\S*)$`));
        if (includeMatch) {
            const partial = includeMatch[1];
            const dotIndex = prefix.lastIndexOf(`${alias}.`);
            const replaceStart = dotIndex + alias.length + 1;
            const replaceRange = new vscode.Range(position.line, replaceStart, position.line, position.character);
            return this._functionCompletions(partial, alias, fuzzy, position, replaceRange, 'mixin');
        }
        return undefined;
    }
    // ── Function / Mixin completions ─────────────────────────────────────────
    _functionCompletions(partial, alias, fuzzy, position, replaceRange, typeFilter) {
        let entries = this._registry.getAllEntries();
        if (typeFilter) {
            entries = entries.filter((e) => e.type === typeFilter);
        }
        // Rebuild Fuse index if needed
        (0, fuzzy_1.buildFuseIndex)(entries);
        const matched = partial.length > 0 && fuzzy
            ? (0, fuzzy_1.fuzzySearch)(partial, entries)
            : partial.length > 0
                ? entries.filter((e) => e.name.toLowerCase().startsWith(partial.toLowerCase()))
                : entries; // show ALL entries when nothing typed after dot
        const items = matched.map((entry, idx) => this._toCompletionItem(entry, alias, idx, replaceRange));
        // Sort by category order, then alphabetically
        items.sort((a, b) => {
            const oa = CATEGORY_ORDER[a.detail ?? ''] ?? 99;
            const ob = CATEGORY_ORDER[b.detail ?? ''] ?? 99;
            if (oa !== ob)
                return oa - ob;
            return (typeof a.label === 'string' ? a.label : a.label.label)
                .localeCompare(typeof b.label === 'string' ? b.label : b.label.label);
        });
        logger_1.Logger.debug(`Completion: partial="${partial}" → ${items.length} items`);
        return new vscode.CompletionList(items, false);
    }
    _toCompletionItem(entry, alias, sortIdx, replaceRange) {
        const isMixin = entry.type === 'mixin';
        const kind = isMixin
            ? vscode.CompletionItemKind.Module
            : vscode.CompletionItemKind.Function;
        const item = new vscode.CompletionItem(entry.name, kind);
        // Icon via label object (VS Code 1.79+)
        item.label = {
            label: entry.name,
            description: entry.category,
        };
        item.detail = entry.category;
        item.documentation = this._buildMarkdownDoc(entry);
        // Build the snippet text — only the function name + args, NOT the alias prefix.
        // The alias + dot are already in the document; we only replace what comes AFTER the dot.
        const snippetBody = entry.snippet ?? this._defaultSnippet(entry);
        let insertSnippet;
        if (isMixin) {
            // For mixins the snippet may contain the body block e.g. "up('${1|sm|}') {\n  ${0}\n}"
            insertSnippet = snippetBody;
        }
        else {
            // For functions: name(args) — but don't duplicate the name if snippet already includes it
            if (snippetBody.startsWith(entry.name + '(')) {
                insertSnippet = snippetBody;
            }
            else {
                insertSnippet = `${entry.name}(${snippetBody})`;
            }
        }
        item.insertText = new vscode.SnippetString(insertSnippet);
        // KEY FIX: tell VS Code exactly which range to replace.
        // This prevents "mc.mc.shadow()" double-insertion bugs.
        item.range = replaceRange;
        // filterText must equal the entry name so VS Code keeps showing the item
        // while the user types more characters after the dot.
        item.filterText = entry.name;
        item.sortText = String(CATEGORY_ORDER[entry.category] ?? 99)
            .padStart(2, '0') + entry.name;
        // Commit characters — pressing '(' auto-accepts for functions
        item.commitCharacters = isMixin ? [] : ['('];
        return item;
    }
    _defaultSnippet(entry) {
        if (entry.params.length === 0)
            return '';
        if (entry.values && entry.values.length > 0) {
            const choices = entry.values.slice(0, 20).join(',');
            return `'\${1|${choices}|}'`;
        }
        const parts = entry.params.map((p, i) => `\${${i + 1}:${p.name}}`);
        return parts.join(', ');
    }
    _buildMarkdownDoc(entry) {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;
        // Header
        md.appendMarkdown(`### $(${CATEGORY_ICON[entry.category] ?? 'symbol-misc'}) \`${entry.type === 'mixin' ? '@include ' : ''}${entry.name}()\`\n\n`);
        md.appendMarkdown(`${entry.description}\n\n`);
        // Params
        if (entry.params.length > 0) {
            md.appendMarkdown('**Parameters:**\n\n');
            for (const p of entry.params) {
                const def = p.default !== undefined ? ` *(default: \`${p.default}\`)* ` : '';
                const type = p.type ? ` \`${p.type}\`` : '';
                md.appendMarkdown(`- \`$${p.name}\`${type}${def} — ${p.description ?? ''}\n`);
            }
            md.appendMarkdown('\n');
        }
        // Returns
        if (entry.returns) {
            md.appendMarkdown(`**Returns:** \`${entry.returns}\`\n\n`);
        }
        // Accepted values
        if (entry.values && entry.values.length > 0) {
            const preview = entry.values.slice(0, 12).map((v) => `\`'${v}'\``).join(' ');
            const more = entry.values.length > 12 ? ` *(+${entry.values.length - 12} more)*` : '';
            md.appendMarkdown(`**Values:** ${preview}${more}\n\n`);
        }
        // Example
        if (entry.example) {
            md.appendMarkdown('**Example:**\n');
            md.appendCodeblock(entry.example, 'scss');
        }
        return md;
    }
    // ── Value completions (inside string argument) ────────────────────────────
    _valueCompletions(fnName, partial, position) {
        const entry = this._registry.get(fnName);
        if (!entry?.values)
            return undefined;
        const values = partial.length > 0
            ? entry.values.filter((v) => v.startsWith(partial))
            : entry.values;
        // Replace the partial text already typed inside the quotes
        const lineText = position.character > 0 ? '' : ''; // unused but kept for clarity
        const replaceRange = new vscode.Range(position.line, position.character - partial.length, position.line, position.character);
        const items = values.map((val, idx) => {
            const item = new vscode.CompletionItem(val, vscode.CompletionItemKind.EnumMember);
            item.insertText = val;
            item.range = replaceRange;
            item.detail = `${fnName}() value`;
            item.sortText = String(idx).padStart(4, '0');
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`Token value for \`${fnName}('${val}')\``);
            item.documentation = md;
            return item;
        });
        return new vscode.CompletionList(items, false);
    }
}
exports.ScssCompletionProvider = ScssCompletionProvider;
// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=scssCompletionProvider.js.map