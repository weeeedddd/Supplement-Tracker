# CORELINE Profile Codex asset manifest

## Reference and boundary

- Approved visual reference: `.impeccable/mocks/comp-c-profile-codex.webp`
- Product truth: `PRODUCT.md`
- Surface brief: `.impeccable/profile-codex-brief.md`
- Output directory: `frontend/public/assets/coreline/profile-codex/`
- Production boundary: the anonymous athlete, material grain, and text-free action plate are the only raster ingredients. All interface text, controls, clipping, geometry, icons, borders, focus states, and motion remain semantic HTML/CSS/SVG.
- The approved mock was used only as a visual reference. It was neither edited nor cropped into a shipping asset.

## Produce

### `profile-shadow`

- `id`: `profile-shadow`
- `source_crop`: full approved mock reference at `.impeccable/mocks/comp-c-profile-codex.webp`; portrait region is the binding reference for silhouette, shadow depth, smoke density, and visual role, not a shipping crop.
- `output_path`: `frontend/public/assets/coreline/profile-codex/profile-shadow.webp`
- `prompt_metadata`: `frontend/public/assets/coreline/profile-codex/profile-shadow.webp.json`, written by Impeccable `embed-prompt.mjs` because WebP uses its documented sidecar fallback.
- `strategy`: faithful clean-plate regeneration with the built-in image generator, followed by a restrained Lanczos resize from the 1086x1448 generated source to the required 1200x1600 production size and opaque WebP encoding. CSS owns all presentation clipping and overlays.
- `dimensions`: 1200x1600 px (3:4)
- `format`: WebP (`yuv420p`)
- `transparency`: none; fully opaque
- `deviations`: the generated source was 1086x1448 and was enlarged by approximately 10.5% to the contracted production size. The clean plate includes lower legs and shoes beyond the dossier's intended mid-body CSS crop, providing responsive crop latitude without changing the visible comp role.
- `qa_status`: `accepted`
- `qa`: opened from its workspace-relative output path and compared with the approved comp. One anonymous adult, ordinary unbranded black shirt and shorts, realistic athletic anatomy, unreadable face, restrained graphite rim light, and deep smoke are present. No text, UI, glyph, logo, cyan accent, armor, weapon, fantasy costume, or recognizable franchise resemblance is visible. `ffprobe` confirms 1200x1600 opaque WebP.
- `prompt_used`:

```text
Use case: photorealistic-natural
Asset type: reusable opaque mobile profile dossier portrait ingredient for CORELINE
Input image: Image 1 is the approved CORELINE mobile comp and is a visual reference only for the portrait's silhouette, restrained charcoal palette, shadow depth, smoke density, and editorial role. Do not reproduce, crop, trace, or include any UI, text, symbols, borders, shapes, or layout from it.
Primary request: Create a clean original vertical 3:4 production portrait of one anonymous adult athlete standing at rest, photographed from head through upper shins, in ordinary unbranded black training clothes: plain fitted short-sleeve performance shirt and plain black training shorts. The physique is athletic, strong, and realistic, never exaggerated. The face and eyes must remain completely unreadable in natural deep shadow; no identifiable facial features.
Scene/backdrop: continuous opaque near-black charcoal studio void with restrained graphite smoke and soft atmospheric haze behind and around the silhouette; no floor line and no environment.
Style/medium: premium monochrome editorial fitness photography, natural human anatomy, matte and understated.
Composition/framing: portrait 3:4; athlete centered slightly left; head safely below top edge; both arms and hands visible; enough breathing room on every edge for responsive CSS cropping; no baked card crop or presentation frame.
Lighting/mood: extremely low-key graphite rim light tracing only shoulders, forearms, shirt folds, and outer legs; one soft diffused backlight through smoke; the face remains black and unreadable. No neon, no colored light, no hotspot.
Color palette: opaque near-black, charcoal, graphite, faint bone-gray highlights only.
Materials/textures: real matte training fabric, subtle natural skin texture where visible, fine smoke.
Constraints: output must be at least 1200 by 1600 pixels or larger; fully opaque; one adult only; ordinary contemporary training clothing; reusable raw image plate; CSS will own clipping, diagonal overlays, borders, shadows, and all UI.
Avoid: any text, letters, numbers, logos, watermarks, UI, interface graphics, geometric sigils, circles, rings, HUD marks, cyan accents, red accents, cyberpunk, glitch, fantasy costume, armor, cape, robe, jewelry, weapons, combat pose, supernatural effects, recognizable fictional character, franchise resemblance, tattoos, explicit nudity, threatening expression, dramatic bodybuilder proportions, rounded corners, border, vignette frame, letterboxing, hard spotlight, bright face.
```

