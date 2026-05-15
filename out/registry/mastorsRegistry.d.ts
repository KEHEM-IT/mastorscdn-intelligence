import * as vscode from 'vscode';
export type EntryType = 'function' | 'mixin' | 'variable';
export type Category = 'color' | 'shadow' | 'radius' | 'z-index' | 'opacity' | 'breakpoint' | 'motion' | 'border' | 'math' | 'layout' | 'responsive' | 'typography' | 'effect' | 'utility' | 'map' | 'placeholder';
export interface ParamDef {
    name: string;
    type?: string;
    default?: string;
    description?: string;
}
export interface RegistryEntry {
    name: string;
    type: EntryType;
    category: Category;
    description: string;
    params: ParamDef[];
    /** Accepted string token values (e.g. color keys like 'primary', 'white') */
    values?: string[];
    returns?: string;
    example?: string;
    /**
     * Snippet field: contains ONLY the argument portion (what goes inside the parens).
     * _toCompletionItem() wraps it: name(snippet) => e.g. color('primary')
     * For mixins with a body block, snippet is the full insertion text.
     */
    snippet?: string;
}
export interface Registry {
    version: string;
    generatedAt: string;
    entries: RegistryEntry[];
}
export declare class MastorsRegistry {
    private _entries;
    private _parser;
    private _context;
    private _initialised;
    private _initialising;
    /** Currently detected alias (defaults to 'mc') */
    private _alias;
    private _aliasValid;
    constructor(context: vscode.ExtensionContext);
    initialise(): Promise<void>;
    refresh(): Promise<void>;
    clearCache(): Promise<void>;
    generateRegistryJson(context: vscode.ExtensionContext): Promise<string | null>;
    getAllEntries(): RegistryEntry[];
    getByCategory(category: Category): RegistryEntry[];
    get(name: string): RegistryEntry | undefined;
    size(): number;
    get isReady(): boolean;
    get alias(): string;
    invalidateAlias(): void;
    resolveAlias(documentText: string): string;
    private _parseAndBuild;
    private _populateMap;
    private _resolveCorePath;
    private _cachePath;
    private _loadCache;
    private _saveCache;
}
export declare const BUILT_IN_REGISTRY: RegistryEntry[];
//# sourceMappingURL=mastorsRegistry.d.ts.map