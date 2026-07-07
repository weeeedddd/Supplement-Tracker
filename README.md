# ◈ SHADOW~1 · Supplement Protocol — Full-Stack

**Shadow Garden Terminal** als Full-Stack-App: React + TypeScript-Frontend
(PWA, GitHub-Pages-tauglich) und Python/FastAPI-Backend mit SQL-Datenbank,
Community-Chat und Shadow-Bot-Moderation.

```
├── index.html + assets/     ← gebautes Frontend (GitHub Pages serviert das Root)
├── manifest.json · sw.js    ← PWA-Installation & Offline-Cache
├── frontend/                ← React + TypeScript-Quellcode (Vite)
├── backend/                 ← Python/FastAPI-Server (siehe backend/README.md)
└── legacy/index.html        ← ursprüngliche Vanilla-Single-File-App (Referenz)
```

## Frontend (React + TypeScript)

```bash
cd frontend
npm install
npm run dev        # Entwicklung (Vite)
npm run build      # Typecheck + Build → Repo-Root (für GitHub Pages)
```

Der komplette Funktionsumfang der Vanilla-App wurde typisiert portiert:
Theme-Switching (◈ Shadow Garden · ⚡ Solo Leveling · 👁 Tokyo Ghoul),
i18n (de/en/ja/ko/es), Shadow-KI-Onboarding (Sprach-Fix, „Access Granted"-
Lesezeit ~15 s), Smart Supplement Engine mit Info-Icons, Materia-Scanner
(Barcode → Open Food Facts, Gramm-Parsing), Proviant-Kalkulator mit
Live-Marktpreisen, RPG-Profil (mobil optimiert), Dynamic Glow — plus neu
der **👥 Shadow Nexus** Community-Chat.

Alle Nutzerdaten bleiben lokal (`localStorage`, Prefix `sg_`) — die App
läuft **vollständig ohne Server**. Ein konfiguriertes Backend erweitert sie.

## Backend (Python / FastAPI / SQL)

Auth, Scan-Historie, serverseitige Live-Preise (Open-Prices-Proxy mit
SQL-Cache), präzise Food-Analyse (Open-Food-Facts-Proxy) und der
WebSocket-Chat mit **◈ Shadow Bot** (Scam-/Toxizitäts-/Spam-Filter,
mystische Verwarnungen). Details & Endpunkte: [`backend/README.md`](backend/README.md).

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Frontend ↔ Backend verbinden: im Tab **👥 NEXUS** die Server-URL eintragen
(wird lokal gespeichert) oder beim Build `VITE_BACKEND_URL` setzen.

## Community-Chat & Shadow Bot

- Räume: `global` + Sprachräume (`de`, `en`, `ja`, `ko`, `es`) passend zur App-Sprache
- Foto-Uploads (Mahlzeiten, Gym-Fortschritt) direkt in den Chat
- Shadow Bot blockt Scam-Links/Phishing, Beleidigungen (mehrsprachig) und
  Spam **vor** dem Broadcast — der Absender erhält eine mystische Verwarnung
  in seiner Sprache; saubere Nachrichten landen in der SQL-Historie

## Live-Marktpreise

Quelle ist die kostenlose, API-Key-freie **[Open Prices API](https://prices.openfoodfacts.org)**
(Open Food Facts). Mit Backend: serverseitiger 12h-SQL-Cache für alle Clients.
Ohne Backend: direkter Browser-Zugriff (CORS-frei) mit 24h-localStorage-Cache.
In beiden Fällen: Plausibilitäts-Klammer + Median, Stale-while-error,
Simulations-Fallback — der Kalkulator liefert immer ein Ergebnis.

## Deployment

**GitHub Pages (Frontend):** Settings → Pages → *Deploy from a branch* →
`main` / `/ (root)`. Alle Pfade sind relativ (`base: './'`), `.nojekyll`
liegt bei — funktioniert unter Root- und Projekt-Subpfad. Nach
Frontend-Änderungen `npm run build` ausführen und das Root mitcommitten.

**Backend:** beliebiger Python-Host (VPS, Railway, Fly.io, Render …).
`CORS_ORIGINS` auf die Pages-Domain setzen, `DATABASE_URL` optional auf
Postgres. Das Frontend degradiert ohne Backend sauber (Chat zeigt
Offline-Panel, alles andere läuft lokal weiter).

## Themes

| Theme | Stil |
|---|---|
| ◈ Shadow Garden | Violett · Glassmorphism |
| ⚡ The System (Solo Leveling) | Neon-Cyan · angulare Kanten |
| 👁 CCG Database (Tokyo Ghoul) | Crimson · Scanlines & Glitch |