### `obsidian-vellum`

- `id`: `obsidian-vellum`
- `source_crop`: full approved mock reference at `.impeccable/mocks/comp-c-profile-codex.webp`; clean material regions are the binding reference for value, grain scale, and restraint, not a shipping crop.
- `output_path`: `frontend/public/assets/coreline/profile-codex/obsidian-vellum.webp`
- `prompt_metadata`: `frontend/public/assets/coreline/profile-codex/obsidian-vellum.webp.json`, written by Impeccable `embed-prompt.mjs` because WebP uses its documented sidecar fallback.
- `strategy`: clean material regeneration with the built-in image generator. The 1254px square source was normalized to a 512px low-contrast grayscale material quadrant and mirrored horizontally and vertically into a mathematically edge-continuous 1024px tile, then encoded as opaque WebP.
- `dimensions`: 1024x1024 px
- `format`: WebP (`yuv420p`)
- `transparency`: none; fully opaque
- `deviations`: exact four-edge continuity is achieved through a mirrored 512px quadrant reconstruction. A very faint large-scale mirrored rhythm is discoverable under deliberate tiled inspection but is not visible as a seam at application scale.
- `qa_status`: `accepted`
- `qa`: opened from its workspace-relative output path and compared with the approved comp. The plate remains a low-contrast charcoal/graphite material with no text, glyphs, UI, border, diagonal line, lighting hotspot, colored accent, or recognizable motif. A temporary 2x2 repeat preview showed no visible horizontal or vertical boundary and was removed after review. `ffprobe` confirms 1024x1024 opaque WebP.
- `prompt_used`:

```text
Use case: stylized-concept
Asset type: reusable opaque seamless surface-material texture for CORELINE mobile application backgrounds
Input image: Image 1 is the approved CORELINE mobile comp and is a visual reference only for its restrained obsidian material depth and low-contrast grain. Do not reproduce, crop, trace, or include any UI, text, icons, sigils, borders, panels, diagonal seams, or layout from it.
Primary request: Create one square 1024 by 1024 clean material plate that blends blackened steel with dark vellum: almost-black charcoal base, microscopically mottled forged-metal pores, extremely subtle fibrous paper grain, occasional soft mineral speckle. It must read as premium material only, not as an illustration or background scene.
Scene/backdrop: full-bleed edge-to-edge flat material sample with no horizon, objects, shadows, or environment.
Style/medium: high-resolution physically plausible material photography, matte, refined, austere, extremely low contrast.
Composition/framing: orthographic square material swatch; uniform density across the full frame; edge-safe and seamlessly tileable on all four sides; no focal point.
Lighting/mood: perfectly even diffuse illumination with no directional light, gradient, vignette, center glow, edge darkening, reflection, or hotspot.
Color palette: opaque black, obsidian, deep charcoal, faint graphite variation only; no hue accents.
Materials/textures: 70 percent blackened matte steel micrograin and 30 percent dark vellum fiber, blended at a fine scale without recognizable motifs.
Constraints: exactly one fully opaque 1024px square or larger; low contrast so bone-white type remains highly legible; seamless/edge-safe repeat; raw texture only; CSS will own color overlays, borders, clipping, shadows, seams, panels, and lighting.
Avoid: any text, letters, numbers, watermark, UI, interface, buttons, cards, frames, borders, glyphs, runes, symbols, icons, lines, geometric patterns, circles, triangles, grids, scratches forming shapes, cracks, stains, folds, seams, embossed marks, cyberpunk, neon, cyan, red, gold, bright silver, strong specular highlights, centered lighting, spotlight, vignette, depth-of-field, perspective, landscape, fantasy scene.
```

