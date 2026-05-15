import type { RegistryEntry } from '../registry/mastorsRegistry';
export declare function buildFuseIndex(entries: RegistryEntry[]): void;
/**
 * Fuzzy-search entries by query string.
 * Returns entries sorted by score (best match first).
 */
export declare function fuzzySearch(query: string, entries: RegistryEntry[]): RegistryEntry[];
/**
 * Rebuild index (e.g. after registry refresh).
 */
export declare function invalidateFuseIndex(): void;
//# sourceMappingURL=fuzzy.d.ts.map