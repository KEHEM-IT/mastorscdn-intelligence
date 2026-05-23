"use strict";
// =============================================================================
// Mastors CDN Core intelligence
// registry/mastorsRegistry.ts -- Central data store + cache manager
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
exports.BUILT_IN_REGISTRY = exports.MastorsRegistry = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const mastorsParser_1 = require("../parser/mastorsParser");
const logger_1 = require("../utils/logger");
// -- Cache filename stored beside the workspace --------------------------------
const CACHE_FILE = '.mastors-cache.json';
const REGISTRY_VERSION = '1.0.0';
// -- Registry class ------------------------------------------------------------
class MastorsRegistry {
    constructor(context) {
        this._entries = new Map();
        this._initialised = false;
        this._initialising = false;
        /** Currently detected alias (defaults to 'mc') */
        this._alias = 'mc';
        this._aliasValid = false;
        this._context = context;
        this._parser = new mastorsParser_1.MastorsParser();
    }
    // -- Public API -------------------------------------------------------------
    async initialise() {
        if (this._initialised || this._initialising)
            return;
        this._initialising = true;
        try {
            const config = vscode.workspace.getConfiguration('mastorsintelligence');
            const useCache = config.get('cacheEnabled', true);
            // 1. Try loading from disk cache first (fast path)
            if (useCache) {
                const cached = await this._loadCache();
                if (cached) {
                    this._populateMap(cached.entries);
                    this._initialised = true;
                    logger_1.Logger.info(`Registry loaded from cache (${this._entries.size} entries).`);
                    return;
                }
            }
            // 2. Parse source files
            await this._parseAndBuild();
            this._initialised = true;
        }
        finally {
            this._initialising = false;
        }
    }
    async refresh() {
        this._entries.clear();
        this._initialised = false;
        this._initialising = false;
        await this.clearCache();
        await this.initialise();
    }
    async clearCache() {
        const cachePath = this._cachePath();
        if (cachePath && fs.existsSync(cachePath)) {
            try {
                fs.unlinkSync(cachePath);
                logger_1.Logger.info('Cache cleared.');
            }
            catch (err) {
                logger_1.Logger.warn(`Could not delete cache: ${err}`);
            }
        }
    }
    async generateRegistryJson(context) {
        const entries = this.getAllEntries();
        const registry = {
            version: REGISTRY_VERSION,
            generatedAt: new Date().toISOString(),
            entries,
        };
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const outDir = workspaceFolders?.[0]?.uri.fsPath ?? context.extensionPath;
        const outPath = path.join(outDir, 'mastors-registry.generated.json');
        try {
            fs.writeFileSync(outPath, JSON.stringify(registry, null, 2), 'utf-8');
            logger_1.Logger.info(`Generated registry JSON: ${outPath}`);
            return outPath;
        }
        catch (err) {
            logger_1.Logger.error('Failed to generate registry JSON', err);
            return null;
        }
    }
    getAllEntries() {
        return Array.from(this._entries.values()).sort((a, b) => {
            const catCmp = a.category.localeCompare(b.category);
            return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
        });
    }
    getByCategory(category) {
        return this.getAllEntries().filter((e) => e.category === category);
    }
    get(name) {
        return this._entries.get(name);
    }
    size() {
        return this._entries.size;
    }
    get isReady() {
        return this._initialised;
    }
    get alias() {
        return this._alias;
    }
    invalidateAlias() {
        this._aliasValid = false;
    }
    resolveAlias(documentText) {
        if (this._aliasValid)
            return this._alias;
        const match = documentText.match(/@use\s+['"]@mastorscdn\/core['"]\s+as\s+([a-zA-Z_][\w-]*)\s*;/);
        if (match) {
            this._alias = match[1];
        }
        else {
            this._alias = 'mc';
        }
        this._aliasValid = true;
        logger_1.Logger.debug(`Alias resolved: "${this._alias}"`);
        return this._alias;
    }
    // -- Private helpers --------------------------------------------------------
    async _parseAndBuild() {
        logger_1.Logger.info('Parsing Mastors Core source files...');
        const corePath = this._resolveCorePath();
        let entries;
        if (corePath) {
            logger_1.Logger.info(`Found @mastorscdn/core at: ${corePath}`);
            entries = await this._parser.parseFromSource(corePath);
        }
        else {
            logger_1.Logger.info('No @mastorscdn/core source found -- using built-in registry.');
            entries = exports.BUILT_IN_REGISTRY;
        }
        this._populateMap(entries);
        const config = vscode.workspace.getConfiguration('mastorsintelligence');
        if (config.get('cacheEnabled', true)) {
            await this._saveCache(entries);
        }
        logger_1.Logger.info(`Registry built: ${this._entries.size} entries.`);
    }
    _populateMap(entries) {
        this._entries.clear();
        for (const entry of entries) {
            this._entries.set(entry.name, entry);
        }
    }
    _resolveCorePath() {
        const config = vscode.workspace.getConfiguration('mastorsintelligence');
        // 1. Custom override
        const customPath = config.get('corePackagePath', '').trim();
        if (customPath && fs.existsSync(customPath)) {
            logger_1.Logger.debug(`Using custom corePackagePath: ${customPath}`);
            return customPath;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        // 2. node_modules scan
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const candidate = path.join(folder.uri.fsPath, 'node_modules', '@mastorscdn', 'core', 'scss');
                if (fs.existsSync(candidate)) {
                    logger_1.Logger.debug(`Found in node_modules: ${candidate}`);
                    return candidate;
                }
            }
        }
        // 3. Additional scan path from settings
        const scanPath = config.get('scanWorkspacePath', '').trim();
        if (scanPath && fs.existsSync(scanPath)) {
            logger_1.Logger.debug(`Using scanWorkspacePath: ${scanPath}`);
            return scanPath;
        }
        // 4. Sibling "Mastors Core\scss" directory -- monorepo layout
        const extensionDir = this._context.extensionPath;
        const siblingCandidates = [
            path.resolve(extensionDir, '..', '..', 'Mastors Core', 'scss'),
            path.resolve(extensionDir, '..', 'Mastors Core', 'scss'),
        ];
        for (const candidate of siblingCandidates) {
            if (fs.existsSync(candidate)) {
                logger_1.Logger.debug(`Found sibling Mastors Core: ${candidate}`);
                return candidate;
            }
        }
        return null;
    }
    _cachePath() {
        // Always store cache in the extension's global storage directory (~/.vscode/...
        // extensions/<id>/globalStorage/) — never in the user's workspace/project folder.
        return path.join(this._context.globalStorageUri.fsPath, CACHE_FILE);
    }
    async _loadCache() {
        const cachePath = this._cachePath();
        if (!cachePath || !fs.existsSync(cachePath))
            return null;
        try {
            const raw = fs.readFileSync(cachePath, 'utf-8');
            const data = JSON.parse(raw);
            if (data.version !== REGISTRY_VERSION) {
                logger_1.Logger.info('Cache version mismatch -- rebuilding.');
                return null;
            }
            return data;
        }
        catch {
            logger_1.Logger.warn('Cache read failed -- rebuilding.');
            return null;
        }
    }
    async _saveCache(entries) {
        const cachePath = this._cachePath();
        if (!cachePath)
            return;
        const registry = {
            version: REGISTRY_VERSION,
            generatedAt: new Date().toISOString(),
            entries,
        };
        try {
            const dir = path.dirname(cachePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(cachePath, JSON.stringify(registry, null, 2), 'utf-8');
            logger_1.Logger.info(`Registry cached to: ${cachePath}`);
        }
        catch (err) {
            logger_1.Logger.warn(`Failed to write cache: ${err}`);
        }
    }
}
exports.MastorsRegistry = MastorsRegistry;
// =============================================================================
// BUILT-IN REGISTRY
// Derived verbatim from D:\Web\Mastors CDN\Mastors Core\scss source files.
// Every token value list, function signature, and mixin signature is synced
// exactly with the actual SCSS source so completions are always accurate.
//
// SNIPPET CONVENTION:
//   snippet = args only (what goes inside the parens).
//   _toCompletionItem wraps it: color(snippet) => color('primary')
//   Mixin snippets with a body block are the full insertion text.
// =============================================================================
exports.BUILT_IN_REGISTRY = [
    // ===========================================================================
    // FUNCTIONS -- Token Accessors  (scss/functions/_token-accessors.scss)
    // ===========================================================================
    // color($key, $fallback)
    // Keys from $mastors-colors in scss/tokens/_colors.scss
    {
        name: 'color',
        type: 'function',
        category: 'color',
        description: 'Returns a color value from the Mastors color palette. Accepts brand, status, neutral, surface, and transparent color keys.',
        params: [
            { name: 'key', type: 'String', description: "Color token key, e.g. 'primary', 'neutral-500'" },
            { name: 'fallback', type: 'Color|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: [
            // Brand
            'primary', 'primary-50', 'primary-100', 'primary-200', 'primary-300', 'primary-400', 'primary-500', 'primary-600', 'primary-700', 'primary-800', 'primary-900', 'primary-950', 'primary-light', 'primary-dark',
            'secondary', 'secondary-50', 'secondary-100', 'secondary-200', 'secondary-300', 'secondary-400', 'secondary-500', 'secondary-600', 'secondary-700', 'secondary-800', 'secondary-900', 'secondary-950', 'secondary-light', 'secondary-dark',
            'accent', 'accent-50', 'accent-100', 'accent-200', 'accent-300', 'accent-400', 'accent-500', 'accent-600', 'accent-700', 'accent-800', 'accent-900', 'accent-950', 'accent-light', 'accent-dark',
            // Status
            'success', 'success-50', 'success-100', 'success-200', 'success-300', 'success-400', 'success-500', 'success-600', 'success-700', 'success-800', 'success-900', 'success-950', 'success-light', 'success-dark',
            'warning', 'warning-50', 'warning-100', 'warning-200', 'warning-300', 'warning-400', 'warning-500', 'warning-600', 'warning-700', 'warning-800', 'warning-900', 'warning-950', 'warning-light', 'warning-dark',
            'danger', 'danger-50', 'danger-100', 'danger-200', 'danger-300', 'danger-400', 'danger-500', 'danger-600', 'danger-700', 'danger-800', 'danger-900', 'danger-950', 'danger-light', 'danger-dark',
            'info', 'info-50', 'info-100', 'info-200', 'info-300', 'info-400', 'info-500', 'info-600', 'info-700', 'info-800', 'info-900', 'info-950', 'info-light', 'info-dark',
            // Extended palettes
            'rose-50', 'rose-100', 'rose-200', 'rose-300', 'rose-400', 'rose-500', 'rose-600', 'rose-700', 'rose-800', 'rose-900', 'rose-950',
            'pink-50', 'pink-100', 'pink-200', 'pink-300', 'pink-400', 'pink-500', 'pink-600', 'pink-700', 'pink-800', 'pink-900', 'pink-950',
            'fuchsia-50', 'fuchsia-100', 'fuchsia-200', 'fuchsia-300', 'fuchsia-400', 'fuchsia-500', 'fuchsia-600', 'fuchsia-700', 'fuchsia-800', 'fuchsia-900', 'fuchsia-950',
            'purple-50', 'purple-100', 'purple-200', 'purple-300', 'purple-400', 'purple-500', 'purple-600', 'purple-700', 'purple-800', 'purple-900', 'purple-950',
            'indigo-50', 'indigo-100', 'indigo-200', 'indigo-300', 'indigo-400', 'indigo-500', 'indigo-600', 'indigo-700', 'indigo-800', 'indigo-900', 'indigo-950',
            'teal-50', 'teal-100', 'teal-200', 'teal-300', 'teal-400', 'teal-500', 'teal-600', 'teal-700', 'teal-800', 'teal-900', 'teal-950',
            'emerald-50', 'emerald-100', 'emerald-200', 'emerald-300', 'emerald-400', 'emerald-500', 'emerald-600', 'emerald-700', 'emerald-800', 'emerald-900', 'emerald-950',
            'lime-50', 'lime-100', 'lime-200', 'lime-300', 'lime-400', 'lime-500', 'lime-600', 'lime-700', 'lime-800', 'lime-900', 'lime-950',
            'yellow-50', 'yellow-100', 'yellow-200', 'yellow-300', 'yellow-400', 'yellow-500', 'yellow-600', 'yellow-700', 'yellow-800', 'yellow-900', 'yellow-950',
            'orange-50', 'orange-100', 'orange-200', 'orange-300', 'orange-400', 'orange-500', 'orange-600', 'orange-700', 'orange-800', 'orange-900', 'orange-950',
            'stone-50', 'stone-100', 'stone-200', 'stone-300', 'stone-400', 'stone-500', 'stone-600', 'stone-700', 'stone-800', 'stone-900', 'stone-950',
            'zinc-50', 'zinc-100', 'zinc-200', 'zinc-300', 'zinc-400', 'zinc-500', 'zinc-600', 'zinc-700', 'zinc-800', 'zinc-900', 'zinc-950',
            'slate-50', 'slate-100', 'slate-200', 'slate-300', 'slate-400', 'slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900', 'slate-950',
            // Neutrals
            'white', 'black', 'transparent',
            'neutral-50', 'neutral-100', 'neutral-200', 'neutral-300', 'neutral-400',
            'neutral-500', 'neutral-600', 'neutral-700', 'neutral-800', 'neutral-900', 'neutral-950',
            // Surface
            'surface', 'surface-raised', 'surface-overlay', 'surface-sunken',
            'surface-dark', 'surface-dark-raised', 'surface-dark-overlay', 'surface-dark-sunken',
            // Scrim
            'scrim-light', 'scrim-dark', 'scrim-heavy',
            // Chart
            'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
            'chart-6', 'chart-7', 'chart-8', 'chart-9', 'chart-10',
        ],
        returns: 'Color',
        example: "color: mc.color('primary');\nbackground: mc.color('neutral-100', #f5f5f5);",
        snippet: "'${1|primary,primary-light,primary-dark,primary-50,primary-100,primary-200,primary-300,primary-400,primary-500,primary-600,primary-700,primary-800,primary-900,primary-950,secondary,secondary-light,secondary-dark,secondary-50,secondary-100,secondary-200,secondary-300,secondary-400,secondary-500,secondary-600,secondary-700,secondary-800,secondary-900,secondary-950,accent,accent-light,accent-dark,accent-50,accent-100,accent-200,accent-300,accent-400,accent-500,accent-600,accent-700,accent-800,accent-900,accent-950,success,success-light,success-dark,success-50,success-100,success-200,success-300,success-400,success-500,success-600,success-700,success-800,success-900,success-950,warning,warning-light,warning-dark,warning-50,warning-100,warning-200,warning-300,warning-400,warning-500,warning-600,warning-700,warning-800,warning-900,warning-950,danger,danger-light,danger-dark,danger-50,danger-100,danger-200,danger-300,danger-400,danger-500,danger-600,danger-700,danger-800,danger-900,danger-950,info,info-light,info-dark,info-50,info-100,info-200,info-300,info-400,info-500,info-600,info-700,info-800,info-900,info-950,white,black,transparent,neutral-50,neutral-100,neutral-200,neutral-300,neutral-400,neutral-500,neutral-600,neutral-700,neutral-800,neutral-900,neutral-950,surface,surface-raised,surface-overlay,surface-sunken,surface-dark,surface-dark-raised,surface-dark-overlay,surface-dark-sunken,scrim-light,scrim-dark,scrim-heavy,chart-1,chart-2,chart-3,chart-4,chart-5,chart-6,chart-7,chart-8,chart-9,chart-10,rose-50,rose-100,rose-200,rose-300,rose-400,rose-500,rose-600,rose-700,rose-800,rose-900,rose-950,pink-50,pink-100,pink-200,pink-300,pink-400,pink-500,pink-600,pink-700,pink-800,pink-900,pink-950,fuchsia-50,fuchsia-100,fuchsia-200,fuchsia-300,fuchsia-400,fuchsia-500,fuchsia-600,fuchsia-700,fuchsia-800,fuchsia-900,fuchsia-950,purple-50,purple-100,purple-200,purple-300,purple-400,purple-500,purple-600,purple-700,purple-800,purple-900,purple-950,indigo-50,indigo-100,indigo-200,indigo-300,indigo-400,indigo-500,indigo-600,indigo-700,indigo-800,indigo-900,indigo-950,teal-50,teal-100,teal-200,teal-300,teal-400,teal-500,teal-600,teal-700,teal-800,teal-900,teal-950,emerald-50,emerald-100,emerald-200,emerald-300,emerald-400,emerald-500,emerald-600,emerald-700,emerald-800,emerald-900,emerald-950,lime-50,lime-100,lime-200,lime-300,lime-400,lime-500,lime-600,lime-700,lime-800,lime-900,lime-950,yellow-50,yellow-100,yellow-200,yellow-300,yellow-400,yellow-500,yellow-600,yellow-700,yellow-800,yellow-900,yellow-950,orange-50,orange-100,orange-200,orange-300,orange-400,orange-500,orange-600,orange-700,orange-800,orange-900,orange-950,stone-50,stone-100,stone-200,stone-300,stone-400,stone-500,stone-600,stone-700,stone-800,stone-900,stone-950,zinc-50,zinc-100,zinc-200,zinc-300,zinc-400,zinc-500,zinc-600,zinc-700,zinc-800,zinc-900,zinc-950,slate-50,slate-100,slate-200,slate-300,slate-400,slate-500,slate-600,slate-700,slate-800,slate-900,slate-950|}'",
    },
    // semantic($key, $fallback)
    // Keys from $mastors-semantic in scss/tokens/_colors.scss
    {
        name: 'semantic',
        type: 'function',
        category: 'color',
        description: 'Returns a semantic color token -- text, background, or border roles that adapt to the active theme.',
        params: [
            { name: 'key', type: 'String', description: "Semantic key, e.g. 'text-primary', 'bg-body'" },
            { name: 'fallback', type: 'Color|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: [
            // Text
            'text-primary', 'text-secondary', 'text-muted', 'text-disabled', 'text-placeholder', 'text-inverse',
            'text-on-primary', 'text-on-secondary', 'text-on-accent',
            'text-on-success', 'text-on-warning', 'text-on-danger', 'text-on-info',
            'text-code', 'text-heading',
            // Background
            'bg-body', 'bg-subtle', 'bg-muted', 'bg-inverse',
            'bg-primary', 'bg-primary-subtle',
            'bg-secondary', 'bg-secondary-subtle',
            'bg-success', 'bg-success-subtle',
            'bg-warning', 'bg-warning-subtle',
            'bg-danger', 'bg-danger-subtle',
            'bg-info', 'bg-info-subtle',
            // Border
            'border-default', 'border-strong', 'border-subtle', 'border-focus',
            'border-primary', 'border-success', 'border-warning', 'border-danger', 'border-info',
            // Link
            'link', 'link-hover', 'link-visited', 'link-active',
            // Interactive
            'ring-focus', 'ring-danger', 'ring-success',
            'overlay-light', 'overlay-dark',
        ],
        returns: 'Color',
        example: "color: mc.semantic('text-primary');\nborder-color: mc.semantic('border-focus');",
        snippet: "'${1|text-primary,text-secondary,text-muted,text-disabled,text-placeholder,text-inverse,text-on-primary,text-on-secondary,text-on-accent,text-on-success,text-on-warning,text-on-danger,text-on-info,text-code,text-heading,bg-body,bg-subtle,bg-muted,bg-inverse,bg-primary,bg-primary-subtle,bg-secondary,bg-secondary-subtle,bg-success,bg-success-subtle,bg-warning,bg-warning-subtle,bg-danger,bg-danger-subtle,bg-info,bg-info-subtle,border-default,border-strong,border-subtle,border-focus,border-primary,border-success,border-warning,border-danger,border-info,link,link-hover,link-visited,link-active,ring-focus,ring-danger,ring-success,overlay-light,overlay-dark|}'",
    },
    // shadow($key, $fallback)
    // Keys from $mastors-shadows in scss/tokens/_shadows.scss
    {
        name: 'shadow',
        type: 'function',
        category: 'shadow',
        description: 'Returns a box-shadow value from the Mastors shadow scale.',
        params: [
            { name: 'key', type: 'String', description: "Shadow key, e.g. 'md', 'primary', 'dark-lg'" },
            { name: 'fallback', type: 'any|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: [
            'none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'inner',
            'primary', 'success', 'danger', 'warning',
            'dark-sm', 'dark-md', 'dark-lg',
        ],
        returns: 'String (box-shadow)',
        example: "box-shadow: mc.shadow('md');\nbox-shadow: mc.shadow('primary');",
        snippet: "'${1|none,xs,sm,md,lg,xl,2xl,inner,primary,success,danger,warning,dark-sm,dark-md,dark-lg|}'",
    },
    // radius($key, $fallback)
    // Keys from $mastors-radius in scss/tokens/_radius.scss
    // none=0, xs=2px, sm=4px, md=8px, lg=12px, xl=16px, 2xl=24px, 3xl=32px, full=9999px
    {
        name: 'radius',
        type: 'function',
        category: 'radius',
        description: 'Returns a border-radius value from the Mastors radius scale.',
        params: [
            { name: 'key', type: 'String', description: "Radius key, e.g. 'sm', 'full'" },
            { name: 'fallback', type: 'any|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'],
        returns: 'Length',
        example: "border-radius: mc.radius('md');\nborder-radius: mc.radius('full');",
        snippet: "'${1|none,xs,sm,md,lg,xl,2xl,3xl,full|}'",
    },
    // z($key, $fallback)
    // Keys from $mastors-z-index in scss/tokens/_zindex.scss
    // base=0, raised=10, dropdown=100, sticky=200, fixed=300, overlay=400,
    // modal=500, popover=600, tooltip=700, toast=800, spinner=900, max=9999
    {
        name: 'z',
        type: 'function',
        category: 'z-index',
        description: 'Returns a z-index value from the Mastors UI stacking scale.',
        params: [
            { name: 'key', type: 'String', description: "Z-index key, e.g. 'modal', 'tooltip'" },
            { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['base', 'raised', 'dropdown', 'sticky', 'fixed', 'overlay', 'modal', 'popover', 'tooltip', 'toast', 'spinner', 'max'],
        returns: 'Number',
        example: "z-index: mc.z('modal');\nz-index: mc.z('tooltip');",
        snippet: "'${1|base,raised,dropdown,sticky,fixed,overlay,modal,popover,tooltip,toast,spinner,max|}'",
    },
    // layer($key, $fallback)
    // Keys from $mastors-layers in scss/tokens/_zindex.scss
    // page=0, ui=1, nav=2, panel=3, dialog=4, critical=5
    {
        name: 'layer',
        type: 'function',
        category: 'z-index',
        description: 'Returns a structural CSS layer z-index (page, ui, nav, panel, dialog, critical).',
        params: [
            { name: 'key', type: 'String', description: "Layer key, e.g. 'nav', 'dialog'" },
            { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['page', 'ui', 'nav', 'panel', 'dialog', 'critical'],
        returns: 'Number',
        example: "z-index: mc.layer('nav');",
        snippet: "'${1|page,ui,nav,panel,dialog,critical|}'",
    },
    // opacity($key, $fallback)
    // Keys from $mastors-opacity in scss/tokens/_opacity.scss
    // Full set: 0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100
    {
        name: 'opacity',
        type: 'function',
        category: 'opacity',
        description: 'Returns an opacity value (0-1) from the Mastors opacity scale.',
        params: [
            { name: 'key', type: 'String', description: "Opacity key, e.g. '50', '75'" },
            { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['0', '5', '10', '15', '20', '25', '30', '40', '50', '60', '70', '75', '80', '90', '95', '100'],
        returns: 'Number (0-1)',
        example: "opacity: mc.opacity('75'); // => 0.75\nopacity: mc.opacity('50'); // => 0.50",
        snippet: "'${1|0,5,10,15,20,25,30,40,50,60,70,75,80,90,95,100|}'",
    },
    // breakpoint($key, $fallback)
    // Keys from $mastors-breakpoints in scss/tokens/_breakpoints.scss
    // xs=0, sm=576px, md=768px, lg=992px, xl=1200px, 2xl=1400px, 3xl=1600px
    {
        name: 'breakpoint',
        type: 'function',
        category: 'breakpoint',
        description: 'Returns a breakpoint pixel value from the Mastors breakpoint scale.',
        params: [
            { name: 'key', type: 'String', description: "Breakpoint key ('xs'..'3xl')" },
            { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
        returns: 'Length (px)',
        example: "max-width: mc.breakpoint('lg'); // => 992px",
        snippet: "'${1|xs,sm,md,lg,xl,2xl,3xl|}'",
    },
    // container($key, $fallback)
    // Keys from $mastors-containers in scss/tokens/_breakpoints.scss
    // xs=100%, sm=540px, md=720px, lg=960px, xl=1140px, 2xl=1320px, 3xl=1520px, fluid=100%
    {
        name: 'container',
        type: 'function',
        category: 'layout',
        description: 'Returns a container max-width from the Mastors container scale.',
        params: [
            { name: 'key', type: 'String', description: "Container key ('xs'..'3xl', 'fluid')" },
            { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'fluid'],
        returns: 'Length',
        example: "max-width: mc.container('xl'); // => 1140px",
        snippet: "'${1|xs,sm,md,lg,xl,2xl,3xl,fluid|}'",
    },
    // duration($key, $fallback)
    // Keys from $mastors-durations in scss/tokens/_motion.scss
    // instant=0ms, fast=100ms, normal=200ms, moderate=300ms, slow=500ms, slower=700ms, slowest=1000ms
    {
        name: 'duration',
        type: 'function',
        category: 'motion',
        description: 'Returns an animation/transition duration from the Mastors motion scale.',
        params: [
            { name: 'key', type: 'String', description: "Duration key, e.g. 'normal', 'fast'" },
            { name: 'fallback', type: 'Time|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['instant', 'fast', 'normal', 'moderate', 'slow', 'slower', 'slowest'],
        returns: 'Time (ms)',
        example: "transition-duration: mc.duration('normal'); // => 200ms",
        snippet: "'${1|instant,fast,normal,moderate,slow,slower,slowest|}'",
    },
    // easing($key, $fallback)
    // Keys from $mastors-easings in scss/tokens/_motion.scss
    {
        name: 'easing',
        type: 'function',
        category: 'motion',
        description: 'Returns a cubic-bezier easing string from the Mastors easing library.',
        params: [
            { name: 'key', type: 'String', description: "Easing key, e.g. 'spring', 'ease-in-out'" },
            { name: 'fallback', type: 'String|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring', 'bounce', 'smooth', 'sharp'],
        returns: 'String (cubic-bezier)',
        example: "transition-timing-function: mc.easing('spring');",
        snippet: "'${1|linear,ease,ease-in,ease-out,ease-in-out,spring,bounce,smooth,sharp|}'",
    },
    // transition($key, $fallback)
    // Keys from $mastors-transitions in scss/tokens/_motion.scss
    {
        name: 'transition',
        type: 'function',
        category: 'motion',
        description: 'Returns a full CSS transition shorthand string from the Mastors transition presets.',
        params: [
            { name: 'key', type: 'String', description: "Transition preset key, e.g. 'colors', 'transform'" },
            { name: 'fallback', type: 'String|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['none', 'all', 'fast', 'colors', 'opacity', 'shadow', 'transform'],
        returns: 'String',
        example: "transition: mc.transition('colors');",
        snippet: "'${1|none,all,fast,colors,opacity,shadow,transform|}'",
    },
    // border-width($key, $fallback)
    // Keys from $mastors-border-widths in scss/tokens/_borders.scss
    // 0=0, 1=1px, 2=2px, 4=4px, 8=8px
    {
        name: 'border-width',
        type: 'function',
        category: 'border',
        description: 'Returns a border width value from the Mastors border-width scale.',
        params: [
            { name: 'key', type: 'String', description: "Border width key: '0', '1', '2', '4', '8'" },
            { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['0', '1', '2', '4', '8'],
        returns: 'Length (px)',
        example: "border-width: mc.border-width('2'); // => 2px",
        snippet: "'${1|0,1,2,4,8|}'",
    },
    // aspect-ratio($key, $fallback) -- FUNCTION
    // Keys from $mastors-aspect-ratios in scss/tokens/_borders.scss
    {
        name: 'aspect-ratio',
        type: 'function',
        category: 'layout',
        description: 'Returns a numeric aspect ratio value from the Mastors ratio presets (computed via math.div).',
        params: [
            { name: 'key', type: 'String', description: "Aspect ratio key, e.g. 'video', 'square'" },
            { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
        ],
        values: ['square', 'video', 'cinema', 'portrait', 'landscape', 'golden', 'wide', 'tall'],
        returns: 'Number',
        example: "aspect-ratio: mc.aspect-ratio('video'); // => 1.7778",
        snippet: "'${1|square,video,cinema,portrait,landscape,golden,wide,tall|}'",
    },
    // ===========================================================================
    // FUNCTIONS -- Math & Unit Helpers  (scss/functions/_math.scss)
    // ===========================================================================
    // rem($px, $base)
    {
        name: 'rem',
        type: 'function',
        category: 'math',
        description: 'Converts a unitless pixel value to rem using math.div($px, $base) * 1rem. Default base is 16.',
        params: [
            { name: 'px', type: 'Number', description: 'Pixel value to convert (unitless integer)' },
            { name: 'base', type: 'Number', default: '16', description: 'Base font size in px' },
        ],
        returns: 'Length (rem)',
        example: "font-size: mc.rem(18);    // => 1.125rem\npadding:   mc.rem(24, 16); // => 1.5rem",
        snippet: '${1:16}',
    },
    // em($px, $base)
    {
        name: 'em',
        type: 'function',
        category: 'math',
        description: 'Converts a unitless pixel value to em using math.div($px, $base) * 1em. Default base is 16.',
        params: [
            { name: 'px', type: 'Number', description: 'Pixel value to convert (unitless)' },
            { name: 'base', type: 'Number', default: '16', description: 'Base font size in px' },
        ],
        returns: 'Length (em)',
        example: "margin: mc.em(24); // => 1.5em",
        snippet: '${1:16}',
    },
    // strip-unit($value)
    {
        name: 'strip-unit',
        type: 'function',
        category: 'math',
        description: 'Removes the CSS unit from a value, returning a plain unitless number via math.div($value, $value * 0 + 1).',
        params: [
            { name: 'value', type: 'Length', description: 'Any CSS value with a unit, e.g. 24px or 1.5rem' },
        ],
        returns: 'Number',
        example: '$n: mc.strip-unit(24px); // => 24',
        snippet: '${1:$value}',
    },
    // fluid($min, $max, $min-vw, $max-vw)
    {
        name: 'fluid',
        type: 'function',
        category: 'typography',
        description: 'Generates a CSS clamp() expression for fluid/responsive sizing between min and max values across a viewport range.',
        params: [
            { name: 'min', type: 'Length', description: 'Minimum size (applied at $min-vw)' },
            { name: 'max', type: 'Length', description: 'Maximum size (applied at $max-vw)' },
            { name: 'min-vw', type: 'Length', default: '320px', description: 'Viewport width at which min applies' },
            { name: 'max-vw', type: 'Length', default: '1440px', description: 'Viewport width at which max applies' },
        ],
        returns: 'clamp() expression',
        example: "font-size: mc.fluid(16px, 24px);\nfont-size: mc.fluid(14px, 20px, 320px, 1200px);",
        snippet: '${1:16px}, ${2:24px}',
    },
    // percent($value, $total)
    {
        name: 'percent',
        type: 'function',
        category: 'math',
        description: 'Returns a CSS percentage: math.percentage(math.div($value, $total)).',
        params: [
            { name: 'value', type: 'Number', description: 'Numerator' },
            { name: 'total', type: 'Number', default: '100', description: 'Denominator' },
        ],
        returns: 'Percentage',
        example: 'width: mc.percent(4, 12); // => 33.333%',
        snippet: '${1:4}, ${2:12}',
    },
    // ===========================================================================
    // FUNCTIONS -- Map Helpers  (scss/functions/_map-helpers.scss)
    // ===========================================================================
    // mastors-map-get($map, $key, $fallback, $context)
    {
        name: 'mastors-map-get',
        type: 'function',
        category: 'map',
        description: 'Safe map.get() with type validation and @warn logging. Returns $fallback if the key is missing instead of throwing.',
        params: [
            { name: 'map', type: 'Map', description: 'The SCSS map to query' },
            { name: 'key', type: 'String', description: 'Key to look up' },
            { name: 'fallback', type: 'any', default: 'null', description: 'Fallback value if key is missing' },
            { name: 'context', type: 'String', default: "'mastors'", description: 'Warning label shown in @warn output' },
        ],
        returns: 'any',
        example: "$val: mc.mastors-map-get($my-map, 'primary', #000, 'my-fn()');",
        snippet: "${1:\\$map}, '${2:key}'",
    },
    // mastors-map-merge($map1, $map2)
    {
        name: 'mastors-map-merge',
        type: 'function',
        category: 'map',
        description: 'Merges two SCSS maps via map.merge(). Keys in $map2 override $map1.',
        params: [
            { name: 'map1', type: 'Map', description: 'Base map' },
            { name: 'map2', type: 'Map', description: 'Map to merge in (overrides base)' },
        ],
        returns: 'Map',
        example: '$merged: mc.mastors-map-merge($colors, $overrides);',
        snippet: '${1:\\$map1}, ${2:\\$map2}',
    },
    // ===========================================================================
    // MIXINS -- Responsive  (scss/mixins/_responsive.scss)
    // ===========================================================================
    // up($bp)
    {
        name: 'up',
        type: 'mixin',
        category: 'responsive',
        description: 'Mobile-first min-width media query. Content applies at the given breakpoint and above. xs (0px) emits no query -- content is always applied.',
        params: [
            { name: 'bp', type: 'String', description: "Breakpoint key ('xs'..'3xl') or a custom px value" },
        ],
        values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
        example: "@include mc.up('md') {\n  font-size: 1.25rem;\n}",
        snippet: "up('${1|sm,md,lg,xl,2xl,3xl|}') {\n  ${0}\n}",
    },
    // down($bp)
    {
        name: 'down',
        type: 'mixin',
        category: 'responsive',
        description: 'Max-width media query. Content applies below the given breakpoint. Note: down(xs) warns and has no effect -- use up(sm) instead.',
        params: [
            { name: 'bp', type: 'String', description: "Breakpoint key ('sm'..'3xl') or a custom px value" },
        ],
        values: ['sm', 'md', 'lg', 'xl', '2xl', '3xl'],
        example: "@include mc.down('lg') {\n  display: none;\n}",
        snippet: "down('${1|sm,md,lg,xl,2xl,3xl|}') {\n  ${0}\n}",
    },
    // between($lower, $upper)
    {
        name: 'between',
        type: 'mixin',
        category: 'responsive',
        description: 'Applies styles between two breakpoints using min-width AND max-width.',
        params: [
            { name: 'lower', type: 'String', description: 'Lower breakpoint key' },
            { name: 'upper', type: 'String', description: 'Upper breakpoint key' },
        ],
        example: "@include mc.between('sm', 'lg') {\n  padding: 1rem;\n}",
        snippet: "between('${1:sm}', '${2:lg}') {\n  ${0}\n}",
    },
    // only($bp)
    {
        name: 'only',
        type: 'mixin',
        category: 'responsive',
        description: 'Applies styles within a single breakpoint range. For the last breakpoint key, behaves like up().',
        params: [
            { name: 'bp', type: 'String', description: "Breakpoint key ('xs'..'3xl')" },
        ],
        values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
        example: "@include mc.only('md') {\n  columns: 2;\n}",
        snippet: "only('${1|xs,sm,md,lg,xl,2xl,3xl|}') {\n  ${0}\n}",
    },
    // hover
    {
        name: 'hover',
        type: 'mixin',
        category: 'responsive',
        description: 'Wraps :hover in (hover: hover) and (pointer: fine). Prevents sticky hover states on touchscreen devices.',
        params: [],
        example: "@include mc.hover {\n  opacity: 0.85;\n}",
        snippet: "hover {\n  ${0}\n}",
    },
    // prefers-dark
    {
        name: 'prefers-dark',
        type: 'mixin',
        category: 'responsive',
        description: 'Wraps content in a prefers-color-scheme: dark media query.',
        params: [],
        example: "@include mc.prefers-dark {\n  background: #111;\n}",
        snippet: "prefers-dark {\n  ${0}\n}",
    },
    // prefers-reduced-motion
    {
        name: 'prefers-reduced-motion',
        type: 'mixin',
        category: 'motion',
        description: 'Wraps content in a prefers-reduced-motion: reduce media query.',
        params: [],
        example: "@include mc.prefers-reduced-motion {\n  animation: none;\n  transition: none;\n}",
        snippet: "prefers-reduced-motion {\n  ${0}\n}",
    },
    // print
    {
        name: 'print',
        type: 'mixin',
        category: 'responsive',
        description: 'Wraps content in a @media print query.',
        params: [],
        example: "@include mc.print {\n  display: none;\n}",
        snippet: "print {\n  ${0}\n}",
    },
    // portrait
    {
        name: 'portrait',
        type: 'mixin',
        category: 'responsive',
        description: 'Applies styles when the device is in portrait orientation.',
        params: [],
        example: "@include mc.portrait {\n  flex-direction: column;\n}",
        snippet: "portrait {\n  ${0}\n}",
    },
    // landscape
    {
        name: 'landscape',
        type: 'mixin',
        category: 'responsive',
        description: 'Applies styles when the device is in landscape orientation.',
        params: [],
        example: "@include mc.landscape {\n  flex-direction: row;\n}",
        snippet: "landscape {\n  ${0}\n}",
    },
    // ===========================================================================
    // MIXINS -- Helpers  (scss/mixins/_helpers.scss)
    // ===========================================================================
    // absolute-center
    {
        name: 'absolute-center',
        type: 'mixin',
        category: 'layout',
        description: 'Absolutely positions an element at the center of its nearest positioned ancestor using position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%).',
        params: [],
        example: '@include mc.absolute-center;',
        snippet: 'absolute-center',
    },
    // flex-center
    {
        name: 'flex-center',
        type: 'mixin',
        category: 'layout',
        description: 'Sets display: flex; align-items: center; justify-content: center.',
        params: [],
        example: '@include mc.flex-center;',
        snippet: 'flex-center',
    },
    // cover
    {
        name: 'cover',
        type: 'mixin',
        category: 'layout',
        description: 'Fills parent completely: position: absolute; inset: 0; width: 100%; height: 100%.',
        params: [],
        example: '@include mc.cover;',
        snippet: 'cover',
    },
    // aspect-ratio($ratio) -- MIXIN
    {
        name: 'aspect-ratio',
        type: 'mixin',
        category: 'layout',
        description: 'Sets the CSS aspect-ratio property from a slash-separated ratio string.',
        params: [
            { name: 'ratio', type: 'String', default: "'16/9'", description: "Ratio string, e.g. '16/9', '1/1'" },
        ],
        example: "@include mc.aspect-ratio('16/9');",
        snippet: "aspect-ratio('${1:16/9}')",
    },
    // truncate
    {
        name: 'truncate',
        type: 'mixin',
        category: 'typography',
        description: 'Truncates single-line text with an ellipsis. Sets overflow: hidden; text-overflow: ellipsis; white-space: nowrap.',
        params: [],
        example: '@include mc.truncate;',
        snippet: 'truncate',
    },
    // line-clamp($lines)
    {
        name: 'line-clamp',
        type: 'mixin',
        category: 'typography',
        description: 'Clamps multi-line text to $lines with a trailing ellipsis using -webkit-line-clamp.',
        params: [
            { name: 'lines', type: 'Number', default: '2', description: 'Maximum number of visible lines' },
        ],
        example: '@include mc.line-clamp(3);',
        snippet: 'line-clamp(${1:3})',
    },
    // glassmorphism($blur, $bg, $border, $shadow)
    {
        name: 'glassmorphism',
        type: 'mixin',
        category: 'effect',
        description: 'Applies a glassmorphism effect: backdrop-filter blur, translucent background, subtle border, and configurable shadow.',
        params: [
            { name: 'blur', type: 'Length', default: '16px', description: 'Blur radius for backdrop-filter' },
            { name: 'bg', type: 'Color', default: 'rgba(255, 255, 255, 0.12)', description: 'Background color with alpha' },
            { name: 'border', type: 'Color', default: 'rgba(255, 255, 255, 0.18)', description: 'Border color with alpha' },
            { name: 'shadow', type: 'String', default: '0 8px 32px rgba(0,0,0,0.15)', description: 'Box-shadow value' },
        ],
        example: '@include mc.glassmorphism;\n@include mc.glassmorphism(20px, rgba(255,255,255,0.15));',
        snippet: 'glassmorphism(${1:16px}, ${2:rgba(255,255,255,0.12)})',
    },
    // neumorphism($bg, $light, $dark, $intensity)
    {
        name: 'neumorphism',
        type: 'mixin',
        category: 'effect',
        description: 'Applies a neumorphism (soft-UI) effect with configurable dual shadows.',
        params: [
            { name: 'bg', type: 'Color', default: '#e0e5ec', description: 'Background color' },
            { name: 'light', type: 'Color', default: 'rgba(255,255,255,0.8)', description: 'Light shadow color' },
            { name: 'dark', type: 'Color', default: 'rgba(163,177,198,0.6)', description: 'Dark shadow color' },
            { name: 'intensity', type: 'Length', default: '6px', description: 'Shadow spread intensity' },
        ],
        example: '@include mc.neumorphism(#e0e5ec);',
        snippet: 'neumorphism(${1:#e0e5ec})',
    },
    // hover-lift($y, $shadow)
    {
        name: 'hover-lift',
        type: 'mixin',
        category: 'effect',
        description: 'Adds a translateY lift and elevated shadow on hover. Only fires on fine-pointer (mouse/stylus) devices.',
        params: [
            { name: 'y', type: 'Length', default: '-4px', description: 'Y-axis translation on hover' },
            { name: 'shadow', type: 'String', default: '0 10px 20px rgba(0,0,0,0.15)', description: 'Box-shadow on hover' },
        ],
        example: '@include mc.hover-lift;\n@include mc.hover-lift(-6px);',
        snippet: 'hover-lift(${1:-4px})',
    },
    // custom-scrollbar($width, $track, $thumb, $thumb-hover)
    {
        name: 'custom-scrollbar',
        type: 'mixin',
        category: 'utility',
        description: 'Applies a custom-styled scrollbar with ::-webkit-scrollbar (Chrome/Edge) and scrollbar-width (Firefox).',
        params: [
            { name: 'width', type: 'Length', default: '6px', description: 'Scrollbar width' },
            { name: 'track', type: 'Color', default: 'transparent', description: 'Track background color' },
            { name: 'thumb', type: 'Color', default: 'rgba(0,0,0,0.2)', description: 'Thumb color' },
            { name: 'thumb-hover', type: 'Color', default: 'rgba(0,0,0,0.4)', description: 'Thumb hover color' },
        ],
        example: '@include mc.custom-scrollbar(8px, #f0f0f0, #ccc);',
        snippet: 'custom-scrollbar(${1:6px}, ${2:transparent}, ${3:rgba(0,0,0,0.2)})',
    },
    // focus-ring($color, $width, $offset, $style)
    {
        name: 'focus-ring',
        type: 'mixin',
        category: 'utility',
        description: 'Applies an accessible focus ring (outline + outline-offset) with configurable color, width, offset, and style.',
        params: [
            { name: 'color', type: 'Color', default: '#2563eb', description: 'Outline color' },
            { name: 'width', type: 'Length', default: '3px', description: 'Outline width' },
            { name: 'offset', type: 'Length', default: '2px', description: 'Outline offset' },
            { name: 'style', type: 'String', default: 'solid', description: 'Outline style' },
        ],
        example: '@include mc.focus-ring;\n@include mc.focus-ring(#7c3aed, 2px);',
        snippet: 'focus-ring(${1:#2563eb})',
    },
    // focus-visible
    {
        name: 'focus-visible',
        type: 'mixin',
        category: 'utility',
        description: 'Removes default outline on :focus and applies focus-ring only on :focus-visible (keyboard navigation only).',
        params: [],
        example: '@include mc.focus-visible;',
        snippet: 'focus-visible',
    },
    // smooth-transition($props, $dur, $ease)
    {
        name: 'smooth-transition',
        type: 'mixin',
        category: 'motion',
        description: 'Applies a CSS transition shorthand with configurable properties, duration, and easing.',
        params: [
            { name: 'props', type: 'String', default: 'all', description: 'CSS properties to transition' },
            { name: 'dur', type: 'Time', default: '200ms', description: 'Transition duration' },
            { name: 'ease', type: 'String', default: 'cubic-bezier(0.4, 0, 0.2, 1)', description: 'Timing function' },
        ],
        example: '@include mc.smooth-transition(opacity, 300ms);\n@include mc.smooth-transition;',
        snippet: 'smooth-transition(${1:all}, ${2:200ms})',
    },
    // loading-state
    {
        name: 'loading-state',
        type: 'mixin',
        category: 'utility',
        description: 'Applies a disabled/loading visual state: pointer-events: none, opacity: 0.7, cursor: wait, and a translucent ::after overlay.',
        params: [],
        example: '&.is-loading { @include mc.loading-state; }',
        snippet: 'loading-state',
    },
    // skeleton-loading($bg-from, $bg-to, $duration)
    {
        name: 'skeleton-loading',
        type: 'mixin',
        category: 'utility',
        description: 'Applies an animated shimmer/skeleton loading effect using a moving linear-gradient background.',
        params: [
            { name: 'bg-from', type: 'Color', default: '#e5e7eb', description: 'Start/end gradient color' },
            { name: 'bg-to', type: 'Color', default: '#f3f4f6', description: 'Mid gradient highlight color' },
            { name: 'duration', type: 'Time', default: '1.5s', description: 'Animation duration' },
        ],
        example: '@include mc.skeleton-loading;\n@include mc.skeleton-loading(#d1d5db, #e5e7eb, 2s);',
        snippet: 'skeleton-loading(${1:#e5e7eb}, ${2:#f3f4f6})',
    },
    // visually-hidden
    {
        name: 'visually-hidden',
        type: 'mixin',
        category: 'utility',
        description: 'Hides an element visually while keeping it accessible to screen readers (SR-only / clip pattern).',
        params: [],
        example: '@include mc.visually-hidden;',
        snippet: 'visually-hidden',
    },
    // visually-visible
    {
        name: 'visually-visible',
        type: 'mixin',
        category: 'utility',
        description: 'Resets a visually-hidden element back to normal flow visibility. Typically applied on :focus.',
        params: [],
        example: '&:focus { @include mc.visually-visible; }',
        snippet: 'visually-visible',
    },
    // ===========================================================================
    // MIXINS -- CSS Variable Engine  (scss/mixins/_css-vars.scss)
    // ===========================================================================
    // generate-vars($map, $prefix, $root)
    {
        name: 'generate-vars',
        type: 'mixin',
        category: 'utility',
        description: 'Generates CSS custom properties from any SCSS map, prefixed --mastors-{prefix}-{key}.',
        params: [
            { name: 'map', type: 'Map', description: 'SCSS map of key=>value pairs to emit as CSS vars' },
            { name: 'prefix', type: 'String', description: "Token group prefix, e.g. 'color' or 'spacing'" },
            { name: 'root', type: 'String', default: "':root'", description: 'Selector to emit vars into' },
        ],
        example: "@include mc.generate-vars($my-map, 'spacing');",
        snippet: "generate-vars(${1:\\$map}, '${2:prefix}')",
    },
    // generate-all-vars
    {
        name: 'generate-all-vars',
        type: 'mixin',
        category: 'utility',
        description: 'Emits all Mastors Core CSS custom properties into :root -- colors, semantic colors, shadows, radius, z-index, opacity, durations, and easings.',
        params: [],
        example: '@include mc.generate-all-vars;',
        snippet: 'generate-all-vars',
    },
    // generate-all-vars-if-enabled
    {
        name: 'generate-all-vars-if-enabled',
        type: 'mixin',
        category: 'utility',
        description: 'Conditionally emits all Mastors CSS variables -- only when $enable-css-variables is true in scss/config/_settings.scss.',
        params: [],
        example: '@include mc.generate-all-vars-if-enabled;',
        snippet: 'generate-all-vars-if-enabled',
    },
    // ===========================================================================
    // PLACEHOLDERS  (scss/abstracts/_placeholders.scss)
    // Silent classes — used with @extend
    // ===========================================================================
    // %mastors-clearfix
    {
        name: 'mastors-clearfix',
        type: 'variable',
        category: 'placeholder',
        description: 'Clearfix placeholder. Adds an ::after pseudo-element with display: table and clear: both to contain floated children.',
        params: [],
        example: '.my-container { @extend %mastors-clearfix; }',
        snippet: 'mastors-clearfix',
    },
    // %mastors-visually-hidden
    {
        name: 'mastors-visually-hidden',
        type: 'variable',
        category: 'placeholder',
        description: 'Visually hidden placeholder (SR-only). Hides an element from sighted users while keeping it accessible to screen readers. Equivalent to the visually-hidden mixin but as an extend-only selector.',
        params: [],
        example: '.sr-label { @extend %mastors-visually-hidden; }',
        snippet: 'mastors-visually-hidden',
    },
    // %mastors-cover
    {
        name: 'mastors-cover',
        type: 'variable',
        category: 'placeholder',
        description: 'Cover layer placeholder. Sets position: absolute; inset: 0; width: 100%; height: 100% to fill the nearest positioned ancestor.',
        params: [],
        example: '.overlay { @extend %mastors-cover; }',
        snippet: 'mastors-cover',
    },
    // %mastors-flex-center
    {
        name: 'mastors-flex-center',
        type: 'variable',
        category: 'placeholder',
        description: 'Flex center placeholder. Sets display: flex; align-items: center; justify-content: center. Equivalent to the flex-center mixin but as an extend-only selector.',
        params: [],
        example: '.card-icon { @extend %mastors-flex-center; }',
        snippet: 'mastors-flex-center',
    },
    // %mastors-absolute-center
    {
        name: 'mastors-absolute-center',
        type: 'variable',
        category: 'placeholder',
        description: 'Absolute center placeholder. Positions an element dead-center in its nearest positioned ancestor via position: absolute; top/left: 50%; transform: translate(-50%, -50%).',
        params: [],
        example: '.spinner { @extend %mastors-absolute-center; }',
        snippet: 'mastors-absolute-center',
    },
    // %mastors-truncate
    {
        name: 'mastors-truncate',
        type: 'variable',
        category: 'placeholder',
        description: 'Truncate placeholder. Applies overflow: hidden; text-overflow: ellipsis; white-space: nowrap for single-line text truncation. Equivalent to the truncate mixin but as an extend-only selector.',
        params: [],
        example: '.card-title { @extend %mastors-truncate; }',
        snippet: 'mastors-truncate',
    },
    // %mastors-reset-button
    {
        name: 'mastors-reset-button',
        type: 'variable',
        category: 'placeholder',
        description: 'Reset button placeholder. Strips all default browser button styles: removes padding, margin, border, background, sets cursor: pointer, and resets font and appearance.',
        params: [],
        example: 'button.custom { @extend %mastors-reset-button; }',
        snippet: 'mastors-reset-button',
    },
    // %mastors-reset-list
    {
        name: 'mastors-reset-list',
        type: 'variable',
        category: 'placeholder',
        description: 'Reset list placeholder. Removes list-style, margin, and padding from ul/ol elements.',
        params: [],
        example: 'ul.nav { @extend %mastors-reset-list; }',
        snippet: 'mastors-reset-list',
    },
    // %mastors-reset-input
    {
        name: 'mastors-reset-input',
        type: 'variable',
        category: 'placeholder',
        description: 'Reset input placeholder. Strips default browser input styles: removes border, padding, margin, background, and outline; resets font and -webkit-appearance.',
        params: [],
        example: 'input.custom { @extend %mastors-reset-input; }',
        snippet: 'mastors-reset-input',
    },
    // ===========================================================================
    // MIXINS -- Container  (scss/mixins/_helpers.scss)
    // ===========================================================================
    // container($size, $center)
    {
        name: 'container',
        type: 'mixin',
        category: 'layout',
        description: 'Sets max-width from the $mastors-containers token map and optionally centres the element with margin-inline: auto.',
        params: [
            { name: 'size', type: 'String', default: "'lg'", description: "Container size key ('xs'..'3xl', 'fluid')" },
            { name: 'center', type: 'Boolean', default: 'true', description: 'When true, adds margin-inline: auto to centre the container' },
        ],
        values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'fluid'],
        example: "@include mc.container('xl');\n@include mc.container('lg', false);",
        snippet: "container('${1|xs,sm,md,lg,xl,2xl,3xl,fluid|}')",
    },
];
//# sourceMappingURL=mastorsRegistry.js.map