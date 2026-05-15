#!/usr/bin/env ts-node
// =============================================================================
// Mastors CDN Core IntelliSense
// scripts/generateRegistry.ts
//
// Standalone script that:
//   1. Reads all SCSS source files from a given Mastors Core path
//   2. Extracts functions, mixins, and token values
//   3. Writes a typed JSON registry to:
//        src/registry/mastors-registry.generated.json
//        dist/mastors-registry.generated.json  (if dist/ exists)
//
// Usage:
//   npm run generate-registry
//   npx ts-node scripts/generateRegistry.ts [path-to-core-scss]
//
// The generated JSON file is imported by mastorsRegistry.ts as a static
// fallback, so the extension works even without node_modules/@mastorscdn/core.
// =============================================================================

import * as fs   from 'fs';
import * as path from 'path';

// ── Types (inline — no import needed for a standalone script) ─────────────────

type EntryType = 'function' | 'mixin' | 'variable';

type Category =
  | 'color' | 'shadow' | 'radius' | 'z-index' | 'opacity'
  | 'breakpoint' | 'motion' | 'border' | 'math' | 'layout'
  | 'responsive' | 'typography' | 'effect' | 'utility' | 'map';

interface ParamDef {
  name:         string;
  type?:        string;
  default?:     string;
  description?: string;
}

interface RegistryEntry {
  name:        string;
  type:        EntryType;
  category:    Category;
  description: string;
  params:      ParamDef[];
  values?:     string[];
  returns?:    string;
  example?:    string;
  snippet?:    string;
}

interface Registry {
  version:     string;
  generatedAt: string;
  coreRoot:    string;
  entries:     RegistryEntry[];
}

// ── Regex patterns ─────────────────────────────────────────────────────────────

const FN_REGEX     = /^@function\s+([\w-]+)\s*\(([^)]*)\)\s*\{/gm;
const MIXIN_REGEX  = /^@mixin\s+([\w-]+)\s*\(([^)]*)\)?\s*\{/gm;
const MAP_KEY_REGEX = /^\s*'([\w-]+)'\s*:/gm;
const COMMENT_REGEX = /^\/\/\s*(?:-+\s*)?(.+?)(?:\s*-+)?\s*$/;

// ── Category inference ─────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, Category> = {
  color: 'color', semantic: 'color', shadow: 'shadow', radius: 'radius',
  'border-radius': 'radius', z: 'z-index', layer: 'z-index',
  opacity: 'opacity', breakpoint: 'breakpoint', container: 'layout',
  'aspect-ratio': 'layout', 'flex-center': 'layout', 'absolute-center': 'layout',
  cover: 'layout', duration: 'motion', easing: 'motion', transition: 'motion',
  'smooth-transition': 'motion', 'hover-lift': 'effect',
  'prefers-reduced-motion': 'motion', 'border-width': 'border',
  rem: 'math', em: 'math', 'strip-unit': 'math', fluid: 'typography',
  percent: 'math', 'mastors-map-get': 'map', 'mastors-map-merge': 'map',
  truncate: 'typography', 'line-clamp': 'typography',
  up: 'responsive', down: 'responsive', between: 'responsive', only: 'responsive',
  hover: 'responsive', 'prefers-dark': 'responsive', print: 'responsive',
  portrait: 'responsive', landscape: 'responsive',
  glassmorphism: 'effect', neumorphism: 'effect',
  'custom-scrollbar': 'utility', 'focus-ring': 'utility', 'focus-visible': 'utility',
  'loading-state': 'utility', 'skeleton-loading': 'utility',
  'visually-hidden': 'utility', 'visually-visible': 'utility',
  'generate-vars': 'utility', 'generate-all-vars': 'utility',
  'generate-all-vars-if-enabled': 'utility',
};

function inferCategory(name: string, filePath: string): Category {
  if (CATEGORY_MAP[name]) return CATEGORY_MAP[name];
  const seg = filePath.replace(/\\/g, '/');
  if (seg.includes('/functions/')) {
    if (seg.includes('math')) return 'math';
    if (seg.includes('map'))  return 'map';
    return 'utility';
  }
  if (seg.includes('/mixins/')) {
    if (seg.includes('responsive')) return 'responsive';
    return 'utility';
  }
  return 'utility';
}

// ── Parameter parser ───────────────────────────────────────────────────────────

function parseParams(rawParams: string): ParamDef[] {
  if (!rawParams.trim()) return [];
  return rawParams.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const colonIdx = p.indexOf(':');
    if (colonIdx === -1) return { name: p.replace(/^\$/, '').trim() };
    return {
      name:    p.slice(0, colonIdx).replace(/^\$/, '').trim(),
      default: p.slice(colonIdx + 1).trim(),
    };
  });
}

// ── File scanner ───────────────────────────────────────────────────────────────

