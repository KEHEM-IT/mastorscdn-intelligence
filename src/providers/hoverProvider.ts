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

import * as vscode from 'vscode';
import type { MastorsRegistry, RegistryEntry } from '../registry/mastorsRegistry';
import { Logger } from '../utils/logger';

// Category → VS Code theme icon
const CATEGORY_ICON: Record<string, string> = {
  color:       'symbol-color',
  shadow:      'symbol-keyword',
  radius:      'symbol-ruler',
  'z-index':   'symbol-numeric',
  opacity:     'symbol-field',
  breakpoint:  'symbol-event',
  motion:      'symbol-variable',
  border:      'symbol-ruler',
  math:        'symbol-operator',
  layout:      'symbol-structure',
  responsive:  'symbol-interface',
  typography:  'symbol-text',
  effect:      'symbol-constructor',
  utility:     'symbol-misc',
  map:         'symbol-array',
  placeholder: 'symbol-class',
};

export class HoverProvider implements vscode.HoverProvider {
  constructor(private _registry: MastorsRegistry) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const lineText  = document.lineAt(position).text;
    const docText   = document.getText();
    const alias     = this._registry.resolveAlias(docText);
    const charPos   = position.character;

    // ── 1. Try to find "alias.fnName" under cursor ────────────────────────
    // Walk left/right from cursor to extract the token
    const wordRange = this._getWordRangeAtPosition(lineText, charPos, alias);
    if (!wordRange) {
      // 1b. Try @extend %mastors-placeholder hover
      const extendMatch = lineText.match(/@extend\s+%(mastors-[\w-]+)/);
      if (extendMatch) {
        const pctIdx    = lineText.indexOf('%' + extendMatch[1]);
        const nameStart = pctIdx + 1;
        const nameEnd   = nameStart + extendMatch[1].length;
        if (charPos >= pctIdx && charPos <= nameEnd) {
          const entry = this._registry.get(extendMatch[1]);
          if (entry) {
            const vsRange = new vscode.Range(
              position.line, pctIdx,
              position.line, nameEnd
            );
            return new vscode.Hover(
              this._buildHoverContent(entry, alias, undefined),
              vsRange
            );
          }
        }
      }
      return undefined;
    }

    const { fnName, range } = wordRange;
    const entry = this._registry.get(fnName);
    if (!entry) return undefined;

    Logger.debug(`Hover: ${alias}.${fnName}`);

    // ── 2. Try to extract the current value argument for extra info ────────
    // Pattern: alias.fnName('value')
    const valueMatch = lineText.match(
      new RegExp(`${escapeRegex(alias)}\\.${escapeRegex(fnName)}\\s*\\(\\s*['"]([^'"]+)['"]`)
    );
    const currentValue = valueMatch ? valueMatch[1] : undefined;

    const vsRange = new vscode.Range(
      position.line, range.start,
      position.line, range.end
    );

    return new vscode.Hover(
      this._buildHoverContent(entry, alias, currentValue),
      vsRange
    );
  }

  // ── Hover markdown builder ────────────────────────────────────────────────

  private _buildHoverContent(
    entry: RegistryEntry,
    alias: string,
    currentValue?: string
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted         = true;
    md.supportThemeIcons = true;

    const icon   = CATEGORY_ICON[entry.category] ?? 'symbol-misc';
    const prefix = entry.type === 'mixin' ? '@include ' : '';

    // ── Title ──
    md.appendMarkdown(
      `### $(${icon}) \`${prefix}${alias}.${entry.name}()\`\n\n`
    );

    // ── Category badge ──
    md.appendMarkdown(
      `$(tag) **${entry.type}** · $(folder) **${entry.category}**\n\n`
    );

    // ── Description ──
    md.appendMarkdown(`${entry.description}\n\n`);

    // ── Current value highlight ──────────────────────────────────────────
    if (currentValue && entry.values) {
      if (entry.values.includes(currentValue)) {
        md.appendMarkdown(`> 🎯 Current value: \`'${currentValue}'\`\n\n`);
      } else {
        md.appendMarkdown(
          `> ⚠️ \`'${currentValue}'\` is not a recognised token key.\n\n`
        );
      }
    }

    // ── Parameters ──
    if (entry.params.length > 0) {
      md.appendMarkdown('**Parameters**\n\n');
      for (const p of entry.params) {
        const type    = p.type    ? ` \`${p.type}\``          : '';
        const def     = p.default !== undefined ? ` *(default: \`${p.default}\`)* ` : ' ';
        const desc    = p.description ? `— ${p.description}` : '';
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

  private _getWordRangeAtPosition(
    lineText: string,
    charPos: number,
    alias: string
  ): { fnName: string; range: { start: number; end: number } } | undefined {
    // Scan all "alias.something" occurrences in the line
    const pattern = new RegExp(
      `${escapeRegex(alias)}\\.([\\.\\w-]+)`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
      const start = match.index;
      const end   = match.index + match[0].length;

      // Check if cursor is within this match
      if (charPos >= start && charPos <= end) {
        return {
          fnName: match[1],
          range:  { start, end },
        };
      }
    }

    return undefined;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