### `action-plate`

- `id`: `action-plate`
- `source_crop`: none. The asset was produced from a new text prompt after the Impeccable finish review required material depth for the primary action; no reference or franchise artwork was supplied to the generator.
- `output_path`: `frontend/public/assets/coreline/profile-codex/action-plate.webp`
- `prompt_metadata`: `frontend/public/assets/coreline/profile-codex/action-plate.webp.json`
- `strategy`: original text-free image generation, followed by a Lanczos resize from the 1983x793 source to a 1600x347 production plate and opaque WebP encoding. The live button owns its text, accessible name, focus state, pointer state, and fallback color.
- `dimensions`: 1600x347 px
- `format`: WebP (`yuv420p`)
- `transparency`: none; near-black exterior blends into the app's obsidian field.
- `deviations`: the requested approximate 8:1 composition produced a wider calm center with faceted side/lower material. The production crop normalizes this to the responsive button ratio while retaining the full plate silhouette.
- `qa_status`: `accepted`
- `qa`: opened from its workspace-relative output path. The plate has a calm moon-cyan center, blackened-steel facets, angular corners, and restrained depth. It contains no words, letters, numbers, logos, people, franchise motifs, runes, cyberpunk tubing, glitch, graffiti, or multicolor accents. `ffprobe` confirms 1600x347 opaque WebP.
- `prompt_used`:

```text
Create one original production UI material asset for a premium dark-fantasy fitness dashboard. A very wide horizontal faceted action plate, approximately 8:1 aspect ratio, designed to sit behind live semantic button text. Moon-cyan mineral/glass surface with blackened-steel lower facets, crisp angular cut corners, restrained internal etched geometry, subtle believable depth and highlights. Dark fantasy system-window elegance, serious and refined. Absolutely no words, letters, numbers, logos, runes, characters, people, anime art, copyrighted symbols, cyberpunk neon tubing, glitch, graffiti, rainbow colors, bloom haze, or rounded pill shape. The outer silhouette should be clean and usable as a button background; the center must remain calm enough for high-contrast dark text. Transparent background if supported; otherwise pure near-black (#050707) outside the plate. High-resolution, sharp, front-on orthographic product asset.
```

## Direct

No visible role qualifies as `direct`. No production-ready standalone photo, project artwork, logo raster, or stock source was supplied. The approved comp is reference-grade and must never ship as a crop.

## Semantic

### `app-shell-frame`

- `id`: `app-shell-frame`
- `implementation`: use the application root and a contained `<main>` with CSS custom properties for obsidian, charcoal, bone, muted graphite, and moon-cyan. Layer `obsidian-vellum.webp` as a low-opacity repeated background over a solid near-black fallback. Own the clipped outer corners, top/bottom hairlines, desktop max-width, safe-area padding, and high-contrast solid fallback in CSS.
- `notes`: never rasterize rounded viewport chrome or global shadows. Keep 320-430px mobile layouts full-width and contain larger screens without stretching row proportions.
- `qa_status`: `accepted`

### `command-bar`

- `id`: `command-bar`
- `implementation`: semantic `<header>` containing a text/SVG CORELINE wordmark link, a centered authored inline-SVG compass/core sigil, and a 48px-minimum settings `<button>` with an authored gear icon. Use CSS grid (`1fr auto 1fr`) for optical centering, etched top/bottom seams as pseudo-elements, and a visible `:focus-visible` ring/undercut. The wordmark remains real accessible text or an accessible inline vector, never pixels.
- `notes`: hide the centered decorative sigil from assistive technology unless it communicates current state. No borrowed game/franchise symbol.
- `qa_status`: `accepted`

### `portrait-orbit`

- `id`: `portrait-orbit`
- `implementation`: place subtle concentric arcs, axis ticks, and four small original diamond nodes behind the portrait using one decorative inline SVG or CSS conic/radial gradients. Keep opacity below the portrait rim light and set `aria-hidden="true"`; disable it in forced-colors mode.
- `notes`: this is code-owned geometry and must not be baked into `profile-shadow.webp`. It may scale with the portrait container but must never become a health score or unreadable HUD noise.
- `qa_status`: `accepted`

