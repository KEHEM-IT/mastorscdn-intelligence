# Mastors CDN Core Intelligence

> Intelligent SCSS/SASS autocomplete, hover documentation, and parameter hints for the `@mastorscdn/core` design-token library.

---

## Features

### Autocomplete
Type `mc.` in any `.scss` or `.sass` file and get instant, context-aware completions for every function and mixin in `@mastorscdn/core` — with token value suggestions inline.

```scss
color: mc.color('|')       // → shows all 190+ color tokens
box-shadow: mc.shadow('|') // → shows all shadow keys
z-index: mc.z('|')         // → shows all z-index keys
@include mc.up('|')        // → shows all breakpoint keys
```

### Hover Documentation
Hover over any `mc.*` call to see the full function/mixin signature, parameter types, default values, accepted token values, and a usage example — without leaving the editor.

### Signature Help
Open parentheses trigger live parameter hints showing which argument you're on, its type, and its default value.

### Function Registry Browser
Search and browse the entire registry via the Command Palette (`Mastors: Show Registry`) and open a rich detail panel for any entry.

### Smart Alias Detection
Automatically detects the namespace alias used in each file via `@use '@mastorscdn/core' as <alias>`, so completions work whether you use `mc`, `mastors`, or any custom alias.

---

## Supported Languages

| Language | Extension |
|---|---|
| SCSS | `.scss` |
| Sass (indented) | `.sass` |
| CSS | `.css` |

---

## Covered API Surface

### Functions — Token Accessors

| Function | Token Map | Example |
|---|---|---|
| `color($key, $fallback?)` | 190+ color keys | `mc.color('primary-500')` |
| `semantic($key, $fallback?)` | 49 semantic role keys | `mc.semantic('text-muted')` |
| `shadow($key, $fallback?)` | 15 shadow keys | `mc.shadow('lg')` |
| `radius($key, $fallback?)` | 9 radius keys | `mc.radius('full')` |
| `z($key, $fallback?)` | 12 z-index keys | `mc.z('modal')` |
| `layer($key, $fallback?)` | 6 layer keys | `mc.layer('nav')` |
| `opacity($key, $fallback?)` | 16 opacity keys | `mc.opacity('75')` |
| `breakpoint($key, $fallback?)` | 7 breakpoint keys | `mc.breakpoint('lg')` |
| `container($key, $fallback?)` | 8 container keys | `mc.container('xl')` |
| `duration($key, $fallback?)` | 7 duration keys | `mc.duration('normal')` |
| `easing($key, $fallback?)` | 9 easing keys | `mc.easing('spring')` |
| `transition($key, $fallback?)` | 7 transition presets | `mc.transition('colors')` |
| `border-width($key, $fallback?)` | 5 width keys | `mc.border-width('2')` |
| `aspect-ratio($key, $fallback?)` | 8 ratio keys | `mc.aspect-ratio('video')` |

### Functions — Math & Unit Helpers

| Function | Description |
|---|---|
| `rem($px, $base?)` | Convert px → rem |
| `em($px, $base?)` | Convert px → em |
| `strip-unit($value)` | Remove CSS unit from a value |
| `fluid($min, $max, $min-vw?, $max-vw?)` | Generate a `clamp()` fluid expression |
| `percent($value, $total?)` | Compute a CSS percentage |

### Functions — Map Helpers

| Function | Description |
|---|---|
| `mastors-map-get($map, $key, $fallback?, $context?)` | Safe map lookup with `@warn` |
| `mastors-map-merge($map1, $map2)` | Merge two SCSS maps |

### Mixins — Responsive

| Mixin | Description |
|---|---|
| `up($bp)` | `min-width` media query (mobile-first) |
| `down($bp)` | `max-width` media query |
| `between($lower, $upper)` | Range media query |
| `only($bp)` | Single breakpoint range |
| `hover` | Hover with `(pointer: fine)` guard |
| `prefers-dark` | `prefers-color-scheme: dark` |
| `prefers-reduced-motion` | `prefers-reduced-motion: reduce` |
| `print` | `@media print` |
| `portrait` | Portrait orientation |
| `landscape` | Landscape orientation |

### Mixins — Helpers & Layout

| Mixin | Description |
|---|---|
| `container($size?, $center?)` | Max-width container from token map |
| `absolute-center` | `position: absolute` dead-centre |
| `flex-center` | `display: flex` + `align-items/justify-content: center` |
| `cover` | Fill parent: `position: absolute; inset: 0` |
| `aspect-ratio($ratio?)` | Set CSS `aspect-ratio` property |
| `truncate` | Single-line ellipsis truncation |
| `line-clamp($lines?)` | Multi-line `-webkit-line-clamp` truncation |
| `glassmorphism(...)` | Backdrop blur + translucent glass effect |
| `neumorphism(...)` | Soft-UI dual-shadow effect |
| `hover-lift($y?, $shadow?)` | translateY + shadow on hover |
| `custom-scrollbar(...)` | Styled `::-webkit-scrollbar` + Firefox `scrollbar-width` |
| `focus-ring(...)` | Accessible outline focus ring |
| `focus-visible` | Focus ring only on keyboard navigation |
| `smooth-transition(...)` | CSS `transition` shorthand |
| `loading-state` | Disabled/loading overlay visual |
| `skeleton-loading(...)` | Animated shimmer skeleton effect |
| `visually-hidden` | Screen-reader-only clip pattern |
| `visually-visible` | Reset visually-hidden back to normal flow |

