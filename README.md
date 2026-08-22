# CORELINE · Supplement, nutrition and training tracker

CORELINE is a mobile-first, offline-first React PWA for planning and recording
supplements, food and training. The public app works without an account or
server: profile data, plans, meals, supplement checks and workout sessions stay
in the browser and can be exported as JSON.

**Live app:** https://weeeedddd.github.io/Supplement-Tracker/

## Product principles

- Local data is the source of truth. A configured server never silently turns
  on cloud sync.
- Supplement information is educational and evidence-oriented; the app does
  not prescribe doses, diagnose conditions or promise fictional physiques.
- “AI” labels are used only for a verified remote provider response. Otherwise
  the assistant and onboarding fall back to clearly labelled local rules.
- Address or coordinates are sent only after one-time location consent and only
  to the store-search endpoint. They are never included in AI context.
- The visual system is original: a restrained obsidian dossier aesthetic with
  text-only inspiration profiles and no franchise artwork.

## Current features

- Four-step onboarding with Own Path, text-only Inspiration Profiles and an
  optional remote AI plan path; age, schedule, sleep, food, experience,
  equipment and recovery context are bounded before plan generation.
- Profile dashboard with local plan, nutrition, training, supplement and
  activity summaries.
- Daily supplement routine plus a bilingual knowledge library, with a
  "have it / need it" answer per product and, when it is missing, map searches
  for shop categories that stock it plus neutral online search links.
- A one-day food plan offered when a character path is equipped: accept it
  while the offer is open, decline it because you follow your own, or let it
  lapse. Accepted plans appear on the Food screen with a log action per meal.
- Calories, protein, carbohydrates, fat and sugar targets/logging; curated
  recipe architecture that can accept a larger imported catalog later.
- Manual daily workouts, local plan generation, resumable set tracking and
  completion guards.
- Contextual guide with a safe local fallback and an explicit consent boundary
  for a real server-side AI provider.
- Nearby-store UI for country, shop type (groceries or supplement shops),
  budget, radius and address/current location;
  search unlocks only when the server enables the maps integration, and the UI
  shows results only after a successful live provider response.
- Installable PWA shell, local assets, safe-area support and offline reload.
- A real installable Android app (Capacitor). The web bundle ships inside the
  APK, so the app runs from local files rather than loading the hosted site,
  and reminders become genuine OS alarms that survive a reboot.
- Account-backed friends, live presence, RPG stat inspection, Aura/Focus,
  revision-aware cross-device sync, Guild rosters, weekly leaderboards and raids.
- Adaptive character quests that preserve the equipped character path while
  reducing real sets/reps and increasing rest when the 48-hour heatmap is high.
- Optional Web Push while the PWA is closed, including quiet hours, snooze,
  streak rescue, unfinished sets, hydration/meal checks, recovery and routines.
- Backend-free background reminders: the app publishes a schedule the service
  worker evaluates on periodic background sync, so training, routine, hydration
  and meal checks can also fire while the app is closed and no account exists.
- Explicit nutrition-label OCR verification with a visible confidence and
  database-versus-label mismatch state. The image is uploaded only after a tap.

## Repository layout

```text
frontend/                    React 18 + TypeScript + Vite PWA
frontend/android/            Capacitor shell for the installable Android app
frontend/capacitor.config.ts Native app id, name and plugin configuration
backend/app/integration_app.py
                             Public account/Guild/push/verification + provider API
backend/app/main.py           Historical compatibility server
backend/tests/                System, provider, safety and boundary tests
.github/workflows/pages.yml   Validation and GitHub Pages deployment
.github/workflows/android.yml Android APK / Play bundle builds
DESIGN.md                     Current product visual language
legacy/                       Historical reference only
```

## Android app

The installable app wraps the same web build in a Capacitor shell. Nothing is
loaded from GitHub Pages at runtime: `npx cap sync` copies `frontend/dist` into
the APK. Because the app is its own origin, it starts with empty local data —
it does not inherit anything stored by the website.

Reminders behave differently in the app. Instead of the browser fallback the
shell schedules real `LocalNotifications` alarms, so training, routine,
hydration and meal checks fire while the app is fully closed and are restored
after a reboot.

```bash
cd frontend
npm ci
npm run build            # produce dist/
npx cap sync android     # copy the bundle and plugin config into android/
cd android
./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

Requires JDK 21 and an Android SDK (`ANDROID_HOME`); the Gradle build downloads
the platform and build tools it needs. `node scripts/generate-android-icons.mjs`
(with `npm install --no-save sharp`) regenerates the launcher, notification and
splash artwork from the CORELINE mark.

Run **Actions → Build Android app** to get a sideloadable debug APK as a
workflow artifact. Pushing a `v*` tag additionally builds a release APK and a
Play `.aab` and attaches both to a GitHub release. The release build is signed
only if the repository defines `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`;
without them it is produced unsigned and cannot be uploaded to Play.

An iOS build is not set up: it needs macOS, Xcode and a paid Apple Developer
account, none of which CI here provides.

## Frontend development

Node.js 24 is used in CI (minimum supported runtime: Node.js 20.19).

```bash
cd frontend
npm ci
npm run test
npm run build
npm run dev
```

The production build is written to `frontend/dist`. Pushes to `main` run the
locked dependency audit, tests and production build before GitHub Pages is
deployed. Do not commit `dist` or place API keys in `VITE_*` variables.

An optional backend URL can be entered under **Settings → Integrations** or set
at build time as `VITE_BACKEND_URL`. The UI verifies provider capabilities; a
saved URL alone does not enable remote AI or maps.

## Optional CORELINE System backend

The recommended deployment target exposes the bounded account, friend, Guild,
revisioned sync, push-subscription, label-verification, AI-plan, assistant and
nearby-store routes. It does not expose the historical chat, media upload or
anonymous scan-history routes from `app.main`.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q

# Public system process
uvicorn app.integration_app:app --host 0.0.0.0 --port 8000

# Or build the unprivileged container
docker build -t coreline-system .
docker run --rm -p 8000:8000 --env-file .env coreline-system
```

Copy `backend/.env.example` to an untracked environment file on the server.
Required provider settings are documented in [backend/README.md](backend/README.md).
Secrets must remain in the hosting platform's secret manager.

Closed-app push additionally needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` and `PUSH_CRON_SECRET`. Run `python -m app.push_worker` from a
platform scheduler every 5–10 minutes, or call the protected
`POST /api/v1/push/process` route with `X-Coreline-Cron`. The worker enforces
each account's timezone, quiet hours, snooze and per-message deduplication.

Important: the current provider routes are anonymous and protected only by
strict schemas, bounded payloads/timeouts and a process-local rate limit. Do
not expose cost-bearing OpenAI or Google Maps keys publicly until the product
chooses either real accounts with per-user quotas or a deliberately limited
guest policy with edge rate limiting, bot protection and a hard spend cap.
Even with provider keys present, the server is default-deny until an operator
explicitly sets `PUBLIC_INTEGRATIONS_ENABLED=true` after those controls exist.

## Validation baseline

```bash
cd frontend
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
npm run build

cd ../backend
.venv\Scripts\python.exe -m pytest -q   # Windows
```

For the native shell, add:

```bash
cd frontend
npx cap sync android
cd android && ./gradlew assembleDebug
```

For architecture and safety boundaries, see [PRODUCT.md](PRODUCT.md),
[DESIGN.md](DESIGN.md) and [backend/README.md](backend/README.md).
