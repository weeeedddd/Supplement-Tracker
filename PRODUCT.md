# CORELINE Product Truth

## Product

CORELINE is an offline-first mobile fitness companion that brings supplement tracking, nutrition, training, recovery, and practical shopping preparation into one coherent daily system. It helps people turn their real schedule and constraints into an understandable plan, then track what they actually do without pretending to diagnose, prescribe, or replace qualified medical care.

The public product is currently a React/Vite PWA hosted on GitHub Pages. Local use must remain useful without an account or network connection. Real AI, store lookup, and any future synchronization use explicit server boundaries rather than browser secrets or simulated data.

## Primary users and jobs

- People building a consistent fitness routine who want one place for daily training, meals, supplements, hydration, and recovery context.
- Users who need a plan shaped around work or school, sleep, meal rhythm, available training days, equipment, experience, preferences, and goals.
- Users who want neutral, sourced explanations of common supplements without autonomous dosing or medical-style recommendations.
- Users who want a budget-aware shopping list and genuinely nearby supermarkets, with honest coverage and freshness limits.

## Core experience

1. A richer first-run interview captures identity, goal, training context, typical day, sleep, food habits, cooking access, recovery, and constraints.
2. The user chooses Own Path, a text-only Inspiration Profile, or an AI-assisted plan and selects light, medium, or hard intensity.
3. A bounded initial plan is reviewed by the user before being stored locally.
4. A personal dashboard shows today's priorities, current plan, progress, recovery context, and editable profile information.
5. Training supports both manually built daily workouts and generated sessions; only completed sets and valid sessions count.
6. Nutrition exposes calculated calorie and macro targets plus calories, protein, carbohydrates, fat, and sugar totals with validated logging.
7. Supplements have a cited information library, separate selection and completion controls, and no generated dose prescriptions.
8. A contextual assistant explains choices using only consented context. It is labeled as local guidance when offline and as AI only when a real backend response was received.
9. Shopping accepts country, budget, store preferences, and a consented location or address. Nearby-store results must come from a real provider; prices and stock are never fabricated.

## Trust and safety rules

- No API keys, privileged credentials, or fake authentication in the browser bundle.
- OpenAI calls go through a separately deployed backend/BFF using the Responses API, schema-validated inputs and outputs, rate limits, spend limits, explicit consent, and a transparent local fallback.
- Exact address or coordinates are never sent to the AI plan endpoint. Store lookup is a separate purpose-limited request, and raw location is not persisted by default.
- No diagnoses, medication advice, autonomous supplement stacks, personalized supplement doses, extreme calorie targets, or promises of achieving a fictional body.
- Inspiration profiles are user-selected training language only. No copyrighted character artwork is used.
- Supplement explanations use neutral claims, limitations, cautions, source links, and review dates from authoritative primary sources.
- Live prices, inventory, travel time, and store distance are shown only when the connected provider actually supplies them, with freshness and coverage labels.
- The interface must be accessible, keyboard-usable, reduced-motion aware, and comfortable on 320–430 px mobile screens with at least 44×44 px primary touch targets.

## Data and architecture

- Canonical, versioned local profile and lifestyle schema with migrations; no dependency on the removed legacy-auth shape.
- Local persistence remains the default for profile, plans, meals, workouts, supplement completion, and progress.
- Future accounts and sync are an explicit later layer, not pseudo-auth in this pass.
- Provider contracts isolate AI, geocoding/places, live product search, and retailer data so integrations can be swapped without rewriting product screens.
- Generated/local imagery is stored with the app for reliable PWA use. Remote image hotlinks are not part of the offline-critical experience.

## Brand and visual intent

CORELINE should feel like a premium personal performance console: disciplined, energetic, precise, and human rather than clinical or cartoonish. The hierarchy should prioritize today's action, use editorial original imagery selectively, and rely on a consistent icon family instead of emoji controls. Motion should communicate state and progress, never distract or hide information.

The visual system must remain readable in light and dark themes and in German and English. Inspiration profiles may use original abstract silhouettes, materials, and color worlds, but never recognizable copyrighted character depictions.

### Confirmed visual benchmark

The user deliberately chose a familiar premium fitness-dashboard structure, elevated through an original dark-fantasy “player system” treatment. The craft benchmark is the focused status-window clarity associated with Solo Leveling, the dark elegance and mysterious symbol quality associated with The Eminence in Shadow, and the decisive menu choreography associated with Persona 5. These references define quality and interaction energy only; CORELINE must not reproduce their characters, logos, glyphs, exact layouts, illustrations, or other protected assets.

- Obsidian and charcoal surfaces with bone-white text and one restrained moon-cyan focus accent.
- Sharp, deliberate panel geometry and fine etched seams; glow is rare and communicates focus or progress rather than decorating every edge.
- Clean condensed display typography paired with an exceptionally readable workhorse UI face.
- Original geometric sigils and fitness-specific icons, never borrowed franchise symbols or emoji controls.
- Menus transition with controlled slices, masks, and directional movement; no graffiti, RGB splitting, scanline noise, glitch effects, or cyberpunk neon grids.
- Editorial imagery, where used, is original and anonymous: human movement, food, materials, and equipment rather than copyrighted fictional characters.

## Confirmed decisions

- Keep the GitHub Pages PWA and offline-first local behavior.
- Add a secure backend boundary for real AI and real nearby-store lookup.
- Use OpenAI only server-side; users explicitly approve which lifestyle fields leave the device.
- Keep AI and location/store data separated.
- Do not store exact addresses by default.
- Preserve a deterministic local plan and assistant fallback when the network or provider is unavailable.
- Replace fabricated shopping results rather than re-enabling them.
- Use original/generated product imagery and consistent icons; no web-pulled or copyrighted character art.

## Open decisions

- Production backend host and operational budget.
- Initial launch market and currency: Germany, Austria, or broader EU.
- Store provider: commercial Places data or a production-capable OpenStreetMap-based service.
- Whether “nearest” means straight-line distance or walking/driving time.
- Whether launch shopping includes only a budgeted ingredient list and locator, or later retailer price/inventory feeds.
- Account/sync provider and retention policy for future releases.
- Minimum user age and the final under-18 consent policy.
- Final mobile composition within the confirmed dark-fantasy system-window direction, to be selected from the Impeccable comp review.