### `dossier-overlap`

- `id`: `dossier-overlap`
- `implementation`: use a semantic profile `<section>` with two grid layers: a portrait `<picture>/<img>` occupying roughly 38% of the first viewport and a content plane overlapping it. Create the single decisive diagonal edge with `clip-path: polygon(...)` on the content plane plus a 1px pseudo-element seam. Keep the portrait as an ordinary responsive image with `object-fit: cover`, `object-position` tuned per breakpoint, and meaningful alt text only if it adds information beyond the nearby profile heading.
- `notes`: CSS owns clipping, overlap, border, and shadow. At narrow widths preserve the face-in-shadow crop; at increased text sizes allow the dossier to grow rather than clipping content.
- `qa_status`: `accepted`

### `profile-copy-and-data`

- `id`: `profile-copy-and-data`
- `implementation`: render the real local display name/profile heading, plan mode, goal, intensity, and relevant metadata from versioned selectors using `<h1>`, definition-list pairs, and readable body text. Replace all gray mock bars with real content or explicit empty-state copy; never present invented rank, readiness, body score, diagnosis, or AI claim.
- `notes`: text must wrap in German and English. Use tabular numerals only for genuine measurements and expose units in visible text.
- `qa_status`: `accepted`

### `sigil-icon-registry`

- `id`: `sigil-icon-registry`
- `implementation`: author a single inline-SVG `SystemIcon` registry on a 24x24 viewBox with approximately 1.75px strokes, `currentColor`, round-safe line joins where needed, and consistent optical bounds. Required icons visible in the comp are core/compass, settings, overview/person, plan/triangle, history/clock, everyday/sunrise, training/dumbbell, nutrition/bowl-leaf, sleep/crescent, supplements/capsule, chevron, today, food, and profile. Use original geometric construction; expose a label on icon-only buttons and mark duplicate decorative instances `aria-hidden`.
- `notes`: icons remain vector; no raster sprites, emoji, copied franchise glyphs, or icon-only meaning without a text/accessible label.
- `qa_status`: `accepted`

### `profile-tabs`

- `id`: `profile-tabs`
- `implementation`: implement `Übersicht`, `Plan`, and `Verlauf` as a WAI-ARIA tablist with three `<button role="tab">` controls and associated tabpanels. The active state owns a moon-cyan underline/undercut wedge, brighter icon/text, and `aria-selected`; inactive states retain readable bone/graphite contrast. Support arrow-key navigation and visible keyboard focus.
- `notes`: use real localized labels and preserve 44px-minimum targets. At 320px, allow compact icon/label spacing without truncating the active label.
- `qa_status`: `accepted`

### `plan-matrix-rows`

- `id`: `plan-matrix-rows`
- `implementation`: use a `<section>` headed by real accessible text and a five-item list of full-width 56-64px semantic buttons/links for Alltag, Training, Ernährung, Schlaf, and Supplemente. Each row composes a vector icon cell, localized title, one/two lines of real local summary, and a chevron. Use CSS grid columns for icon/title/summary/chevron, clipped corner pseudo-elements, etched dividers, hover/pressed/focus states, and a clear empty-state summary rather than skeleton bars.
- `notes`: rows must expand vertically for translated or user-supplied content. Ensure all summary values come from local selectors/provider-backed state and never fabricate sleep, dose, readiness, or completion data.
- `qa_status`: `accepted`

### `signature-diagonal-seam`

- `id`: `signature-diagonal-seam`
- `implementation`: draw one low-intensity moon-cyan diagonal across the matrix with a pointer-events-none pseudo-element or decorative SVG line positioned behind row text/icons but above the material layer. Mask it at row labels and interactive focus rings when necessary; omit it under forced colors and reduce opacity on narrow/high-zoom layouts.
- `notes`: the seam is a compositional signature, not a progress meter and not part of either raster.
- `qa_status`: `accepted`

### `primary-plan-cta`

