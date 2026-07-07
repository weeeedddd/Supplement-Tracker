# ◈ SHADOW~1 Backend (Python / FastAPI)

Server-Seite der Full-Stack-App: Auth, SQL-Persistenz, Live-Marktpreise,
präzise Food-Analyse und der Community-Chat mit Shadow-Bot-Moderation.

## Starten

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Danach im Frontend (Tab „👥 NEXUS") die Server-URL eintragen, z. B.
`http://localhost:8000` — sie wird lokal gespeichert. Alternativ beim
Frontend-Build `VITE_BACKEND_URL` setzen.

## Endpunkte

| Route | Zweck |
|---|---|
| `GET /api/health` | Healthcheck (Frontend-Verbindungstest) |
| `POST /api/auth/register` / `login` | Konten (pbkdf2-Hash, Token in SQL) |
| `GET /api/prices/live` | Live-Marktpreise — Proxy auf die **Open Prices API** (Open Food Facts), 12h-Cache in SQL |
| `GET /api/food/analyze?q=…&barcode=…` | Nährwert-Analyse — Proxy auf **Open Food Facts** (Barcode exakt, Volltext validiert, Gramm-Parsing) |
| `POST /api/scans` / `GET /api/scans/{uid}` | Scan-Historie |
| `POST /api/chat/upload` | Bild-Upload für den Chat (3 MB, jpeg/png/webp/gif, Magic-Byte-Check) |
| `WS /ws/chat/{room}` | Chat-Räume: `global`, `de`, `en`, `ja`, `ko`, `es` |

## SQL-Schema

SQLAlchemy-Modelle in `app/models.py` (Auto-Migration beim Start):
`users` (Profil + Protokoll/Makro-Snapshot) · `auth_tokens` · `scan_entries` ·
`chat_messages` · `price_cache`. Default SQLite, per `DATABASE_URL` auf
Postgres/MySQL umstellbar.

## ◈ Shadow Bot (Moderation)

Jede Chat-Nachricht durchläuft vor Persistenz & Broadcast `app/shadow_bot.py`:

1. **Scam/Phishing** — verdächtige Muster (Gratis-Krypto, Wallet-Verify,
   Invite-Links), riskante TLDs und alle Links außerhalb einer kleinen
   Allowlist werden geblockt.
2. **Toxizität** — mehrsprachiger Schimpfwort-Filter (de/en/es inkl.
   Leetspeak-Varianten).
3. **Spam** — Raten-Limit (max. 5 Nachrichten/10 s) und identische
   Wiederholungen pro Absender.

Geblockte Nachrichten werden **nicht** gespeichert; der Absender erhält eine
mystische Verwarnung im Stil der App (das Frontend lokalisiert den
`reason`-Code in alle 5 Sprachen).

## Hinweise

- CORS: für produktives Hosting `CORS_ORIGINS` auf die Pages-Domain begrenzen.
- Uploads werden per Content-Type **und** Magic-Bytes geprüft; Bild-Inhalte
  selbst werden nicht gescannt.
- Das Frontend bleibt ohne Backend voll funktionsfähig (GitHub Pages pur) —
  nur der Nexus-Chat zeigt dann den Offline-Zustand.
