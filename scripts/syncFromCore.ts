#!/usr/bin/env ts-node
// =============================================================================
// Mastors CDN Intelligence — Auto-Sync Script
// scripts/syncFromCore.ts
//
// PURPOSE:
//   Reads all SCSS token & mixin files from Mastors Core and automatically
//   regenerates the BUILT_IN_REGISTRY inside mastorsRegistry.ts and the
//   CATEGORY_MAP inside mastorsParser.ts, so the extension always reflects
//   the latest @mastorscdn/core without manual edits.
//
// USAGE:
//   npm run sync-registry
//   npx ts-node scripts/syncFromCore.ts [path-to-mastors-core-scss]
//
//   Default core path: auto-detected from candidate list (see CORE_CANDIDATES)
//   Override:          npx ts-node scripts/syncFromCore.ts "D:/Web/Mastors Core/scss"
//
// WHAT IT UPDATES:
//   1. src/registry/mastorsRegistry.ts  — BUILT_IN_REGISTRY constant block
//   2. src/parser/mastorsParser.ts      — CATEGORY_MAP constant block
//   3. scripts/generateRegistry.ts      — CATEGORY_MAP constant block
//   4. src/registry/mastors-registry.generated.json (full JSON snapshot)
//
// HOW IT WORKS:
//   - Parses every scss/tokens/_*.scss  → extracts map keys as token values
//   - Parses every scss/functions/*.scss → extracts @function signatures
//   - Parses every scss/mixins/*.scss    → extracts @mixin signatures
//   - Parses scss/abstracts/_placeholders.scss → extracts %placeholder names
//   - Builds rich RegistryEntry objects for every known API member
//   - Injects them as a TypeScript literal block between sync markers
//
// SYNC MARKERS (must exist in target files — do not remove them):
//   // @@SYNC:REGISTRY:START
//   // @@SYNC:REGISTRY:END
//
//   // @@SYNC:CATEGORYMAP:START
//   // @@SYNC:CATEGORYMAP:END
// =============================================================================

import * as fs   from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type EntryType = 'function' | 'mixin' | 'variable';

type Category =
  | 'color' | 'shadow' | 'radius' | 'z-index' | 'opacity'
  | 'breakpoint' | 'motion' | 'border' | 'math' | 'layout'
  | 'responsive' | 'typography' | 'effect' | 'utility' | 'map' | 'placeholder';

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

interface TokenMap {
  [key: string]: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const SCRIPT_DIR  = __dirname;
const EXT_ROOT    = path.resolve(SCRIPT_DIR, '..');

// Candidate paths to auto-detect Mastors Core (searched in order):
//   1. CLI argument override
//   2. D:\Web\Mastors Core\scss          (actual monorepo layout)
//   3. D:\Web\Mastors CDN\Mastors Core\scss  (alternative layout)
//   4. ../../../Mastors Core/scss        (generic relative fallback)
const CORE_CANDIDATES: string[] = [
  path.resolve('D:\\Web\\Mastors Core\\scss'),
  path.resolve('D:\\Web\\Mastors CDN\\Mastors Core\\scss'),
  path.resolve(EXT_ROOT, '..', '..', 'Mastors Core', 'scss'),
  path.resolve(EXT_ROOT, '..', 'Mastors Core', 'scss'),
];

function resolveCorePath(override?: string): string {
  if (override) {
    const p = path.resolve(override);
    if (fs.existsSync(p)) return p;
    console.error(`❌  Provided path does not exist: ${p}`);
    process.exit(1);
  }
  for (const candidate of CORE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Nothing found — print helpful error
  console.error('❌  Could not auto-detect Mastors Core SCSS directory.');
  console.error('    Tried:');
  for (const c of CORE_CANDIDATES) console.error(`      ${c}`);
  console.error('\n    Pass the path explicitly:');
  console.error('    npx ts-node scripts/syncFromCore.ts "D:\\Web\\Mastors Core\\scss"\n');
  process.exit(1);
}

const CORE_ROOT = resolveCorePath(args[0]);

const REGISTRY_FILE   = path.join(EXT_ROOT, 'src', 'registry', 'mastorsRegistry.ts');
const PARSER_FILE     = path.join(EXT_ROOT, 'src', 'parser', 'mastorsParser.ts');
const GEN_SCRIPT_FILE = path.join(EXT_ROOT, 'scripts', 'generateRegistry.ts');
const JSON_OUT_FILE   = path.join(EXT_ROOT, 'src', 'registry', 'mastors-registry.generated.json');

// ─────────────────────────────────────────────────────────────────────────────
// REGEX
// ─────────────────────────────────────────────────────────────────────────────

const MAP_KEY_RE       = /^\s*'([\w-]+)'\s*:/gm;
const FN_RE            = /^@function\s+([\w-]+)\s*\(([^)]*)\)\s*\{/gm;
const MIXIN_RE         = /^@mixin\s+([\w-]+)\s*\(([^)]*)\)?\s*\{/gm;
const PLACEHOLDER_RE   = /^%([\w-]+)\s*\{/gm;
const PARAM_RE         = /^\$([\w-]+)(?:\s*:\s*([^,)]+))?/;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function readFile(p: string): string {
  try { return fs.readFileSync(p, 'utf-8'); }
  catch { return ''; }
}

function extractMapKeys(src: string): string[] {
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  MAP_KEY_RE.lastIndex = 0;
  while ((m = MAP_KEY_RE.exec(src)) !== null) keys.push(m[1]);
  return keys;
}

function parseParam(raw: string): ParamDef {
  const m = raw.trim().match(PARAM_RE);
  if (!m) return { name: raw.trim().replace(/^\$/, '') };
  return {
    name: m[1],
    ...(m[2] ? { default: m[2].trim() } : {}),
  };
}

function parseParams(rawStr: string): ParamDef[] {
  if (!rawStr.trim()) return [];
  return rawStr.split(',').map(p => parseParam(p.trim())).filter(p => p.name);
}

function indent(str: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return str.split('\n').map(l => l ? pad + l : l).join('\n');
}

function jStr(v: string): string {
  return JSON.stringify(v);
}

function walkScss(root: string, skipDirs = ['node_modules', 'vendors', 'dist']): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !skipDirs.includes(e.name)) walk(full);
      else if (e.isFile() && /\.(scss|sass)$/.test(e.name)) files.push(full);
    }
  };
  walk(root);
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Extract all token values from token files
// ─────────────────────────────────────────────────────────────────────────────

