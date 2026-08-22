# CORELINE first-run onboarding and social design QA

## Visual truth and browser evidence

Source visual truth paths:

- `/workspace/scratch/a47aa484e633/upload/01-Screenshot_2026-08-21-22-13-22-900_com.android.chrome.jpg`: previous crowded Guild state; **471 × 1536 px**.
- `/workspace/scratch/a47aa484e633/upload/02-1000031942.jpg`: first-run body, BMI, fitness, and activity summary; **690 × 1536 px**.
- `/workspace/scratch/a47aa484e633/upload/04-1000031943.jpg`: calorie, macro, and hydration recommendation hierarchy; **690 × 1536 px**.
- `/workspace/scratch/a47aa484e633/upload/07-1000031946.jpg`: anime-inspired character-selection hierarchy; **690 × 1536 px**.

Implementation screenshot paths:

- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-onboarding-selection.jpg`: seven character cards and first-run route selection; **1363 × 936 px**.
- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-system-contract.jpg`: first contract comparison, before the action-visibility correction; **1363 × 936 px**.
- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-system-contract-fixed.jpg`: corrected contract with persistent accept action; **1363 × 936 px**.
- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-onboarding-summary.jpg`: personalized body, nutrition, hydration, and training result; **1363 × 936 px**.
- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-settings-managed-final.jpg`: managed-services settings with one permanent appearance; **1363 × 936 px**.
- `/workspace/scratch/a47aa484e633/design-qa-evidence/coreline-guild-clean.jpg`: focused Friends & Guild service-unavailable state; **1363 × 936 px**.

Browser viewport: **1363 × 936 CSS px**. Implementation device pixel ratio: **1**. Implementation CSS screenshot size and pixel dimensions are both **1363 × 936**. Sources are supplied mobile phone captures with browser/device chrome and no declared device pixel ratio; no invented density conversion was applied. The source and implementation therefore intentionally differ in viewport and aspect ratio. Comparisons were normalized by judging their relevant content regions, equivalent onboarding or social state, information order, and existing CORELINE design tokens rather than comparing phone browser chrome to a desktop capture. The existing responsive breakpoints at 720 px, 640 px, and 520 px were inspected in the implementation; an independent real-phone capture was not available in the cloud browser.

States: initial activation and selected Toji path; one System Contract; female body model with a 26-year-old, 170 cm, 68 kg intermediate athlete training four days weekly; optional lifestyle details; personalized muscle-building result; settings after onboarding; existing profile and Friends & Guild unavailable state.

## Full-view and focused comparison evidence

- The character-path reference and `coreline-onboarding-selection.jpg` were opened together in one comparison input. The implementation preserves visual path-first hierarchy using seven original, optimized character illustrations and the existing CORELINE visual language instead of copying the reference's lightning, promotional frame, or unrelated palette.
- The body-summary reference and `coreline-onboarding-summary.jpg` were opened together in one comparison input. Both present body data, BMI, experience, activity, calories, macros, hydration, rest, and weekly training as a progressive first-run result; CORELINE intentionally retains its sharper existing borders, typography, and restrained dark palette instead of adopting the reference application's rounded-card branding.
- The previous crowded Guild reference and `coreline-guild-clean.jpg` were opened together in one comparison input. The implementation replaces simultaneous conflict resolution, error banners, friend forms, guild creation, and invite inputs with one understandable service state and a retry action.
- The first contract screenshot and `coreline-system-contract-fixed.jpg` were compared in the identical **1363 × 936 CSS px** viewport and interaction state. The revised primary action is fully visible at **y=775–827 px** inside the **936 px** viewport; contract details independently scroll beneath a persistent header.
- Focused region comparison used the readable contract hero/heading/recommendation/action region and the settings modal/connection-control region in the full-resolution captures. No additional cropped asset was needed because all important labels, primary actions, and absent server/theme controls were legible in the supplied full-resolution images and were independently checked in the browser accessibility tree.

## Required fidelity surfaces

- **Fonts and typography:** Existing condensed CORELINE display headings, readable established body typography, compact system labels, accessible semantic headings, and selected-state labels were preserved. Longer German and English strings use the existing wrapping and responsive rules.
- **Spacing and layout rhythm:** Four explicit onboarding stages, collapsed optional disclosures, separate social tasks, consistent existing border rhythm, practical action spacing, independently scrollable contract details, and a persistently visible contract action reduce the density visible in the old Guild capture.
- **Colors and tokens:** The approved dark `shadow` appearance is enforced at startup. Existing near-black surfaces, warm text, muted dividers, restrained mint/cyan accents, and semantic warning colors are retained. Alternative Night/Moonlight/Ember selectors are removed rather than introducing a second appearance.
- **Image quality and assets:** Seven original WEBP character images are used for Toji, Goku, Tanjiro, Ken Kaneki, Sanji, Baki, and Mikasa. Images are sized and cropped for their actual cards and hero slots, preserve the existing low-saturation visual treatment, and avoid copied character artwork, placeholder drawings, lightning, cyberpunk effects, or glitch styling.
- **Copy and content:** App copy clearly distinguishes local planning from connected AI, explains controlled surplus/deficit assumptions, treats BMI and hydration as adjustable estimates, keeps supplement recommendations non-prescriptive, and avoids exposing backend URLs, server addresses, raw fetch errors, or configuration instructions to ordinary users.
- **Accessibility and interaction:** Character cards communicate their selected state, progress is exposed semantically, female/male/neutral body options are labelled, dialog focus and close actions remain accessible, recommendation and summary regions have names, reduced-motion preferences are preserved, and action buttons remain available without scrolling past the contract.

## Comparison history and findings

1. **Iteration one — resolved [P2]: contract primary action below the visible viewport.**
   - Location: `AuthScreens.tsx`, `.character-system-window`, and `.character-system-equip`.
   - Evidence: `coreline-system-contract.jpg` displayed the contract hero and recommendations but clipped `Accept & equip` beneath the lower edge.
   - Impact: A new user, especially on a phone, could miss the only action that activates their selected character path.
   - Fix: Place the variable-height hero, description, and recommendation content inside `.character-system-scroll`; make the dialog a constrained flex column and keep its header and primary action outside the scroll region.
   - Revised evidence: `coreline-system-contract-fixed.jpg`; browser-measured primary action bounds **775–827 px**, fully within the unchanged **936 px** viewport.
2. **Iteration two — resolved [P2]: multiple optional visual appearances contradict the requested single permanent system appearance.**
   - Location: `App.tsx` and `SettingsPanel.tsx`.
   - Evidence: An initial settings accessibility snapshot exposed `Night`, `Moonlight`, and `Ember` choices.
   - Impact: Users could unintentionally replace the requested unified dark appearance and increase settings complexity.
   - Fix: Apply the approved `shadow` appearance at startup and remove the complete appearance-switching fieldset from normal settings.
   - Revised evidence: `coreline-settings-managed-final.jpg`; browser DOM verified `data-theme="shadow"`, no appearance selector, and no visible server URL or IP entry.
3. **Iteration three — resolved [P2]: the live header exposed unnecessary backend terminology.**
   - Location: `App.tsx`, `backendLabel`.
   - Evidence: The first published release displayed `Backend reachable` after its managed service connected successfully.
   - Impact: Technical infrastructure vocabulary contradicted the request for a clean, self-explanatory user-facing system.
   - Fix: Replace user-visible backend availability labels with the existing product's plain-language `System online` / `System offline` states.
   - Revised evidence: final published-app browser accessibility snapshot and verified managed-service connection state.

Open P0, P1, or P2 findings: **none**.

Follow-up [P3]: A separate physical-phone screenshot would provide stronger evidence for the supplied portrait aspect ratio; the cloud-browser runtime offered a fixed desktop viewport, so phone-specific responsive rules and contract visibility were additionally inspected in source and behavior without claiming an unavailable handset capture.

## Primary interactions and console checks

- Selecting Toji sets the selected card state without automatically opening a dialog.
- Selecting `Open System Contract` creates exactly one contract overlay.
- Selecting `Accept & equip` equips the path once and advances to body/training setup.
- Selecting `Female figure`, entering 26 years / 170 cm / 68 kg, choosing intermediate experience, four weekly days, muscle building, and full-gym equipment persists the expected profile inputs.
- Optional schedule, food, and recovery questions remain collapsed by default.
- The local preview reports BMI **23.5**, **2350 kcal**, **120 g protein**, **310 g carbohydrate**, **70 g fat**, a controlled **+140 kcal/day** surplus, **2.2 L** hydration estimate, **45 min** session duration, **90 s** initial rest, and **4 sessions/week**.
- Completing onboarding updates the dashboard and profile with those targets, the female muscle model, and the exclusive Toji path.
- Settings have no backend/IP input and no alternate appearance controls; services are automatically managed.
- Profile → Guild opens `Friends & Guild` without exposing technical setup instructions, raw network errors, or backend configuration.
- Browser error logs were inspected. Entries originated solely from the cloud browser's own `chrome-extension://` metadata bridge; no application JavaScript exception was present.

## Implementation checklist

- Preserve the approved existing CORELINE system appearance: complete.
- Keep infrastructure addresses outside ordinary UI: complete.
- Keep character acceptance visible on constrained displays: complete.
- Provide goal-aware, transparent first-run results and selected muscle model: complete.
- Verify onboarding, profile, settings, and social empty states in a real browser: complete.
- Re-run frontend, backend, build-budget, shell, and whitespace checks before publication: complete.

final result: passed
