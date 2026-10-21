---
name: Nordic Monolith
colors:
  surface: '#fef9ef'
  surface-dim: '#ded9d1'
  surface-bright: '#fef9ef'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f3ea'
  surface-container: '#f2ede4'
  surface-container-high: '#ede8df'
  surface-container-highest: '#e7e2d9'
  on-surface: '#1d1c16'
  on-surface-variant: '#5a413d'
  inverse-surface: '#32302a'
  inverse-on-surface: '#f5f0e7'
  outline: '#8e706c'
  outline-variant: '#e2beb9'
  surface-tint: '#b4271e'
  primary: '#9a120f'
  on-primary: '#ffffff'
  primary-container: '#bd2e24'
  on-primary-container: '#ffdad5'
  inverse-primary: '#ffb4a9'
  secondary: '#605e5c'
  on-secondary: '#ffffff'
  secondary-container: '#e6e2df'
  on-secondary-container: '#666462'
  tertiary: '#773c2c'
  on-tertiary: '#ffffff'
  tertiary-container: '#945342'
  on-tertiary-container: '#ffdbd2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4a9'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#910809'
  secondary-fixed: '#e6e2df'
  secondary-fixed-dim: '#cac6c4'
  on-secondary-fixed: '#1c1b1a'
  on-secondary-fixed-variant: '#484645'
  tertiary-fixed: '#ffdbd2'
  tertiary-fixed-dim: '#ffb4a1'
  on-tertiary-fixed: '#390c03'
  on-tertiary-fixed-variant: '#703627'
  background: '#fef9ef'
  on-background: '#1d1c16'
  surface-variant: '#e7e2d9'
typography:
  display:
    fontFamily: Epilogue
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Epilogue
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Epilogue
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Epilogue
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.04em
  label-md:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.08em
spacing:
  gutter: 1.5rem
  gutter-lg: 2rem
  margin: 2rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system draws direct inspiration from modern Norwegian architectural clarity and Scandinavian editorial design: raw honesty of materials, unyielding geometric balance, and intentional negative space. Created for high-performing engineering executives, technical leaders, and intellectual builders, the interface rejects playful or generic SaaS tropes in favor of monolithic composure, structured silence, and disciplined typographic impact.

The visual style blends **Minimalism** with an **Architectural Editorial** discipline. It relies on a warm mineral foundation (linen/limestone), punctuated by monolithic charcoal slate modules and stark, decisive crimson accents. Every screen functions like a gallery layout or a bespoke architectural monograph: high-contrast headings, quiet micro-metadata, precise hairline boundaries, and rigorous structural proportioning that instill confidence, calm focus, and deliberate momentum.

## Colors

The palette is anchored in tactile, architectural materiality:
- **Canvas & Neutral Surfaces (`#EAE5DC`):** A warm, tactile limestone/linen tone that relieves eye fatigue and grounds the workspace in organic luxury rather than sterile laboratory white.
- **Structural Black / Ink (`#181716`):** Deep charcoal slate used for primary typography, structural borders, and standout monolithic cards that command focus (such as active challenge containers and core executive summaries).
- **Primary Accent (`#BD2E24`):** A confident, Scandinavian crimson brick tone. Reserved strictly for pivotal cues, active LeetCode streak indicators, urgent executive triggers, and architectural markers.
- **Tertiary Accent (`#D88B77`):** Warm terracotta clay, used for warm highlight badges, metric fills, and subdued categorical accents.
- **Surface Elevation Cards (`#DFD9CE`):** A subtle step down in lightness from the base canvas, mimicking cut stone pavers to create quiet spatial grouping without drop shadows.

## Typography

Typographic hierarchy relies on sharp tension between three distinct families:
1. **Epilogue (Headlines & Numerals):** A contemporary grotesque with decisive geometric terminals. When set tight with negative tracking, it gives daily executive briefs and LeetCode figures an architectural, poster-like presence.
2. **Hanken Grotesk (Body & Narrative):** A crisp, humanist grotesque engineered for neutral legibility across dense email summaries, literary synopsis, and technology essays.
3. **Space Mono (Metadata, Indicators & Labels):** Monospaced precision for timestamps, commit hashes, LeetCode runtime benchmarks, and system indices. Uppercase treatments with tracked-out spacing reinforce institutional rigor.

## Layout & Spacing

