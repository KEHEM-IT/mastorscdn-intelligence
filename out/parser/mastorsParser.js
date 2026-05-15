"use strict";
// =============================================================================
// Mastors CDN Core intelligence
// parser/mastorsParser.ts
//
// Parses @mastorscdn/core SCSS source files and extracts:
//   • @function declarations  → type: 'function'
//   • @mixin declarations     → type: 'mixin'
//   • $variable declarations  → type: 'variable'
//
// The parser is intentionally regex-based (no Sass AST dependency) so it
// remains lightweight and can run without a full Sass compiler.
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
exports.MastorsParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const mastorsRegistry_1 = require("../registry/mastorsRegistry");
const logger_1 = require("../utils/logger");
// ── Regex patterns ────────────────────────────────────────────────────────────
/** Matches: @function name($param1, $param2: default) { */
const FN_REGEX = /^@function\s+([\w-]+)\s*\(([^)]*)\)\s*\{/gm;
/** Matches: @mixin name($param1, $param2: default) { */
const MIXIN_REGEX = /^@mixin\s+([\w-]+)\s*\(([^)]*)\)?\s*\{/gm;
/** Matches: $var-name: value !default; */
const VAR_REGEX = /^\$([\w-]+)\s*:\s*([^;!]+)(?:\s*!default)?\s*;/gm;
/** Matches: // --- comment --- or // comment */
const COMMENT_REGEX = /^\/\/\s*(?:-+\s*)?(.+?)(?:\s*-+)?\s*$/;
// ── Token value extractors ────────────────────────────────────────────────────
/** Extracts string keys from a Sass map literal: ('key': value, ...) */
const MAP_KEY_REGEX = /^\s*'([\w-]+)'\s*:/gm;
// ── Category inference ────────────────────────────────────────────────────────
const CATEGORY_MAP = {
    color: 'color',
    semantic: 'color',
    shadow: 'shadow',
    radius: 'radius',
    'border-radius': 'radius',
    z: 'z-index',
    layer: 'z-index',
    opacity: 'opacity',
    breakpoint: 'breakpoint',
    container: 'layout',
    'aspect-ratio': 'layout',
    'flex-center': 'layout',
    'absolute-center': 'layout',
    cover: 'layout',
    duration: 'motion',
    easing: 'motion',
    transition: 'motion',
    'smooth-transition': 'motion',
    'hover-lift': 'effect',
    'prefers-reduced-motion': 'motion',
    'border-width': 'border',
    rem: 'math',
    em: 'math',
    'strip-unit': 'math',
    fluid: 'typography',
    percent: 'math',
    'mastors-map-get': 'map',
    'mastors-map-merge': 'map',
    truncate: 'typography',
    'line-clamp': 'typography',
    up: 'responsive',
    down: 'responsive',
    between: 'responsive',
    only: 'responsive',
    hover: 'responsive',
    'prefers-dark': 'responsive',
    print: 'responsive',
    portrait: 'responsive',
    landscape: 'responsive',
    glassmorphism: 'effect',
    neumorphism: 'effect',
    'custom-scrollbar': 'utility',
    'focus-ring': 'utility',
    'focus-visible': 'utility',
    'loading-state': 'utility',
    'skeleton-loading': 'utility',
    'visually-hidden': 'utility',
    'visually-visible': 'utility',
    'generate-vars': 'utility',
    'generate-all-vars': 'utility',
    'generate-all-vars-if-enabled': 'utility',
};
function inferCategory(name, filePath) {
    // Explicit name mapping first
    if (CATEGORY_MAP[name])
        return CATEGORY_MAP[name];
    // Infer from file path segment
    const seg = filePath.replace(/\\/g, '/');
    if (seg.includes('/functions/')) {
        if (seg.includes('math'))
            return 'math';
        if (seg.includes('map'))
            return 'map';
        return 'utility';
    }
    if (seg.includes('/mixins/')) {
        if (seg.includes('responsive'))
            return 'responsive';
        if (seg.includes('css-vars'))
            return 'utility';
        return 'utility';
    }
    return 'utility';
}
// ── Parameter parser ──────────────────────────────────────────────────────────
function parseParams(rawParams) {
    if (!rawParams.trim())
        return [];
    return rawParams
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
        // $param-name: default-value  OR  $param-name
        const colonIdx = p.indexOf(':');
        if (colonIdx === -1) {
            return { name: p.replace(/^\$/, '').trim() };
        }
        const name = p.slice(0, colonIdx).replace(/^\$/, '').trim();
        const def = p.slice(colonIdx + 1).trim();
        return { name, default: def };
    });
}
// ── File scanner ──────────────────────────────────────────────────────────────
function scanFile(filePath) {
    let src;
    try {
        src = fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        logger_1.Logger.warn(`Cannot read: ${filePath}`);
        return [];
    }
    const results = [];
    const lines = src.split('\n');
    /** Grab the comment line immediately above lineIndex (if any). */
    function commentAbove(lineIndex) {
        if (lineIndex <= 0)
            return '';
        const above = lines[lineIndex - 1]?.trim() ?? '';
        const m = above.match(COMMENT_REGEX);
        return m ? m[1].trim() : '';
    }
    // ── Functions ──
    let m;
    FN_REGEX.lastIndex = 0;
    while ((m = FN_REGEX.exec(src)) !== null) {
        const name = m[1];
        const rawParams = m[2] ?? '';
        const lineIndex = src.slice(0, m.index).split('\n').length - 1;
        const desc = commentAbove(lineIndex) || `Returns a value from the ${name}() function.`;
        // Merge with BUILT_IN_REGISTRY entry if present (richer docs)
        const builtin = mastorsRegistry_1.BUILT_IN_REGISTRY.find((e) => e.name === name);
        results.push({
            name,
            type: 'function',
            category: inferCategory(name, filePath),
            description: builtin?.description ?? desc,
            params: builtin?.params ?? parseParams(rawParams),
            values: builtin?.values,
            returns: builtin?.returns,
            example: builtin?.example,
            snippet: builtin?.snippet,
        });
    }
    // ── Mixins ──
    MIXIN_REGEX.lastIndex = 0;
    while ((m = MIXIN_REGEX.exec(src)) !== null) {
        const name = m[1];
        const rawParams = m[2] ?? '';
        const lineIndex = src.slice(0, m.index).split('\n').length - 1;
        const desc = commentAbove(lineIndex) || `Applies the ${name} mixin.`;
        const builtin = mastorsRegistry_1.BUILT_IN_REGISTRY.find((e) => e.name === name);
        results.push({
            name,
            type: 'mixin',
            category: inferCategory(name, filePath),
            description: builtin?.description ?? desc,
            params: builtin?.params ?? parseParams(rawParams),
            values: builtin?.values,
            example: builtin?.example,
            snippet: builtin?.snippet,
        });
    }
    return results;
}
// ── Map value extractor ───────────────────────────────────────────────────────
function extractMapValues(src) {
    const keys = [];
    let m;
    MAP_KEY_REGEX.lastIndex = 0;
    while ((m = MAP_KEY_REGEX.exec(src)) !== null) {
        keys.push(m[1]);
    }
    return keys;
}
// ── Main parser class ─────────────────────────────────────────────────────────
class MastorsParser {
    /**
     * Parse all SCSS source files under `scssRoot` and return a full
     * RegistryEntry array. Falls back to BUILT_IN_REGISTRY for any entry
     * that could not be parsed from source.
     */
    async parseFromSource(scssRoot) {
        logger_1.Logger.info(`Scanning SCSS source at: ${scssRoot}`);
        const scssFiles = this._findScssFiles(scssRoot);
        logger_1.Logger.debug(`Found ${scssFiles.length} SCSS files.`);
        // Collect raw parse results
        const rawEntries = [];
        for (const file of scssFiles) {
            const found = scanFile(file);
            rawEntries.push(...found);
        }
        // Deduplicate by name (last-write wins, prefer token-accessors / helpers)
        const byName = new Map();
        for (const e of rawEntries) {
            if (e.name) {
                const existing = byName.get(e.name);
                // Prefer entries with richer descriptions/params
                if (!existing ||
                    (e.params && e.params.length > (existing.params?.length ?? 0))) {
                    byName.set(e.name, e);
                }
            }
        }
        // Also inject any token values from token files
        this._enrichWithTokenValues(scssRoot, byName);
        // Merge with BUILT_IN_REGISTRY — built-in wins for docs quality
        const merged = new Map();
        // Start from parsed (source of truth for names)
        for (const [name, raw] of byName.entries()) {
            const builtin = mastorsRegistry_1.BUILT_IN_REGISTRY.find((e) => e.name === name);
            merged.set(name, {
                name,
                type: (raw.type ?? builtin?.type ?? 'function'),
                category: (raw.category ?? builtin?.category ?? 'utility'),
                description: builtin?.description ?? raw.description ?? `${name}()`,
                params: builtin?.params ?? raw.params ?? [],
                values: builtin?.values ?? raw.values,
                returns: builtin?.returns ?? raw.returns,
                example: builtin?.example ?? raw.example,
                snippet: builtin?.snippet ?? raw.snippet,
            });
        }
        // Add any built-in entries that were NOT found in source (safety net)
        for (const builtin of mastorsRegistry_1.BUILT_IN_REGISTRY) {
            if (!merged.has(builtin.name)) {
                merged.set(builtin.name, builtin);
            }
        }
        const entries = Array.from(merged.values());
        logger_1.Logger.info(`Parser complete: ${entries.length} entries.`);
        return entries;
    }
    // ── Private helpers ─────────────────────────────────────────────────────
    _findScssFiles(root) {
        const files = [];
        const walk = (dir) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        // Skip vendor, node_modules
                        if (!['node_modules', 'vendors', 'dist'].includes(entry.name)) {
                            walk(full);
                        }
                    }
                    else if (entry.isFile() && /\.(scss|sass)$/.test(entry.name)) {
                        files.push(full);
                    }
                }
            }
            catch {
                // skip unreadable dirs
            }
        };
        walk(root);
        return files;
    }
    /**
     * Read token files and attach real key lists to matching registry entries.
     * E.g. _colors.scss → enriches color() entry with actual palette keys.
     */
    _enrichWithTokenValues(scssRoot, byName) {
        const tokenDir = path.join(scssRoot, 'tokens');
        if (!fs.existsSync(tokenDir))
            return;
        const TOKEN_FILE_MAP = {
            '_colors.scss': ['color', 'semantic'],
            '_shadows.scss': ['shadow'],
            '_radius.scss': ['radius'],
            '_zindex.scss': ['z', 'layer'],
            '_opacity.scss': ['opacity'],
            '_breakpoints.scss': ['breakpoint', 'container'],
            '_motion.scss': ['duration', 'easing', 'transition'],
            '_borders.scss': ['border-width', 'aspect-ratio'],
        };
        for (const [file, fnNames] of Object.entries(TOKEN_FILE_MAP)) {
            const filePath = path.join(tokenDir, file);
            if (!fs.existsSync(filePath))
                continue;
            try {
                const src = fs.readFileSync(filePath, 'utf-8');
                const keys = extractMapValues(src);
                if (keys.length === 0)
                    continue;
                for (const fnName of fnNames) {
                    const entry = byName.get(fnName);
                    if (entry && !entry.values) {
                        entry.values = keys;
                    }
                }
            }
            catch {
                // skip
            }
        }
    }
}
exports.MastorsParser = MastorsParser;
//# sourceMappingURL=mastorsParser.js.map