- `id`: `primary-plan-cta`
- `implementation`: a real wide `<button>` labeled with localized `Profil & Ziele bearbeiten`, using `action-plate.webp` as a text-free material layer beneath live dark readable text, a 48px-minimum height, and explicit hover/pressed/focus/disabled states. It opens the existing local profile editor and preserves completed logs.
- `notes`: the generated plate never owns text or meaning. A solid moon-cyan fallback keeps the CTA legible when imagery is unavailable or high-contrast rendering simplifies the surface. Plan replacement remains a separate future review/apply action.
- `qa_status`: `accepted`

### `cta-flank-sigils`

- `id`: `cta-flank-sigils`
- `implementation`: render the two small flanking compass nodes and hairlines as mirrored decorative inline SVG or pseudo-elements within the CTA section, behind the button hit area and `aria-hidden="true"`.
- `notes`: remove at 320px or high zoom if they compete with the action. Keep moon-cyan reserved for the actionable center rather than glowing every line.
- `qa_status`: `accepted`

### `bottom-navigation`

- `id`: `bottom-navigation`
- `implementation`: semantic `<nav aria-label="Hauptnavigation">` with five real links/buttons: Heute, Essen, Training, Supps, Profil. Compose each from the shared authored SVG registry and localized text. Mark the active route with `aria-current="page"`, moon-cyan icon/text, and a CSS wedge/undercut; keep inactive items bone/graphite. Apply bottom safe-area padding and 44px-minimum individual targets.
- `notes`: use a five-column grid from 320-430px, avoid horizontal scrolling, and retain text labels rather than relying on icons alone.
- `qa_status`: `accepted`

### `motion-system`

- `id`: `motion-system`
- `implementation`: use short CSS transform/opacity/mask transitions: dossier plane reveals directionally over the portrait, tab content changes with a restrained 8-16px lateral slice, and the active-nav wedge glides between destinations. Recommended timing is 160-240ms with a decisive ease-out; keep state changes immediate for assistive technology and set all transforms/transitions to none under `prefers-reduced-motion: reduce`.
- `notes`: no bounce, glitch, RGB split, scanline, looping fog animation, or motion that delays interaction. The raster smoke remains static.
- `qa_status`: `accepted`

### `responsive-accessibility-contract`

- `id`: `responsive-accessibility-contract`
- `implementation`: preserve landmark order, heading hierarchy, keyboard operation, 44x44px targets, `:focus-visible`, readable contrast, and 200% text zoom. At 320px, collapse the dossier copy to the essential local fields while keeping edit access; at desktop, center the phone-like content column and optionally widen only data panels. Provide a solid obsidian fallback if texture loading fails and a forced-colors fallback for clipped controls/seams.
- `notes`: image presence must not gate profile comprehension. The anonymous portrait is atmospheric; local data and actions remain semantic and offline-capable.
- `qa_status`: `accepted`

## Execution order

1. Produce and QA `profile-shadow.webp` against the portrait role in the approved comp.
2. Produce, normalize, edge-reconstruct, and tiled-QA `obsidian-vellum.webp`.
3. Establish app-shell material tokens and compose those rasters as low-level ingredients.
4. Build the semantic command bar, dossier overlap, profile data, icon registry, tabs, matrix rows, seam, CTA, and bottom navigation.
5. Produce and QA `action-plate.webp` beneath the live primary-action text in response to finish-review material direction.
6. Add state motion, localization resilience, reduced-motion behavior, forced-colors fallbacks, and responsive QA.

## Blockers

None for this asset-production pass.

## Assumptions

- The implementation will crop the portrait through CSS; the raster intentionally contains more vertical body coverage than the first-viewport comp.
- The portrait's atmosphere is decorative and never communicates readiness, rank, health, or plan status.
- The material texture is used at low opacity over a solid obsidian fallback and may be repeated at or near its native 1024px tile size.
- Moon-cyan focus light, diagonal seams, icons, panels, and all typography are implementation-owned, not raster content.
- WebP prompt provenance is stored in the Impeccable script's documented `.webp.json` sidecar because that script does not write prompt metadata inside WebP bitstreams.
