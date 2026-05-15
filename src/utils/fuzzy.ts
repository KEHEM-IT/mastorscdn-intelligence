// =============================================================================
// Mastors CDN Core intelligence
// utils/fuzzy.ts — Lightweight fuzzy matching (wraps Fuse.js)
// =============================================================================

import Fuse from 'fuse.js';
import type { RegistryEntry } from '../registry/mastorsRegistry';

let _fuse: Fuse<RegistryEntry> | undefined;

export function buildFuseIndex(entries: RegistryEntry[]): void {
  _fuse = new Fuse(entries, {
    keys: ['name', 'description', 'category'],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 1,
  });
}

/**
 * Fuzzy-search entries by query string.
 * Returns entries sorted by score (best match first).
 */
export function fuzzySearch(query: string, entries: RegistryEntry[]): RegistryEntry[] {
  if (!_fuse || query.length === 0) return entries;
  const results = _fuse.search(query);
  return results.map((r) => r.item);
}

/**
 * Rebuild index (e.g. after registry refresh).
 */
export function invalidateFuseIndex(): void {
  _fuse = undefined;
}
