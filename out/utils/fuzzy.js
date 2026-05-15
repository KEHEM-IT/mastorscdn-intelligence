"use strict";
// =============================================================================
// Mastors CDN Core IntelliSense
// utils/fuzzy.ts — Lightweight fuzzy matching (wraps Fuse.js)
// =============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFuseIndex = buildFuseIndex;
exports.fuzzySearch = fuzzySearch;
exports.invalidateFuseIndex = invalidateFuseIndex;
const fuse_js_1 = __importDefault(require("fuse.js"));
let _fuse;
function buildFuseIndex(entries) {
    _fuse = new fuse_js_1.default(entries, {
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
function fuzzySearch(query, entries) {
    if (!_fuse || query.length === 0)
        return entries;
    const results = _fuse.search(query);
    return results.map((r) => r.item);
}
/**
 * Rebuild index (e.g. after registry refresh).
 */
function invalidateFuseIndex() {
    _fuse = undefined;
}
//# sourceMappingURL=fuzzy.js.map