function scanFile(filePath: string): RegistryEntry[] {
  let src: string;
  try { src = fs.readFileSync(filePath, 'utf-8'); }
  catch { return []; }

  const entries: RegistryEntry[] = [];
  const lines = src.split('\n');

  function commentAbove(lineIndex: number): string {
    if (lineIndex <= 0) return '';
    const above = lines[lineIndex - 1]?.trim() ?? '';
    const m = above.match(COMMENT_REGEX);
    return m ? m[1].trim() : '';
  }

  let m: RegExpExecArray | null;

  // Functions
  FN_REGEX.lastIndex = 0;
  while ((m = FN_REGEX.exec(src)) !== null) {
    const name     = m[1];
    const lineIdx  = src.slice(0, m.index).split('\n').length - 1;
    entries.push({
      name,
      type:        'function',
      category:    inferCategory(name, filePath),
      description: commentAbove(lineIdx) || `Returns a value from ${name}().`,
      params:      parseParams(m[2] ?? ''),
    });
  }

  // Mixins
  MIXIN_REGEX.lastIndex = 0;
  while ((m = MIXIN_REGEX.exec(src)) !== null) {
    const name    = m[1];
    const lineIdx = src.slice(0, m.index).split('\n').length - 1;
    entries.push({
      name,
      type:        'mixin',
      category:    inferCategory(name, filePath),
      description: commentAbove(lineIdx) || `Applies the ${name} mixin.`,
      params:      parseParams(m[2] ?? ''),
    });
  }

  return entries;
}

// ── File walker ────────────────────────────────────────────────────────────────

function walkScss(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', 'vendors', 'dist'].includes(entry.name)) {
        walk(full);
      } else if (entry.isFile() && /\.(scss|sass)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

// ── Token value extractor ──────────────────────────────────────────────────────

const TOKEN_FILE_MAP: Record<string, string[]> = {
  '_colors.scss':      ['color', 'semantic'],
  '_shadows.scss':     ['shadow'],
  '_radius.scss':      ['radius'],
  '_zindex.scss':      ['z', 'layer'],
  '_opacity.scss':     ['opacity'],
  '_breakpoints.scss': ['breakpoint', 'container'],
  '_motion.scss':      ['duration', 'easing', 'transition'],
  '_borders.scss':     ['border-width', 'aspect-ratio'],
};

function enrichWithTokenValues(
  scssRoot: string,
  byName: Map<string, RegistryEntry>
): void {
  const tokenDir = path.join(scssRoot, 'tokens');
  if (!fs.existsSync(tokenDir)) return;

  for (const [file, fnNames] of Object.entries(TOKEN_FILE_MAP)) {
    const filePath = path.join(tokenDir, file);
    if (!fs.existsSync(filePath)) continue;

    const src    = fs.readFileSync(filePath, 'utf-8');
    const keys: string[] = [];
    let m: RegExpExecArray | null;

    MAP_KEY_REGEX.lastIndex = 0;
    while ((m = MAP_KEY_REGEX.exec(src)) !== null) keys.push(m[1]);
    if (!keys.length) continue;

    for (const fnName of fnNames) {
      const entry = byName.get(fnName);
      if (entry && !entry.values) entry.values = keys;
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Resolve core SCSS root ──
  const args        = process.argv.slice(2);
  const defaultCore = path.resolve(__dirname, '..', '..', 'Mastors Core', 'scss');
  const coreRoot    = args[0] ? path.resolve(args[0]) : defaultCore;

  if (!fs.existsSync(coreRoot)) {
    console.error(`\n❌  Could not find Mastors Core SCSS at:\n   ${coreRoot}\n`);
    console.error(`Usage: ts-node scripts/generateRegistry.ts [path-to-scss]\n`);
    process.exit(1);
  }

  console.log(`\n📂  Scanning: ${coreRoot}`);

  // ── Collect entries ──
  const scssFiles = walkScss(coreRoot);
  console.log(`   Found ${scssFiles.length} SCSS files`);

  const byName = new Map<string, RegistryEntry>();
  for (const file of scssFiles) {
    for (const entry of scanFile(file)) {
      const existing = byName.get(entry.name);
      if (!existing || entry.params.length > existing.params.length) {
        byName.set(entry.name, entry);
      }
    }
  }

  // ── Enrich with token values ──
  enrichWithTokenValues(coreRoot, byName);

  const entries = Array.from(byName.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );

  // ── Build registry object ──
  const registry: Registry = {
    version:     '1.0.0',
    generatedAt: new Date().toISOString(),
    coreRoot,
    entries,
  };

  // ── Write outputs ──
  const outDir1 = path.resolve(__dirname, '..', 'src', 'registry');
  const outDir2 = path.resolve(__dirname, '..', 'dist');

  const filename = 'mastors-registry.generated.json';

  fs.mkdirSync(outDir1, { recursive: true });
  const out1 = path.join(outDir1, filename);
  fs.writeFileSync(out1, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`\n✅  Registry written to:\n   ${out1}`);

  if (fs.existsSync(outDir2)) {
    const out2 = path.join(outDir2, filename);
    fs.writeFileSync(out2, JSON.stringify(registry, null, 2), 'utf-8');
    console.log(`   ${out2}`);
  }

  // ── Summary ──
  const byType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  const byCategory = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n📊  Summary:`);
  console.log(`   Total entries : ${entries.length}`);
  console.log(`   By type       : ${JSON.stringify(byType)}`);
  console.log(`   By category   :`);
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`     ${cat.padEnd(14)} ${count}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