### Mixins — CSS Variable Engine

| Mixin | Description |
|---|---|
| `generate-vars($map, $prefix, $root?)` | Emit CSS custom properties from any SCSS map |
| `generate-all-vars` | Emit all Mastors Core tokens as CSS variables into `:root` |
| `generate-all-vars-if-enabled` | Conditionally emit (respects `$enable-css-variables` setting) |

### Placeholders (extend-only)

| Placeholder | Description |
|---|---|
| `%mastors-clearfix` | Float clearfix via `::after` |
| `%mastors-visually-hidden` | Screen-reader-only |
| `%mastors-cover` | Fill parent layer |
| `%mastors-flex-center` | Flex centre layout |
| `%mastors-absolute-center` | Absolute centre position |
| `%mastors-truncate` | Single-line ellipsis |
| `%mastors-reset-button` | Strip all browser button styles |
| `%mastors-reset-list` | Strip list styles |
| `%mastors-reset-input` | Strip all browser input styles |

---

## Color Token Reference

`mc.color()` covers the full Mastors palette:

**Brand** — `primary`, `secondary`, `accent` — each with `50`–`950` numeric steps plus `-light` / `-dark` aliases.

**Status** — `success`, `warning`, `danger`, `info` — each with `50`–`950` steps plus `-light` / `-dark` aliases.

**Extended palettes** — `rose`, `pink`, `fuchsia`, `purple`, `indigo`, `teal`, `emerald`, `lime`, `yellow`, `orange`, `stone`, `zinc`, `slate` — all 11 steps (`50`–`950`).

**Neutrals** — `neutral-50` through `neutral-950`, `white`, `black`, `transparent`.

**Surface** — `surface`, `surface-raised`, `surface-overlay`, `surface-sunken`, plus dark-mode variants (`surface-dark`, `surface-dark-raised`, `surface-dark-overlay`, `surface-dark-sunken`).

**Scrims** — `scrim-light`, `scrim-dark`, `scrim-heavy`.

**Chart** — `chart-1` through `chart-10`.

`mc.semantic()` covers role-based tokens:

**Text** — `text-primary`, `text-secondary`, `text-muted`, `text-disabled`, `text-placeholder`, `text-inverse`, `text-heading`, `text-code`, `text-on-*` (primary, secondary, accent, success, warning, danger, info).

**Background** — `bg-body`, `bg-subtle`, `bg-muted`, `bg-inverse`, plus status variants (`bg-primary`, `bg-primary-subtle`, `bg-success`, `bg-success-subtle`, …).

**Border** — `border-default`, `border-strong`, `border-subtle`, `border-focus`, plus status variants.

**Link** — `link`, `link-hover`, `link-visited`, `link-active`.

**Interactive** — `ring-focus`, `ring-danger`, `ring-success`, `overlay-light`, `overlay-dark`.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Mastors: Show Registry` | Browse and search all functions/mixins with a rich detail panel |
| `Mastors: Refresh Function Registry` | Re-parse source files and rebuild the registry |
| `Mastors: Clear Cache` | Delete the cached registry (auto-rebuilds on next activation) |
| `Mastors: Generate Registry JSON` | Write the full registry to `mastors-registry.generated.json` in the workspace |

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `mastorsintelligence.enable` | `boolean` | `true` | Enable/disable the extension entirely |
| `mastorsintelligence.cacheEnabled` | `boolean` | `true` | Cache the parsed registry for faster startup |
| `mastorsintelligence.showParameterHints` | `boolean` | `true` | Show signature parameter hints |
| `mastorsintelligence.enableFuzzySearch` | `boolean` | `true` | Fuzzy matching in completions |
| `mastorsintelligence.corePackagePath` | `string` | `""` | Absolute path override to `@mastorscdn/core` SCSS root |
| `mastorsintelligence.scanWorkspacePath` | `string` | `""` | Additional path to scan for Mastors Core files (monorepos) |
| `mastorsintelligence.debugLogging` | `boolean` | `false` | Verbose debug output in the Mastors output channel |

### Auto-detection order for `@mastorscdn/core`

1. `corePackagePath` setting (manual override)
2. `node_modules/@mastorscdn/core/scss` in any workspace folder
3. `scanWorkspacePath` setting
4. Sibling `Mastors Core/scss` directory (monorepo layout)
5. Built-in registry (always available as fallback)

---

## Cache Storage

The registry cache is stored in VS Code's private global extension storage directory — **never** inside your project folder. No files are created in your workspace.

---

## Requirements

- VS Code `1.85.0` or later
- `@mastorscdn/core` (optional — the built-in registry covers the full API without it)

---

## Usage Example

```scss
@use '@mastorscdn/core' as mc;

.card {
  background: mc.color('surface');
  border: mc.border-width('1') solid mc.semantic('border-default');
  border-radius: mc.radius('lg');
  box-shadow: mc.shadow('md');
  transition: mc.transition('colors');

  @include mc.up('md') {
    padding: mc.rem(24);
  }

  @include mc.hover {
    box-shadow: mc.shadow('xl');
  }

  &__title {
    color: mc.semantic('text-primary');
    font-size: mc.fluid(18px, 24px);
  }

  &__badge {
    background: mc.color('primary-100');
    color: mc.color('primary-700');
    border-radius: mc.radius('full');
    opacity: mc.opacity('90');
    z-index: mc.z('raised');
  }
}
```

---

## License

MIT © [KEHEM IT](https://github.com/KEHEM-IT)
