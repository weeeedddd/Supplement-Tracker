---
name: CORELINE
description: An offline-first performance dossier in a disciplined dark-fantasy system world.
colors:
  moon-cyan: "#78e7ed"
  moon-cyan-soft: "#b8f5f7"
  void: "#050707"
  obsidian: "#090b0c"
  charcoal: "#111516"
  panel: "#15191a"
  panel-raised: "#1b2021"
  bone: "#eeeae0"
  muted: "#aaa79f"
  dim: "#747875"
  danger: "#ef6675"
  warning: "#e9c36a"
  success: "#83d8b2"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 8vw, 5.6rem)"
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: "0.025em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.07em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.76rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  square: "0px"
  hairline: "1px"
  panel: "2px"
  compatibility: "4px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  page: "34px"
components:
  button-primary:
    backgroundColor: "{colors.moon-cyan}"
    textColor: "{colors.void}"
    typography: "{typography.label}"
    rounded: "{rounded.hairline}"
    padding: "10px 15px"
    height: "46px"
  button-quiet:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.hairline}"
    padding: "10px 15px"
    height: "46px"
  field:
    backgroundColor: "{colors.obsidian}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "11px 12px"
    height: "48px"
  panel:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.panel}"
    padding: "18px"
  nav-item:
    backgroundColor: "{colors.obsidian}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    height: "64px"
---

# Design System: CORELINE

## Overview

**Creative North Star: "The Obsidian Dossier"**

CORELINE feels like a private player-status record forged from blackened metal and dark vellum. It is disciplined, exact, and quietly ominous: information leads, material supports it, and a single moon-cyan signal identifies the next meaningful action. The world borrows only the focus and choreography of premium dark-fantasy status interfaces; its geometry, sigils, imagery, and component language are original.

The interface is dense without becoming cryptic. Large condensed headings establish identity and direction, while Manrope keeps plans, cautions, nutrition values, and user context easy to scan. Motion behaves like a dossier being revealed or a menu plane changing direction. It never glitches, loops, or delays access to content.

**Key Characteristics:**

- Obsidian fields, bone text, and one rare moon-cyan focus signal.
- Sharp clipped planes, etched one-pixel seams, and original geometric sigils.
- Condensed editorial hierarchy paired with highly readable body copy.
- Real local data and honest empty/provider states instead of decorative fiction.
- Original anonymous imagery used as atmosphere, never as product truth.

## Colors

The palette is nearly monochrome so state, focus, and progress remain unmistakable.

### Primary

- **Moon Cyan** (`moon-cyan`): the only routine focus color. Use it for the active route, selected tab, focus rings, verified progress, and one primary action.
- **Soft Moonlight** (`moon-cyan-soft`): a quieter accent for links and small highlights where full cyan would dominate.

### Neutral

- **Void** (`void`): the page and safe fallback background.
- **Obsidian** (`obsidian`): command bars, navigation, and the deepest interactive fields.
- **Charcoal** (`charcoal`): default panels and cards.
- **Raised Charcoal** (`panel`, `panel-raised`): nested or temporarily elevated surfaces.
- **Bone** (`bone`): primary text and critical measurements.
- **Weathered Silver** (`muted`): secondary copy, inactive navigation, and helper text.
- **Ash** (`dim`): tertiary metadata that remains nonessential.

### Tertiary

- **Ember Red** (`danger`): destructive or genuinely unsafe states only.
- **Muted Gold** (`warning`): caution and incomplete review, never generic decoration.
- **Recovery Green** (`success`): confirmed completion or availability, used sparingly.

**The One Signal Rule.** Moon cyan is the screen's single visual command voice. Never light every border, label, and icon at once.

**The Honest State Rule.** Red, gold, and green describe real state only; they never manufacture urgency, readiness, or health meaning.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow and sans-serif fallbacks)

**Body Font:** Manrope (with system-ui and sans-serif fallbacks)

**Character:** Barlow Condensed supplies the decisive, engraved status-window voice. Manrope supplies calm modern legibility for the user's real plan and evidence. Both fonts ship locally for offline reliability.

### Hierarchy

- **Display** (600, responsive `clamp`, tight line height): identity, screen titles, and major outcome numbers. Prefer uppercase when it acts as a system label.
- **Title** (600, compact, tracked): matrix rows, panel headings, and action labels.
- **Body** (400, comfortable line height): explanations, safety copy, assistant output, and form guidance. Keep long passages near 70 characters per line.
- **Label** (600, compact, tracked, usually uppercase): navigation, tabs, badges, and small command labels.

**The Two-Voice Rule.** Condensed type commands; Manrope explains. Do not use the display face for paragraphs or the body face to imitate a fantasy title.

**The Measurement Rule.** Display units with real values and preserve readable spacing; never rely on color or an unlabeled number to convey meaning.

## Layout

The shell uses a fixed command bar, a persistent five-item navigation, and one scrollable main region. Core content is centered at a maximum width of about 980px; the page gutter scales from 12–14px on narrow phones to 34px on larger screens. Grids use etched dividers rather than floating rounded cards.

Mobile is the binding composition. At 320–430px, the Profile Codex uses a 38/62 portrait-to-dossier split, a compact 300px dossier, 44px tabs, five 48px-minimum matrix rows, a truthful action, and the navigation within the initial viewport. Primary touch targets remain at least 44×44px. At wider breakpoints the dossier expands, summaries return, and navigation becomes a contained floating command strip without stretching content beyond readable proportions.

