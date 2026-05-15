import type { RegistryEntry } from '../registry/mastorsRegistry';
export declare class MastorsParser {
    /**
     * Parse all SCSS source files under `scssRoot` and return a full
     * RegistryEntry array. Falls back to BUILT_IN_REGISTRY for any entry
     * that could not be parsed from source.
     */
    parseFromSource(scssRoot: string): Promise<RegistryEntry[]>;
    private _findScssFiles;
    /**
     * Read token files and attach real key lists to matching registry entries.
     * E.g. _colors.scss → enriches color() entry with actual palette keys.
     */
    private _enrichWithTokenValues;
}
//# sourceMappingURL=mastorsParser.d.ts.map