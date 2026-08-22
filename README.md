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
- Daily supplement routine plus a bilingual knowledge library.
- Calories, protein, carbohydrates, fat and sugar targets/logging; curated
  recipe architecture that can accept a larger imported catalog later.
- Manual daily workouts, local plan generation, resumable set tracking and
  completion guards.
- Contextual guide with a safe local fallback and an explicit consent boundary
  for a real server-side AI provider.
- Nearby-store UI for country, budget, radius and address/current location;
  free OpenStreetMap search works without a paid maps API, while the UI shows
  results only after a successful live provider response.
- Installable PWA shell, local assets, safe-area support and offline reload.
- Native Android app packaging with the same approved CORELINE design and logo,
  approximate-location permissions, and free on-device background reminders.
- Account-backed friends, live presence, RPG stat inspection, Aura/Focus,
  revision-aware cross-device sync, Guild rosters, weekly leaderboards and raids.
- Adaptive character quests that preserve the equipped character path while
  reducing real sets/reps and increasing rest when the 48-hour heatmap is high.
- Optional Web Push while the PWA is closed, including quiet hours, snooze,
  streak rescue, unfinished sets, hydration/meal checks, recovery and routines.
- Explicit nutrition-label OCR verification with a visible confidence and
  database-versus-label mismatch state. The image is uploaded only after a tap.

## Repository layout

```text
frontend/                    React 18 + TypeScript + Vite PWA
frontend/android/            Native Capacitor Android project and approved icon
backend/app/integration_app.py
                             Public account/Guild/push/verification + provider API
backend/app/main.py           Historical compatibility server
backend/tests/                System, provider, safety and boundary tests
.github/workflows/pages.yml   Validation and GitHub Pages deployment
.github/workflows/android.yml Android debug APK validation and download artifact
DESIGN.md                     Current product visual language
legacy/                       Historical reference only
```

## Frontend development

Node.js 24 is used in CI (minimum supported runtime: Node.js 22).

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

The managed backend URL is supplied at build time as `VITE_BACKEND_URL`. Users
never have to enter an IP address or technical server setting. The UI verifies
provider capabilities; configuring an address alone does not enable paid AI or
maps integrations.

## Android APK

The Android app is the existing CORELINE experience packaged with Capacitor;
there is no second Replit/Floot project, copied dashboard, paid maps API, or
Firebase requirement. Its application ID is `app.coreline.tracker`.

Each frontend pull request and push to `main` runs the **Build Android APK**
workflow. Open its completed run in GitHub Actions and download the
`CORELINE-Android-APK` artifact to obtain `CORELINE-android.apk` for Android.
Android may ask whether the browser is allowed to install this downloaded app.

The APK keeps the approved CORELINE emblem, dark launch screen, bundled offline
web assets, current managed backend, and the live character-path onboarding.
Location requests ask only for approximate access when the user chooses the
nearby-store feature. Native reminders are scheduled directly on the phone,
respect the selected quiet hours and categories, survive app closure, and do
not require an account, Firebase, or a paid provider.

Developers with Android Studio and Android SDK 36 can build locally:

```bash
cd frontend
npm ci
VITE_BACKEND_URL=https://77.90.30.225 npm run android:apk
```

The generated debug APK is suitable for direct testing. A Google Play release
requires the owner's own signing key and Play Console account; no keystore,
password, signing secret, or Firebase credential is committed to this project.

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

For architecture and safety boundaries, see [PRODUCT.md](PRODUCT.md),
[DESIGN.md](DESIGN.md) and [backend/README.md](backend/README.md).