Use an 8/12/18/24px rhythm for internal gaps and 34px as the largest routine page gutter. Allow translated and user-entered content to wrap or grow. Never clip important profile, warning, or provider-state text to preserve a mockup height.

**The First-Viewport Rule.** On a 390×844 profile screen, identity, the five domains, the edit action, and navigation must all remain discoverable without a hidden overlay or competing floating control.

**The Local-Data Rule.** Layout may become richer when data exists, but empty states must occupy the same trustworthy structure instead of being filled with invented metrics.

## Elevation & Depth

Depth is structural, not glossy. Most surfaces are separated through tonal steps, one-pixel bone seams, clipped overlaps, the local obsidian-vellum texture, and restrained black shadows. The dossier and modal are the strongest layers; ordinary list rows remain nearly flat.

### Shadow Vocabulary

- **Panel depth** (`0 18px 42px rgba(0,0,0,.42)`): dossier planes, dialogs, and rare focal surfaces.
- **Quiet lift** (`0 14px 30px rgba(0,0,0,.18)`): established cards that need separation from the page.
- **Command lift** (`0 12px 26px rgba(0,0,0,.26)`): fixed bars above scrolling content.

**The Material-First Rule.** Prefer tonal layering, texture, and seams before adding shadow. Glow appears only as a restrained consequence of cyan focus.

## Shapes

CORELINE is angular and engineered. Default radii are zero to 2px; the 4px compatibility radius exists only for incumbent surfaces that have not yet adopted the system. Important panels and actions use clipped 9–20px corners or one decisive diagonal plane. Repeating tiny notches, faux runes, and ornamental frames are noise, not system geometry.

Borders are one pixel and low contrast at rest. Stronger seams identify containment, while cyan seams identify selection or a signature directional edge. Original SVG icons share a 24×24 viewBox, `currentColor`, approximately 1.75px strokes, and consistent optical bounds.

**The One Cut Rule.** Give a component one clear geometric gesture. Do not stack polygons, borders, glows, and corner decorations on the same ordinary control.

## Components

### Buttons

- **Shape:** nearly square controls with a small clipped corner where emphasis is needed.
- **Primary:** moon-cyan with void text, at least 46px high; the Profile Codex may layer the approved text-free faceted plate beneath live semantic text.
- **Hover / Focus:** slight brightness or restrained cyan border shift; keyboard focus always uses a visible two-pixel cyan outline with offset.
- **Quiet:** charcoal/transparent fill, muted text, and an etched border that brightens on hover.
- **Truth:** the label must name the action that will occur. A profile editor may not be labeled as automatic plan regeneration.

### Cards / Containers

- **Corner Style:** square or 2px with one optional clipped corner.
- **Background:** charcoal tonal layers over the vellum/void foundation.
- **Shadow Strategy:** nearly flat by default; use panel depth only for dossiers and overlays.
- **Border:** one-pixel etched bone seam; cyan only for active or focused state.
- **Internal Padding:** generally 12–24px, responsive to density.

### Inputs / Fields

- **Style:** 48px-minimum obsidian field, bone text, square corners, and a one-pixel muted border.
- **Focus:** cyan border/outline without bloom or layout shift.
- **Error / Disabled:** explicit text plus restrained danger color; disabled controls remain identifiable and never rely on opacity alone for the explanation.

### Navigation

The command bar uses a real text wordmark, a centered original sigil, and labeled 44px-minimum icon controls. The bottom navigation always keeps five text labels with matching authored SVG icons. Active state uses moon-cyan icon/text plus a faceted undercut wedge and `aria-current`; inactive items remain weathered silver.

### Profile Codex

The signature dossier overlaps an original anonymous portrait with a clipped information plane and a single cyan seam. Its three tabs use proper tab semantics and arrow-key navigation. The overview matrix contains exactly Alltag, Training, Ernährung, Schlaf, and Supplemente; Shopping lives in the Plan context instead of becoming a sixth health domain.

### Motion

Dossier, portrait, screen, and tab changes use 160–320ms transform/opacity/clip reveals with a decisive ease-out. Navigation state moves through transforms, never width layout animation. Under `prefers-reduced-motion: reduce`, all decorative movement resolves immediately; forced-colors mode removes nonessential clipping, texture, seams, and image-backed action material.

## Do's and Don'ts

### Do:

- **Do** keep moon cyan rare and attach it to focus, selection, progress, or the next meaningful action.
- **Do** use real local data, explicit empty states, and provider freshness/availability language.
- **Do** preserve 320–430px layouts, 44×44px touch targets, keyboard focus, reduced motion, and German/English wrapping.
- **Do** use original anonymous imagery and authored geometric SVG icons with accessible labels.
- **Do** keep semantic text and interaction above every generated material asset.
- **Do** separate AI consent from location consent and distinguish local guidance from a real provider response.

### Don't:

- **Don't** use cyberpunk neon grids, glitches, scanlines, RGB splits, graffiti, or multicolor glow.
- **Don't** copy franchise characters, logos, glyphs, exact layouts, or copyrighted artwork.
- **Don't** invent rank, readiness, diagnosis, supplement dosage, live stock, price, distance, or AI output.
- **Don't** use soft pill cards, emoji controls, excessive rounded glassmorphism, or decorative dashboards unrelated to the user's task.
- **Don't** let a floating control obscure profile rows, nutrition controls, or the primary action.
- **Don't** rasterize labels, focus states, navigation meaning, or other interactive truth.