The layout is built upon an architectural 12-column grid system framed by intentional perimeter margins. Content modules sit within rigid columns reminiscent of architectural plans:
- **Desktop (1024px+):** 12-column fluid grid, 2rem margins, 1.5rem to 2rem gutters. Grid splits strictly favor tripartite layouts (3 equal modules for metrics or tasks) or asymmetrical splits (8-column core agenda paired with a 4-column side rail for the daily LeetCode and curated reads).
- **Tablet (768px - 1023px):** 8-column layout with 1.5rem gutters, stacking secondary rails into full-width sections beneath primary tasks.
- **Mobile (< 768px):** 4-column single-stream rhythm with 1.25rem outer safe margins. Dense monolithic cards transition from horizontal spreads to tall structural vertical stacks.
- Spacing within components adheres to strict mathematical intervals (8px rhythm), prioritizing deliberate white space above elements to establish calm visual weight.

## Elevation & Depth

This system intentionally avoids drop shadows, blurred glows, and simulated skeuomorphic lighting. Depth is rendered purely through **structural surface tiers and tonal zoning**:

- **Ground Level (Base Canvas):** `#EAE5DC` represents the base floor plate.
- **Tonal Level 1 (Recessed Modules):** `#DFD9CE` paired with ultra-fine `#C8C1B4` borders (1px hairline) creates flat, defined zones for passive panels like reading lists or secondary tech feeds.
- **Tonal Level 2 (Inverted Monoliths):** Deep charcoal `#181716` containers sit directly on the ground plane, producing immediate high-contrast focal points without requiring elevation blurs. Inside dark monoliths, text flips to `#EAE5DC` and crimson accents brighten slightly for optical punch.
- **Hairline Partitions:** Sections are separated by single-pixel horizontal datum lines in `#181716` (at 15% opacity on light surfaces or 20% white opacity within dark modules), grounding the interface like blueprint grid lines.

## Shapes

The shape philosophy is strictly **architectural, rectilinear, and planar** (`roundedness: 0`). 
- All containers, cards, buttons, badges, and input elements employ crisp 90-degree corners.
- Zero border radius echoes the clean cuts of stonework, milled steel, and Nordic brutalist architecture.
- Structural stability and visual gravitas emerge from exact alignment, strict bounding boxes, and internal negative margins rather than softened corners.

## Components

### Buttons
- **Primary Action:** Solid `#181716` background, `#EAE5DC` uppercase `label-md` text, 0px radius, 12px vertical by 24px horizontal padding. Hover shifts to `#BD2E24` with instant crisp transition (0.15s linear).
- **Secondary / Ghost:** Transparent background with a 1px solid `#181716` border. Hover fills with `#181716` and inverts text to `#EAE5DC`.
- **Destructive / Urgent:** Solid `#BD2E24` background, cream text.

### Cards & Modular Blocks
- **Standard Module:** Background `#DFD9CE`, border 1px solid `#D0C8BB`, sharp corners. Padding is generous (`space-lg` to `space-xl`).
- **Inverted Monolith Card:** Background `#181716`, text `#EAE5DC`. Used for primary high-stakes cards: the day's LeetCode code terminal or the critical executive meeting agenda. Includes oversized display metrics (e.g., `48`, `612`) set in tight Epilogue with textured copper/crimson fills.

### Chips & Status Badges
- Unrounded rectangular tags. 
- Space Mono typography (`label-sm`).
- Light stone background (`#E5DFD4`) with 1px border. Status flags use a 6px square solid crimson pip preceding the text for urgent notifications or pending daily tasks.

### Input Fields & Search
- Flat background (`#FFFFFF` with 40% opacity against the linen canvas) with a bold 1px bottom border in `#181716`. No side or top borders.
- Space Mono placeholder text in subdued charcoal (`#7A756D`). Focused state transforms the bottom border into a 2px solid `#BD2E24`.

### Lists & Feed Items (Tech Trends & Book Curation)
- Framed with subtle horizontal dividing rules.
- Numbered index column using monospaced indices (`01`, `02`, `03`) in `#BD2E24`.
- Editorial headline paired with inline metadata (reading time, category tags, author) and directional arrows (`→`) anchored to the right margin.

### Checkboxes & Binary Selectors
- Sharp 16px square boxes with a 1.5px border in `#181716`.
- Checked state fills completely with `#181716` and reveals a clean geometric tick in `#EAE5DC`.