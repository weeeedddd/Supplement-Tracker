# Performance ledger

Performance changes are kept only when the same production build measurement
shows a material improvement and correctness checks remain green.

## 2026-08-12 · Initial-load pass

Measurement command: `cd frontend && npm run build` with Vite 7.3.6 on the
same worktree and dependency lock.

| Change | Before | After | Verdict |
|---|---:|---:|---|
| Lazy-load Food, Training and Profile together | Initial JS 584.05 kB / 182.84 kB gzip | 402.72 kB / 135.09 kB gzip | Kept: −31.1% raw, −26.1% gzip; Vite’s 500 kB warning removed |
| Use only required Latin WOFF2 sources | 24 emitted WOFF/WOFF2 files | 6 emitted WOFF2 files | Kept: German glyphs remain covered; obsolete fallback and redundant subset payloads are no longer precached |

The lazy screens share a 144.55 kB `fitness` chunk so the recipe catalog is no
longer part of onboarding/Today startup. A generated Vite asset manifest lets
the service worker precache every lazy JavaScript and CSS chunk. A mobile
production-preview check confirmed that only the entry script loads on Today,
that Food loads its own chunk plus the shared catalog, and that Food, Training
and Profile all still open after an offline reload.

The build now enforces budgets of 200 KiB gzip for initial JavaScript and
50 KiB gzip for initial CSS. Field Core Web Vitals are not collected yet; add
privacy-conscious real-user measurement only after the analytics product and
consent policy are chosen.
