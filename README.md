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
  search unlocks only when the server enables the maps integration, and the UI
  shows results only after a successful live provider response.
- Installable PWA shell, local assets, safe-area support and offline reload.

## Repository layout

```text
frontend/                    React 18 + TypeScript + Vite PWA
backend/app/integration_app.py
                             Minimal public AI/maps integration API
backend/app/main.py           Legacy full backend; not the recommended public target
backend/tests/                Provider, safety and boundary tests
.github/workflows/pages.yml   Validation and GitHub Pages deployment
DESIGN.md                     Current product visual language
legacy/                       Historical reference only
```

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

## Minimal integration backend

The recommended deployment target exposes only health, capability, AI-plan,
assistant and nearby-store routes. It does not expose the legacy auth, chat,
upload or tracking-sync routes.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements-integrations-dev.txt
pytest -q

# Minimal public process
uvicorn app.integration_app:app --host 0.0.0.0 --port 8000

# Or build the minimal container
docker build -t coreline-integrations .
docker run --rm -p 8000:8000 --env-file .env coreline-integrations
```

Copy `backend/.env.example` to an untracked environment file on the server.
Required provider settings are documented in [backend/README.md](backend/README.md).
Secrets must remain in the hosting platform's secret manager.

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
