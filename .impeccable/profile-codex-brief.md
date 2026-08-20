# CORELINE application shell — Profile Codex

## Scope and mode

- Scope: mobile-first application shell and personal profile surface, with shared visual grammar for onboarding, Today, Food, Training, Supplements, Assistant, and Shopping.
- Visitor mode: Operate.
- Approved comp: `.impeccable/mocks/comp-c-profile-codex.webp`.

## Audience, job, action, and proof

- Audience: fitness users who want one understandable daily system shaped around their actual life.
- Job: inspect and edit the profile that drives training, nutrition, recovery, and supplement tracking.
- Primary action: edit the local profile and goals without silently wiping logged choices or replacing completed work. Plan regeneration remains a separate, explicit future review/apply flow.
- Proof/content: canonical local profile, lifestyle answers, current plan, session history, food totals, sleep context, supplement protocol, and sourced supplement information.

## Chosen direction

Profile Codex uses a familiar premium fitness-dashboard topology inside an original dark-fantasy player-status world. Obsidian and charcoal fields, bone text, one moon-cyan accent, clipped planes, fine etched seams, and original geometric sigils carry every control. The memorable moment is the personal dossier plane sliding over an anonymous portrait and continuing as one diagonal seam through the editable plan matrix.

Menus use directional mask/slide motion with reduced-motion fallbacks. No franchise art, borrowed symbols, cyberpunk glitches, neon grids, graffiti, pseudo-medical scores, or fabricated live data.

## Composition and implementation inventory

| Visible ingredient | Commitment | Medium |
| --- | --- | --- |
| Command bar | CORELINE wordmark, centered original sigil, settings action; 48 px minimum controls | Semantic header + CSS + authored SVG |
| Profile portrait | Anonymous adult in ordinary training clothing, face unreadable, deep shadow, no fictional resemblance | New generated local WebP raster; never crop from the comp |
| Dossier overlap | Portrait occupies about 38%; information plane clips over it with one decisive diagonal seam | Semantic section + CSS clip-path/pseudo-elements |
| Surface material | Low-contrast blackened-steel/dark-vellum grain across most of the viewport | New generated seamless local WebP texture with solid-color fallback |
| Profile copy | Real local name and plan metadata; never invent rank, readiness, health state, or body score | Semantic HTML from versioned profile selectors |
| Original sigils | Approximately 10–14 geometric fitness/lifestyle symbols with consistent 24 px geometry and 1.75 px strokes | Authored SVG icon registry; no raster icons or emoji |
| Profile tabs | Übersicht, Plan, Verlauf; active cyan undercut and keyboard-visible focus | Semantic tablist/buttons + CSS |
| Plan matrix | Alltag, Training, Ernährung, Schlaf, Supplemente in five full-width 56–64 px rows | Semantic buttons/links + CSS; SVG icons |
| Signature seam | One cyan diagonal crosses the matrix at low intensity without obscuring labels | CSS pseudo-element/SVG; disabled in high-contrast fallback if needed |
| Primary action | PROFIL & ZIELE BEARBEITEN as a wide faceted cyan/blackened-steel control with restrained material depth | Generated local WebP plate beneath live semantic button text; no rasterized text |
| Bottom navigation | Heute, Essen, Training, Supps, Profil with five matching icons and active wedge | Semantic nav + authored SVG + CSS |
| Motion | Dossier reveal, directional tab change, active-nav wedge; no bounce or glitch | CSS transform/opacity/mask with `prefers-reduced-motion` fallback |

## Cross-surface translation

- Today inherits the command bar, clipped module rows, and one decisive action; it does not require the full portrait.
- Onboarding uses the dossier as a staged lifestyle interview and clearly marks local versus real-AI generation.
- Food, Training, and Supplements inherit the matrix rows, icon registry, seams, typography, and material depth.
- Shopping is a real-provider state machine with permission, loading, unavailable, and freshness states; no old simulated cards return.

## Constraints and unresolved decisions

- Maintain German/English layout resilience, 320–430 px mobile support, desktop containment, landmarks, keyboard operation, and 44×44 px targets.
- The real AI and store locator require a separately deployed backend; the static frontend must retain honest offline fallbacks.
- Launch country, backend host, maps provider, exact-location policy, age boundary, and live retailer coverage remain product decisions.