interface TokenData {
  colorKeys:      string[];
  semanticKeys:   string[];
  shadowKeys:     string[];
  radiusKeys:     string[];
  zindexKeys:     string[];
  layerKeys:      string[];
  opacityKeys:    string[];
  breakpointKeys: string[];
  containerKeys:  string[];
  durationKeys:   string[];
  easingKeys:     string[];
  transitionKeys: string[];
  borderWidthKeys: string[];
  aspectRatioKeys: string[];
}

function extractTokenData(coreRoot: string): TokenData {
  const tokenDir = path.join(coreRoot, 'tokens');
  const read     = (f: string) => readFile(path.join(tokenDir, f));

  const colorsSrc      = read('_colors.scss');
  const shadowsSrc     = read('_shadows.scss');
  const radiusSrc      = read('_radius.scss');
  const zindexSrc      = read('_zindex.scss');
  const opacitySrc     = read('_opacity.scss');
  const breakpointsSrc = read('_breakpoints.scss');
  const motionSrc      = read('_motion.scss');
  const bordersSrc     = read('_borders.scss');

  // Color map ($mastors-colors) vs semantic ($mastors-semantic)
  // Split by the semantic comment line
  const semanticIdx  = colorsSrc.indexOf('$mastors-semantic');
  const colorPart    = semanticIdx > -1 ? colorsSrc.slice(0, semanticIdx) : colorsSrc;
  const semanticPart = semanticIdx > -1 ? colorsSrc.slice(semanticIdx) : '';

  // Z-index: split between $mastors-z-index and $mastors-layers
  const layersIdx  = zindexSrc.indexOf('$mastors-layers');
  const zPart      = layersIdx > -1 ? zindexSrc.slice(0, layersIdx) : zindexSrc;
  const layerPart  = layersIdx > -1 ? zindexSrc.slice(layersIdx) : '';

  // Breakpoints: split between $mastors-breakpoints and $mastors-containers
  const containerIdx  = breakpointsSrc.indexOf('$mastors-containers');
  const bpPart        = containerIdx > -1 ? breakpointsSrc.slice(0, containerIdx) : breakpointsSrc;
  const containerPart = containerIdx > -1 ? breakpointsSrc.slice(containerIdx) : '';

  // Motion: split between durations, easings, transitions
  const easingsIdx     = motionSrc.indexOf('$mastors-easings');
  const transitionsIdx = motionSrc.indexOf('$mastors-transitions');
  const durationPart   = easingsIdx > -1 ? motionSrc.slice(0, easingsIdx) : motionSrc;
  const easingPart     = easingsIdx > -1 && transitionsIdx > -1
    ? motionSrc.slice(easingsIdx, transitionsIdx) : '';
  const transitionPart = transitionsIdx > -1 ? motionSrc.slice(transitionsIdx) : '';

  // Borders: split between border-widths and aspect-ratios
  const arIdx        = bordersSrc.indexOf('$mastors-aspect-ratios');
  const bwPart       = arIdx > -1 ? bordersSrc.slice(0, arIdx) : bordersSrc;
  const arPart       = arIdx > -1 ? bordersSrc.slice(arIdx) : '';

  return {
    colorKeys:       extractMapKeys(colorPart),
    semanticKeys:    extractMapKeys(semanticPart),
    shadowKeys:      extractMapKeys(shadowsSrc),
    radiusKeys:      extractMapKeys(radiusSrc),
    zindexKeys:      extractMapKeys(zPart),
    layerKeys:       extractMapKeys(layerPart),
    opacityKeys:     extractMapKeys(opacitySrc),
    breakpointKeys:  extractMapKeys(bpPart),
    containerKeys:   extractMapKeys(containerPart),
    durationKeys:    extractMapKeys(durationPart),
    easingKeys:      extractMapKeys(easingPart),
    transitionKeys:  extractMapKeys(transitionPart),
    borderWidthKeys: extractMapKeys(bwPart),
    aspectRatioKeys: extractMapKeys(arPart),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Extract mixin signatures from helper mixin files
// ─────────────────────────────────────────────────────────────────────────────

interface MixinInfo {
  name:   string;
  params: ParamDef[];
  src:    string; // source file segment for context
}

function extractMixins(coreRoot: string): MixinInfo[] {
  const mixinDir  = path.join(coreRoot, 'mixins');
  const scssFiles = walkScss(mixinDir);
  const results:  MixinInfo[] = [];

  for (const file of scssFiles) {
    const src = readFile(file);
    let m: RegExpExecArray | null;
    MIXIN_RE.lastIndex = 0;
    while ((m = MIXIN_RE.exec(src)) !== null) {
      results.push({
        name:   m[1],
        params: parseParams(m[2] ?? ''),
        src:    file,
      });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Extract function signatures
// ─────────────────────────────────────────────────────────────────────────────

interface FnInfo {
  name:   string;
  params: ParamDef[];
  src:    string;
}

function extractFunctions(coreRoot: string): FnInfo[] {
  const fnDir    = path.join(coreRoot, 'functions');
  const scssFiles = walkScss(fnDir);
  const results: FnInfo[] = [];

  for (const file of scssFiles) {
    const src = readFile(file);
    let m: RegExpExecArray | null;
    FN_RE.lastIndex = 0;
    while ((m = FN_RE.exec(src)) !== null) {
      results.push({
        name:   m[1],
        params: parseParams(m[2] ?? ''),
        src:    file,
      });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Extract placeholder names
// ─────────────────────────────────────────────────────────────────────────────

function extractPlaceholders(coreRoot: string): string[] {
  const abstractsDir = path.join(coreRoot, 'abstracts');
  const scssFiles    = walkScss(abstractsDir);
  const names: string[] = [];

  for (const file of scssFiles) {
    const src = readFile(file);
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(src)) !== null) names.push(m[1]);
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Build the full RegistryEntry array
// ─────────────────────────────────────────────────────────────────────────────

function buildSnippetValues(values: string[]): string {
  return `'\${1|${values.join(',')}|}'`;
}

function buildRegistry(
  tokens: TokenData,
  mixins: MixinInfo[],
  fns:    FnInfo[],
  placeholders: string[]
): RegistryEntry[] {

  // ── Helper to find parsed mixin params ──
  const mixinParams  = (name: string) =>
    mixins.find(m => m.name === name)?.params ?? [];
  const fnParams     = (name: string) =>
    fns.find(f => f.name === name)?.params ?? [];

  const entries: RegistryEntry[] = [];

  // ── COLOR FUNCTION ──
  entries.push({
    name: 'color',
    type: 'function',
    category: 'color',
    description: 'Returns a color value from the Mastors color palette. Accepts brand, status, neutral, surface, and transparent color keys.',
    params: [
      { name: 'key',      type: 'String',      description: "Color token key, e.g. 'primary', 'neutral-500'" },
      { name: 'fallback', type: 'Color|null',  default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.colorKeys,
    returns: 'Color',
    example: "color: mc.color('primary');\nbackground: mc.color('neutral-100', #f5f5f5);",
    snippet: buildSnippetValues(tokens.colorKeys),
  });

  // ── SEMANTIC FUNCTION ──
  entries.push({
    name: 'semantic',
    type: 'function',
    category: 'color',
    description: 'Returns a semantic color token — text, background, or border roles that adapt to the active theme.',
    params: [
      { name: 'key',      type: 'String',     description: "Semantic key, e.g. 'text-primary', 'bg-body'" },
      { name: 'fallback', type: 'Color|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.semanticKeys,
    returns: 'Color',
    example: "color: mc.semantic('text-primary');\nborder-color: mc.semantic('border-focus');",
    snippet: buildSnippetValues(tokens.semanticKeys),
  });

  // ── SHADOW FUNCTION ──
  entries.push({
    name: 'shadow',
    type: 'function',
    category: 'shadow',
    description: 'Returns a box-shadow value from the Mastors shadow scale.',
    params: [
      { name: 'key',      type: 'String',   description: "Shadow key, e.g. 'md', 'primary', 'dark-lg'" },
      { name: 'fallback', type: 'any|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.shadowKeys,
    returns: 'String (box-shadow)',
    example: "box-shadow: mc.shadow('md');\nbox-shadow: mc.shadow('primary');",
    snippet: buildSnippetValues(tokens.shadowKeys),
  });

  // ── RADIUS FUNCTION ──
  entries.push({
    name: 'radius',
    type: 'function',
    category: 'radius',
    description: 'Returns a border-radius value from the Mastors radius scale.',
    params: [
      { name: 'key',      type: 'String',   description: "Radius key, e.g. 'sm', 'full'" },
      { name: 'fallback', type: 'any|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.radiusKeys,
    returns: 'Length',
    example: "border-radius: mc.radius('md');\nborder-radius: mc.radius('full');",
    snippet: buildSnippetValues(tokens.radiusKeys),
  });

  // ── Z FUNCTION ──
  entries.push({
    name: 'z',
    type: 'function',
    category: 'z-index',
    description: 'Returns a z-index value from the Mastors UI stacking scale.',
    params: [
      { name: 'key',      type: 'String',      description: "Z-index key, e.g. 'modal', 'tooltip'" },
      { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.zindexKeys,
    returns: 'Number',
    example: "z-index: mc.z('modal');\nz-index: mc.z('tooltip');",
    snippet: buildSnippetValues(tokens.zindexKeys),
  });

  // ── LAYER FUNCTION ──
  entries.push({
    name: 'layer',
    type: 'function',
    category: 'z-index',
    description: 'Returns a structural CSS layer z-index (page, ui, nav, panel, dialog, critical).',
    params: [
      { name: 'key',      type: 'String',      description: "Layer key, e.g. 'nav', 'dialog'" },
      { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.layerKeys,
    returns: 'Number',
    example: "z-index: mc.layer('nav');",
    snippet: buildSnippetValues(tokens.layerKeys),
  });

  // ── OPACITY FUNCTION ──
  entries.push({
    name: 'opacity',
    type: 'function',
    category: 'opacity',
    description: 'Returns an opacity value (0–1) from the Mastors opacity scale.',
    params: [
      { name: 'key',      type: 'String',      description: "Opacity key, e.g. '50', '75'" },
      { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.opacityKeys,
    returns: 'Number (0-1)',
    example: "opacity: mc.opacity('75'); // => 0.75",
    snippet: buildSnippetValues(tokens.opacityKeys),
  });

  // ── BREAKPOINT FUNCTION ──
  entries.push({
    name: 'breakpoint',
    type: 'function',
    category: 'breakpoint',
    description: 'Returns a breakpoint pixel value from the Mastors breakpoint scale.',
    params: [
      { name: 'key',      type: 'String',      description: "Breakpoint key ('xs'..'3xl')" },
      { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.breakpointKeys,
    returns: 'Length (px)',
    example: "max-width: mc.breakpoint('lg'); // => 992px",
    snippet: buildSnippetValues(tokens.breakpointKeys),
  });

  // ── CONTAINER FUNCTION ──
  entries.push({
    name: 'container',
    type: 'function',
    category: 'layout',
    description: 'Returns a container max-width from the Mastors container scale.',
    params: [
      { name: 'key',      type: 'String',      description: "Container key ('xs'..'3xl', 'fluid')" },
      { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.containerKeys,
    returns: 'Length',
    example: "max-width: mc.container('xl'); // => 1140px",
    snippet: buildSnippetValues(tokens.containerKeys),
  });

  // ── DURATION FUNCTION ──
  entries.push({
    name: 'duration',
    type: 'function',
    category: 'motion',
    description: 'Returns an animation/transition duration from the Mastors motion scale.',
    params: [
      { name: 'key',      type: 'String',    description: "Duration key, e.g. 'normal', 'fast'" },
      { name: 'fallback', type: 'Time|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.durationKeys,
    returns: 'Time (ms)',
    example: "transition-duration: mc.duration('normal'); // => 200ms",
    snippet: buildSnippetValues(tokens.durationKeys),
  });

  // ── EASING FUNCTION ──
  entries.push({
    name: 'easing',
    type: 'function',
    category: 'motion',
    description: 'Returns a cubic-bezier easing string from the Mastors easing library.',
    params: [
      { name: 'key',      type: 'String',      description: "Easing key, e.g. 'spring', 'ease-in-out'" },
      { name: 'fallback', type: 'String|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.easingKeys,
    returns: 'String (cubic-bezier)',
    example: "transition-timing-function: mc.easing('spring');",
    snippet: buildSnippetValues(tokens.easingKeys),
  });

  // ── TRANSITION FUNCTION ──
  entries.push({
    name: 'transition',
    type: 'function',
    category: 'motion',
    description: 'Returns a full CSS transition shorthand string from the Mastors transition presets.',
    params: [
      { name: 'key',      type: 'String',      description: "Transition preset key, e.g. 'colors', 'transform'" },
      { name: 'fallback', type: 'String|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.transitionKeys,
    returns: 'String',
    example: "transition: mc.transition('colors');",
    snippet: buildSnippetValues(tokens.transitionKeys),
  });

  // ── BORDER-WIDTH FUNCTION ──
  entries.push({
    name: 'border-width',
    type: 'function',
    category: 'border',
    description: 'Returns a border width value from the Mastors border-width scale.',
    params: [
      { name: 'key',      type: 'String',      description: "Border width key: '0', '1', '2', '4', '8'" },
      { name: 'fallback', type: 'Length|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.borderWidthKeys,
    returns: 'Length (px)',
    example: "border-width: mc.border-width('2'); // => 2px",
    snippet: buildSnippetValues(tokens.borderWidthKeys),
  });

  // ── ASPECT-RATIO FUNCTION ──
  entries.push({
    name: 'aspect-ratio',
    type: 'function',
    category: 'layout',
    description: 'Returns a numeric aspect ratio value from the Mastors ratio presets.',
    params: [
      { name: 'key',      type: 'String',      description: "Aspect ratio key, e.g. 'video', 'square'" },
      { name: 'fallback', type: 'Number|null', default: 'null', description: 'Fallback if key not found' },
    ],
    values:  tokens.aspectRatioKeys,
    returns: 'Number',
    example: "aspect-ratio: mc.aspect-ratio('video'); // => 1.7778",
    snippet: buildSnippetValues(tokens.aspectRatioKeys),
  });

  // ── MATH FUNCTIONS (parsed from source, static docs) ──
  const mathFns: RegistryEntry[] = [
    {
      name: 'rem',
      type: 'function',
      category: 'math',
      description: 'Converts a unitless pixel value to rem using math.div($px, $base) * 1rem.',
      params: fnParams('rem').length ? fnParams('rem') : [
        { name: 'px',   type: 'Number', description: 'Pixel value (unitless)' },
        { name: 'base', type: 'Number', default: '16', description: 'Base font size' },
      ],
      returns: 'Length (rem)',
      example: "font-size: mc.rem(18); // => 1.125rem",
      snippet: '${1:16}',
    },
    {
      name: 'em',
      type: 'function',
      category: 'math',
      description: 'Converts a unitless pixel value to em.',
      params: fnParams('em').length ? fnParams('em') : [
        { name: 'px',   type: 'Number', description: 'Pixel value (unitless)' },
        { name: 'base', type: 'Number', default: '16', description: 'Base font size' },
      ],
      returns: 'Length (em)',
      example: "margin: mc.em(24); // => 1.5em",
      snippet: '${1:16}',
    },
    {
      name: 'strip-unit',
      type: 'function',
      category: 'math',
      description: 'Removes the CSS unit from a value, returning a plain unitless number.',
      params: fnParams('strip-unit').length ? fnParams('strip-unit') : [
        { name: 'value', type: 'Length', description: 'Any CSS value with a unit, e.g. 24px' },
      ],
      returns: 'Number',
      example: '$n: mc.strip-unit(24px); // => 24',
      snippet: '${1:$value}',
    },
    {
      name: 'fluid',
      type: 'function',
      category: 'typography',
      description: 'Generates a CSS clamp() expression for fluid/responsive sizing.',
      params: fnParams('fluid').length ? fnParams('fluid') : [
        { name: 'min',    type: 'Length', description: 'Minimum size' },
        { name: 'max',    type: 'Length', description: 'Maximum size' },
        { name: 'min-vw', type: 'Length', default: '320px',  description: 'Viewport at min' },
        { name: 'max-vw', type: 'Length', default: '1440px', description: 'Viewport at max' },
      ],
      returns: 'clamp() expression',
      example: "font-size: mc.fluid(16px, 24px);",
      snippet: '${1:16px}, ${2:24px}',
    },
    {
      name: 'percent',
      type: 'function',
      category: 'math',
      description: 'Returns a CSS percentage.',
      params: fnParams('percent').length ? fnParams('percent') : [
        { name: 'value', type: 'Number', description: 'Numerator' },
        { name: 'total', type: 'Number', default: '100', description: 'Denominator' },
      ],
      returns: 'Percentage',
      example: 'width: mc.percent(4, 12); // => 33.333%',
      snippet: '${1:4}, ${2:12}',
    },
    {
      name: 'mastors-map-get',
      type: 'function',
      category: 'map',
      description: 'Safe map.get() with type validation and @warn logging.',
      params: [
        { name: 'map',     type: 'Map',    description: 'The SCSS map to query' },
        { name: 'key',     type: 'String', description: 'Key to look up' },
        { name: 'fallback', type: 'any',   default: 'null', description: 'Fallback value' },
        { name: 'context', type: 'String', default: "'mastors'", description: 'Warning label' },
      ],
      returns: 'any',
      example: "$val: mc.mastors-map-get($my-map, 'primary');",
      snippet: "${1:\\$map}, '${2:key}'",
    },
    {
      name: 'mastors-map-merge',
      type: 'function',
      category: 'map',
      description: 'Merges two SCSS maps. Keys in $map2 override $map1.',
      params: [
        { name: 'map1', type: 'Map', description: 'Base map' },
        { name: 'map2', type: 'Map', description: 'Map to merge in' },
      ],
      returns: 'Map',
      example: '$merged: mc.mastors-map-merge($colors, $overrides);',
      snippet: '${1:\\$map1}, ${2:\\$map2}',
    },
  ];
  entries.push(...mathFns);

  // ── RESPONSIVE MIXINS (from _responsive.scss) ──
  const bpValues = tokens.breakpointKeys.filter(k => k !== 'xs');
  const allBpValues = tokens.breakpointKeys;

  entries.push({
    name: 'up',
    type: 'mixin',
    category: 'responsive',
    description: 'Mobile-first min-width media query. xs (0px) emits no query — content is always applied.',
    params: mixinParams('up').length ? mixinParams('up') : [
      { name: 'bp', type: 'String', description: "Breakpoint key or custom px value" },
    ],
    values: allBpValues,
    example: "@include mc.up('md') {\n  font-size: 1.25rem;\n}",
    snippet: `up('\${1|${bpValues.join(',')}|}') {\n  \${0}\n}`,
  });

  entries.push({
    name: 'down',
    type: 'mixin',
    category: 'responsive',
    description: 'Max-width media query. Content applies below the given breakpoint.',
    params: mixinParams('down').length ? mixinParams('down') : [
      { name: 'bp', type: 'String', description: "Breakpoint key or custom px value" },
    ],
    values: bpValues,
    example: "@include mc.down('lg') {\n  display: none;\n}",
    snippet: `down('\${1|${bpValues.join(',')}|}') {\n  \${0}\n}`,
  });

  entries.push({
    name: 'between',
    type: 'mixin',
    category: 'responsive',
    description: 'Applies styles between two breakpoints using min-width AND max-width.',
    params: mixinParams('between').length ? mixinParams('between') : [
      { name: 'lower', type: 'String', description: 'Lower breakpoint key' },
      { name: 'upper', type: 'String', description: 'Upper breakpoint key' },
    ],
    example: "@include mc.between('sm', 'lg') {\n  padding: 1rem;\n}",
    snippet: "between('${1:sm}', '${2:lg}') {\n  ${0}\n}",
  });

  entries.push({
    name: 'only',
    type: 'mixin',
    category: 'responsive',
    description: 'Applies styles within a single breakpoint range.',
    params: mixinParams('only').length ? mixinParams('only') : [
      { name: 'bp', type: 'String', description: "Breakpoint key" },
    ],
    values: allBpValues,
    example: "@include mc.only('md') {\n  columns: 2;\n}",
    snippet: `only('\${1|${allBpValues.join(',')}|}') {\n  \${0}\n}`,
  });

  // ── NO-PARAM RESPONSIVE MIXINS ──
  const noParamResponsive: Array<{ name: string; description: string; example: string }> = [
    { name: 'hover',                   description: 'Wraps :hover in (hover: hover) and (pointer: fine). Prevents sticky hover on touch devices.', example: "@include mc.hover {\n  opacity: 0.85;\n}" },
    { name: 'prefers-dark',            description: 'Wraps content in a prefers-color-scheme: dark media query.', example: "@include mc.prefers-dark {\n  background: #111;\n}" },
    { name: 'prefers-reduced-motion',  description: 'Wraps content in a prefers-reduced-motion: reduce media query.', example: "@include mc.prefers-reduced-motion {\n  animation: none;\n}" },
    { name: 'print',                   description: 'Wraps content in a @media print query.', example: "@include mc.print {\n  display: none;\n}" },
    { name: 'portrait',                description: 'Applies styles when the device is in portrait orientation.', example: "@include mc.portrait {\n  flex-direction: column;\n}" },
    { name: 'landscape',               description: 'Applies styles when the device is in landscape orientation.', example: "@include mc.landscape {\n  flex-direction: row;\n}" },
  ];

  for (const nr of noParamResponsive) {
    const isMotion = nr.name === 'prefers-reduced-motion';
    entries.push({
      name:        nr.name,
      type:        'mixin',
      category:    isMotion ? 'motion' : 'responsive',
      description: nr.description,
      params:      [],
      example:     nr.example,
      snippet:     `${nr.name} {\n  \${0}\n}`,
    });
  }

  // ── HELPER MIXINS (from _helpers.scss) — derive params from parsed source ──
  const helperMixins: Array<Omit<RegistryEntry, 'params'> & { fallbackParams: ParamDef[] }> = [
    {
      name: 'absolute-center',
      type: 'mixin',
      category: 'layout',
      description: 'Absolutely positions an element at the center of its nearest positioned ancestor.',
      fallbackParams: [],
      example: '@include mc.absolute-center;',
      snippet: 'absolute-center',
    },
    {
      name: 'flex-center',
      type: 'mixin',
      category: 'layout',
      description: 'Sets display: flex; align-items: center; justify-content: center.',
      fallbackParams: [],
      example: '@include mc.flex-center;',
      snippet: 'flex-center',
    },
    {
      name: 'cover',
      type: 'mixin',
      category: 'layout',
      description: 'Fills parent completely: position: absolute; inset: 0; width/height: 100%.',
      fallbackParams: [],
      example: '@include mc.cover;',
      snippet: 'cover',
    },
    {
      name: 'truncate',
      type: 'mixin',
      category: 'typography',
      description: 'Truncates single-line text with an ellipsis.',
      fallbackParams: [],
      example: '@include mc.truncate;',
      snippet: 'truncate',
    },
    {
      name: 'line-clamp',
      type: 'mixin',
      category: 'typography',
      description: 'Clamps multi-line text to $lines with a trailing ellipsis.',
      fallbackParams: [{ name: 'lines', type: 'Number', default: '2', description: 'Max visible lines' }],
      example: '@include mc.line-clamp(3);',
      snippet: 'line-clamp(${1:3})',
    },
    {
      name: 'glassmorphism',
      type: 'mixin',
      category: 'effect',
      description: 'Applies a glassmorphism effect: backdrop-filter blur, translucent background, subtle border.',
      fallbackParams: [
        { name: 'blur',   type: 'Length', default: '16px',                       description: 'Blur radius' },
        { name: 'bg',     type: 'Color',  default: 'rgba(255, 255, 255, 0.12)',  description: 'Background color' },
        { name: 'border', type: 'Color',  default: 'rgba(255, 255, 255, 0.18)',  description: 'Border color' },
        { name: 'shadow', type: 'String', default: '0 8px 32px rgba(0,0,0,0.15)', description: 'Box-shadow' },
      ],
      example: '@include mc.glassmorphism;\n@include mc.glassmorphism(20px, rgba(255,255,255,0.15));',
      snippet: 'glassmorphism(${1:16px}, ${2:rgba(255,255,255,0.12)})',
    },
    {
      name: 'neumorphism',
      type: 'mixin',
      category: 'effect',
      description: 'Applies a neumorphism (soft-UI) effect with configurable dual shadows.',
      fallbackParams: [
        { name: 'bg',        type: 'Color',  default: '#e0e5ec',               description: 'Background color' },
        { name: 'light',     type: 'Color',  default: 'rgba(255,255,255,0.8)', description: 'Light shadow color' },
        { name: 'dark',      type: 'Color',  default: 'rgba(163,177,198,0.6)', description: 'Dark shadow color' },
        { name: 'intensity', type: 'Length', default: '6px',                   description: 'Shadow spread' },
      ],
      example: '@include mc.neumorphism(#e0e5ec);',
      snippet: 'neumorphism(${1:#e0e5ec})',
    },
    {
      name: 'hover-lift',
      type: 'mixin',
      category: 'effect',
      description: 'Adds a translateY lift and elevated shadow on hover (fine-pointer devices only).',
      fallbackParams: [
        { name: 'y',      type: 'Length', default: '-4px',                         description: 'Y-axis translation' },
        { name: 'shadow', type: 'String', default: '0 10px 20px rgba(0,0,0,0.15)', description: 'Box-shadow on hover' },
      ],
      example: '@include mc.hover-lift;\n@include mc.hover-lift(-6px);',
      snippet: 'hover-lift(${1:-4px})',
    },
    {
      name: 'custom-scrollbar',
      type: 'mixin',
      category: 'utility',
      description: 'Applies a custom-styled scrollbar.',
      fallbackParams: [
        { name: 'width',       type: 'Length', default: '6px',             description: 'Scrollbar width' },
        { name: 'track',       type: 'Color',  default: 'transparent',     description: 'Track color' },
        { name: 'thumb',       type: 'Color',  default: 'rgba(0,0,0,0.2)', description: 'Thumb color' },
        { name: 'thumb-hover', type: 'Color',  default: 'rgba(0,0,0,0.4)', description: 'Thumb hover color' },
      ],
      example: '@include mc.custom-scrollbar(8px, #f0f0f0, #ccc);',
      snippet: 'custom-scrollbar(${1:6px}, ${2:transparent}, ${3:rgba(0,0,0,0.2)})',
    },
    {
      name: 'focus-ring',
      type: 'mixin',
      category: 'utility',
      description: 'Applies an accessible focus ring (outline + outline-offset).',
      fallbackParams: [
        { name: 'color',  type: 'Color',  default: '#2563eb', description: 'Outline color' },
        { name: 'width',  type: 'Length', default: '3px',     description: 'Outline width' },
        { name: 'offset', type: 'Length', default: '2px',     description: 'Outline offset' },
        { name: 'style',  type: 'String', default: 'solid',   description: 'Outline style' },
      ],
      example: '@include mc.focus-ring;\n@include mc.focus-ring(#7c3aed, 2px);',
      snippet: 'focus-ring(${1:#2563eb})',
    },
    {
      name: 'focus-visible',
      type: 'mixin',
      category: 'utility',
      description: 'Removes default outline on :focus and applies focus-ring only on :focus-visible.',
      fallbackParams: [],
      example: '@include mc.focus-visible;',
      snippet: 'focus-visible',
    },
    {
      name: 'smooth-transition',
      type: 'mixin',
      category: 'motion',
      description: 'Applies a CSS transition shorthand with configurable properties, duration, and easing.',
      fallbackParams: [
        { name: 'props', type: 'String', default: 'all',                          description: 'CSS properties' },
        { name: 'dur',   type: 'Time',   default: '200ms',                         description: 'Duration' },
        { name: 'ease',  type: 'String', default: 'cubic-bezier(0.4, 0, 0.2, 1)', description: 'Timing function' },
      ],
      example: '@include mc.smooth-transition(opacity, 300ms);',
      snippet: 'smooth-transition(${1:all}, ${2:200ms})',
    },
    {
      name: 'loading-state',
      type: 'mixin',
      category: 'utility',
      description: 'Applies a disabled/loading visual state: pointer-events none, opacity 0.7, cursor wait.',
      fallbackParams: [],
      example: '&.is-loading { @include mc.loading-state; }',
      snippet: 'loading-state',
    },
    {
      name: 'skeleton-loading',
      type: 'mixin',
      category: 'utility',
      description: 'Applies an animated shimmer/skeleton loading effect.',
      fallbackParams: [
        { name: 'bg-from',  type: 'Color', default: '#e5e7eb', description: 'Start/end gradient color' },
        { name: 'bg-to',    type: 'Color', default: '#f3f4f6', description: 'Mid gradient highlight' },
        { name: 'duration', type: 'Time',  default: '1.5s',    description: 'Animation duration' },
      ],
      example: '@include mc.skeleton-loading;\n@include mc.skeleton-loading(#d1d5db, #e5e7eb, 2s);',
      snippet: 'skeleton-loading(${1:#e5e7eb}, ${2:#f3f4f6})',
    },
    {
      name: 'visually-hidden',
      type: 'mixin',
      category: 'utility',
      description: 'Hides an element visually while keeping it accessible to screen readers.',
      fallbackParams: [],
      example: '@include mc.visually-hidden;',
      snippet: 'visually-hidden',
    },
    {
      name: 'visually-visible',
      type: 'mixin',
      category: 'utility',
      description: 'Resets a visually-hidden element back to normal flow visibility.',
      fallbackParams: [],
      example: '&:focus { @include mc.visually-visible; }',
      snippet: 'visually-visible',
    },
  ];

  for (const hm of helperMixins) {
    const { fallbackParams, ...rest } = hm;
    const parsed = mixinParams(hm.name);
    entries.push({ ...rest, params: parsed.length ? parsed : fallbackParams });
  }

  // ── CSS VAR ENGINE MIXINS ──
  const cssVarMixins: RegistryEntry[] = [
    {
      name: 'generate-vars',
      type: 'mixin',
      category: 'utility',
      description: 'Generates CSS custom properties from any SCSS map, prefixed --mastors-{prefix}-{key}.',
      params: [
        { name: 'map',    type: 'Map',    description: 'SCSS map to emit as CSS vars' },
        { name: 'prefix', type: 'String', description: "Token group prefix, e.g. 'color'" },
        { name: 'root',   type: 'String', default: "':root'", description: 'Target selector' },
      ],
      example: "@include mc.generate-vars($my-map, 'spacing');",
      snippet: "generate-vars(${1:\\$map}, '${2:prefix}')",
    },
    {
      name: 'generate-all-vars',
      type: 'mixin',
      category: 'utility',
      description: 'Emits all Mastors Core CSS custom properties into :root.',
      params: [],
      example: '@include mc.generate-all-vars;',
      snippet: 'generate-all-vars',
    },
    {
      name: 'generate-all-vars-if-enabled',
      type: 'mixin',
      category: 'utility',
      description: 'Conditionally emits all Mastors CSS variables — only when $enable-css-variables is true.',
      params: [],
      example: '@include mc.generate-all-vars-if-enabled;',
      snippet: 'generate-all-vars-if-enabled',
    },
  ];
  entries.push(...cssVarMixins);

  // ── CONTAINER MIXIN ──
  entries.push({
    name: 'container',
    type: 'mixin',
    category: 'layout',
    description: 'Sets max-width from the $mastors-containers token map and optionally centres the element.',
    params: mixinParams('container').length ? mixinParams('container') : [
      { name: 'size',   type: 'String',  default: "'lg'", description: "Container size key ('xs'..'3xl', 'fluid')" },
      { name: 'center', type: 'Boolean', default: 'true', description: 'Auto-center with margin-inline: auto' },
    ],
    values: tokens.containerKeys,
    example: "@include mc.container('xl');\n@include mc.container('lg', false);",
    snippet: buildSnippetValues(tokens.containerKeys).replace("'${1|", "container('${1|"),
  });

  // ── ASPECT-RATIO MIXIN ──
  entries.push({
    name: 'aspect-ratio',
    type: 'mixin',
    category: 'layout',
    description: 'Sets the CSS aspect-ratio property from a slash-separated ratio string.',
    params: mixinParams('aspect-ratio').length ? mixinParams('aspect-ratio') : [
      { name: 'ratio', type: 'String', default: "'16/9'", description: "Ratio string, e.g. '16/9'" },
    ],
    example: "@include mc.aspect-ratio('16/9');",
    snippet: "aspect-ratio('${1:16/9}')",
  });

  // ── PLACEHOLDERS ──
  const placeholderDocs: Record<string, string> = {
    'mastors-clearfix':       'Clearfix placeholder. Adds ::after with display: table and clear: both.',
    'mastors-visually-hidden':'Visually hidden placeholder (SR-only). Hides element from sighted users, keeps accessible.',
    'mastors-cover':          'Cover layer placeholder. Sets position: absolute; inset: 0; width/height: 100%.',
    'mastors-flex-center':    'Flex center placeholder. Sets display: flex; align-items/justify-content: center.',
    'mastors-absolute-center':'Absolute center placeholder. Centers element via position: absolute; top/left: 50%; transform.',
    'mastors-truncate':       'Truncate placeholder. Applies overflow: hidden; text-overflow: ellipsis; white-space: nowrap.',
    'mastors-reset-button':   'Reset button placeholder. Strips all default browser button styles.',
    'mastors-reset-list':     'Reset list placeholder. Removes list-style, margin, and padding.',
    'mastors-reset-input':    'Reset input placeholder. Strips default browser input styles.',
  };

  for (const pName of placeholders) {
    entries.push({
      name:        pName,
      type:        'variable',
      category:    'placeholder',
      description: placeholderDocs[pName] ?? `Placeholder %${pName}. Use with @extend.`,
      params:      [],
      example:     `.my-element { @extend %${pName}; }`,
      snippet:     pName,
    });
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Build CATEGORY_MAP object (for parser + generateRegistry)
// ─────────────────────────────────────────────────────────────────────────────

function buildCategoryMap(entries: RegistryEntry[]): Record<string, Category> {
  const map: Record<string, Category> = {};
  for (const e of entries) {
    if (e.type !== 'variable') { // placeholders handled by their own path
      map[e.name] = e.category;
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Serialize to TypeScript source code
// ─────────────────────────────────────────────────────────────────────────────

function serializeParams(params: ParamDef[]): string {
  if (!params.length) return '[]';
  const items = params.map(p => {
    const parts: string[] = [`name: ${jStr(p.name)}`];
    if (p.type)        parts.push(`type: ${jStr(p.type)}`);
    if (p.default)     parts.push(`default: ${jStr(p.default)}`);
    if (p.description) parts.push(`description: ${jStr(p.description)}`);
    return `      { ${parts.join(', ')} }`;
  });
  return `[\n${items.join(',\n')},\n    ]`;
}

function serializeValues(values: string[] | undefined): string {
  if (!values || !values.length) return '';
  // Format as multi-line array of strings for readability
  const items = values.map(v => `      ${jStr(v)}`).join(',\n');
  return `    values: [\n${items},\n    ],`;
}

function serializeEntry(e: RegistryEntry): string {
  const lines: string[] = [
    `  {`,
    `    name: ${jStr(e.name)},`,
    `    type: ${jStr(e.type)},`,
    `    category: ${jStr(e.category)},`,
    `    description: ${jStr(e.description)},`,
    `    params: ${serializeParams(e.params)},`,
  ];
  if (e.values?.length) lines.push(serializeValues(e.values) ?? '');
  if (e.returns)        lines.push(`    returns: ${jStr(e.returns)},`);
  if (e.example)        lines.push(`    example: ${jStr(e.example)},`);
  if (e.snippet)        lines.push(`    snippet: ${jStr(e.snippet)},`);
  lines.push(`  },`);
  return lines.filter(l => l.trim()).join('\n');
}

function serializeRegistry(entries: RegistryEntry[], coreVersion: string): string {
  const now     = new Date().toISOString();
  const header  = [
    `// AUTO-GENERATED by scripts/syncFromCore.ts`,
    `// Source: Mastors Core SCSS — ${coreVersion}`,
    `// Generated: ${now}`,
    `// DO NOT EDIT MANUALLY — run \`npm run sync-registry\` to update.`,
    ``,
  ].join('\n');

  const body = entries.map(serializeEntry).join('\n\n');
  return `${header}export const BUILT_IN_REGISTRY: RegistryEntry[] = [\n\n${body}\n\n];\n`;
}

function serializeCategoryMap(catMap: Record<string, Category>): string {
  const now    = new Date().toISOString();
  const header = [
    `// AUTO-GENERATED by scripts/syncFromCore.ts — ${now}`,
    `// DO NOT EDIT MANUALLY.`,
  ].join('\n');

  const entries = Object.entries(catMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${jStr(k)}: ${jStr(v)}`)
    .join(',\n');

  return `${header}\nconst CATEGORY_MAP: Record<string, Category> = {\n${entries},\n};\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Inject into target files between sync markers
// ─────────────────────────────────────────────────────────────────────────────

function injectBlock(
  filePath:    string,
  startMarker: string,
  endMarker:   string,
  newContent:  string,
  label:       string
): boolean {
  const src = readFile(filePath);
  if (!src) {
    console.error(`  ❌  Could not read: ${filePath}`);
    return false;
  }

  const startIdx = src.indexOf(startMarker);
  const endIdx   = src.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.warn(`  ⚠️   Sync markers not found in ${path.basename(filePath)} — skipping ${label}.`);
    console.warn(`       Add these markers to the file:`);
    console.warn(`       ${startMarker}`);
    console.warn(`       ${endMarker}`);
    return false;
  }

  const before  = src.slice(0, startIdx + startMarker.length);
  const after   = src.slice(endIdx);
  const updated = `${before}\n${newContent}\n${after}`;

  try {
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`  ✅  Updated ${label} in ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    console.error(`  ❌  Failed to write ${filePath}: ${err}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — Read Mastors Core version from its package.json
// ─────────────────────────────────────────────────────────────────────────────

function readCoreVersion(coreRoot: string): string {
  const pkgPath = path.resolve(coreRoot, '..', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Mastors CDN Intelligence — Auto-Sync from Core         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const coreVersion = readCoreVersion(CORE_ROOT);
  console.log(`📂  Core path    : ${CORE_ROOT}`);
  console.log(`📦  Core version : ${coreVersion}`);
  console.log(`📝  Extension    : ${EXT_ROOT}\n`);

  // ── Extract data from core ──
  console.log('🔍  Extracting token data...');
  const tokens       = extractTokenData(CORE_ROOT);
  console.log(`   Colors     : ${tokens.colorKeys.length} keys`);
  console.log(`   Semantic   : ${tokens.semanticKeys.length} keys`);
  console.log(`   Shadows    : ${tokens.shadowKeys.length} keys`);
  console.log(`   Radius     : ${tokens.radiusKeys.length} keys`);
  console.log(`   Z-index    : ${tokens.zindexKeys.length} keys`);
  console.log(`   Layers     : ${tokens.layerKeys.length} keys`);
  console.log(`   Opacity    : ${tokens.opacityKeys.length} keys`);
  console.log(`   Breakpoints: ${tokens.breakpointKeys.length} keys`);
  console.log(`   Containers : ${tokens.containerKeys.length} keys`);
  console.log(`   Durations  : ${tokens.durationKeys.length} keys`);
  console.log(`   Easings    : ${tokens.easingKeys.length} keys`);
  console.log(`   Transitions: ${tokens.transitionKeys.length} keys`);
  console.log(`   Brd-widths : ${tokens.borderWidthKeys.length} keys`);
  console.log(`   Asp-ratios : ${tokens.aspectRatioKeys.length} keys`);

  console.log('\n🔍  Scanning mixin signatures...');
  const mixins = extractMixins(CORE_ROOT);
  console.log(`   Found ${mixins.length} mixins`);

  console.log('🔍  Scanning function signatures...');
  const fns = extractFunctions(CORE_ROOT);
  console.log(`   Found ${fns.length} functions`);

  console.log('🔍  Scanning placeholders...');
  const placeholders = extractPlaceholders(CORE_ROOT);
  console.log(`   Found ${placeholders.length} placeholders`);

  // ── Build registry ──
  console.log('\n🔨  Building registry entries...');
  const entries = buildRegistry(tokens, mixins, fns, placeholders);
  console.log(`   Total entries: ${entries.length}`);

  const catMap = buildCategoryMap(entries);

  // ── Serialize ──
  const registryCode  = serializeRegistry(entries, coreVersion);
  const categoryCode  = serializeCategoryMap(catMap);

  // ── Update mastorsRegistry.ts ──
  console.log('\n📝  Updating source files...');
  injectBlock(
    REGISTRY_FILE,
    '// @@SYNC:REGISTRY:START',
    '// @@SYNC:REGISTRY:END',
    registryCode,
    'BUILT_IN_REGISTRY'
  );

  // ── Update mastorsParser.ts ──
  injectBlock(
    PARSER_FILE,
    '// @@SYNC:CATEGORYMAP:START',
    '// @@SYNC:CATEGORYMAP:END',
    categoryCode,
    'CATEGORY_MAP (parser)'
  );

  // ── Update generateRegistry.ts ──
  injectBlock(
    GEN_SCRIPT_FILE,
    '// @@SYNC:CATEGORYMAP:START',
    '// @@SYNC:CATEGORYMAP:END',
    categoryCode,
    'CATEGORY_MAP (generateRegistry)'
  );

  // ── Write JSON snapshot ──
  console.log('\n💾  Writing JSON registry snapshot...');
  const jsonRegistry = {
    version:     '1.0.0',
    coreVersion,
    generatedAt: new Date().toISOString(),
    coreRoot:    CORE_ROOT,
    entries,
  };

  try {
    fs.mkdirSync(path.dirname(JSON_OUT_FILE), { recursive: true });
    fs.writeFileSync(JSON_OUT_FILE, JSON.stringify(jsonRegistry, null, 2), 'utf-8');
    console.log(`  ✅  ${JSON_OUT_FILE}`);
  } catch (err) {
    console.error(`  ❌  Failed to write JSON: ${err}`);
  }

  // Also write to dist/ if it exists
  const distJson = path.join(EXT_ROOT, 'dist', 'mastors-registry.generated.json');
  if (fs.existsSync(path.dirname(distJson))) {
    try {
      fs.writeFileSync(distJson, JSON.stringify(jsonRegistry, null, 2), 'utf-8');
      console.log(`  ✅  ${distJson}`);
    } catch { /* ignore */ }
  }

  // ── Summary ──
  const byType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1; return acc;
  }, {});
  const byCategory = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1; return acc;
  }, {});

  console.log('\n📊  Summary:');
  console.log(`   Total entries : ${entries.length}`);
  console.log(`   By type       : ${JSON.stringify(byType)}`);
  console.log(`   By category   :`);
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`     ${cat.padEnd(14)} ${count}`);
  }

  console.log('\n✨  Sync complete!\n');
  console.log('   Next steps:');
  console.log('   1. Review the updated files in your editor');
  console.log('   2. Run: npm run compile');
  console.log('   3. Run: npm run package (to rebuild .vsix)');
  console.log('   4. Reload the extension in VS Code\n');
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err);
  process.exit(1);
});
