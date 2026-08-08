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

## Sichere Integrationen (`/api/v1`)

Die GitHub-Pages-App bleibt offline-first. Echte KI- und Standortabfragen
laufen ausschließlich über dieses separat zu hostende HTTPS-Backend; API-Keys
gehören nur in Server-Umgebungsvariablen und nie in den Browser-Build.

| Route | Verhalten |
|---|---|
| `GET /api/v1/integrations/status` | Meldet ehrlich, welche Provider serverseitig konfiguriert sind; prüft keine Keys und gibt keine Secrets aus |
| `POST /api/v1/plan/draft` | OpenAI Responses API mit strikt strukturiertem Output, `store:false`, begrenzter Laufzeit und Ausgabe |
| `POST /api/v1/assistant/respond` | Kontextbezogene Wellness-Frage mit expliziter Freigabe; echte OpenAI-Antwort oder ehrliches `503` |
| `POST /api/v1/stores/nearby` | Google Geocoding + Places Nearby Search; akzeptiert Adresse **oder** Koordinaten nur mit expliziter Standortfreigabe |

### KI-Planentwurf

- `OPENAI_API_KEY` **und** `OPENAI_MODEL` müssen gesetzt sein. Ohne beide
  antwortet der Endpoint mit `503`; es wird nie eine lokale Antwort als „KI“
  ausgegeben.
- Remote-KI ist in dieser ersten Version nur für Nutzer ab 18 Jahren aktiviert.
- Das Request-Schema enthält Alltag, Schlaf, Mahlzeitenrhythmus, Aktivität,
  Training und Ernährungspräferenzen, aber bewusst **keine Adresse oder
  Koordinaten**.
- Das Backend fordert JSON nach einem festen Schema an und validiert den Output
  erneut. Trainingstage/-dauer, Kalorien, Protein und Makro-Konsistenz werden
  gegen serverseitige Grenzen geprüft.
- Der System-Prompt verbietet Diagnosen, Medikamentenberatung,
  Supplement-Dosierungen/-Stacks, extreme Ziele und Versprechen, den Körper
  realer oder fiktionaler Figuren zu kopieren.

Der Assistant-Endpoint nutzt denselben serverseitigen OpenAI-Zugang, aber ein
kleines separates Schema: Frage (max. 1.000 Zeichen), Sprache und optional ein
begrenzter Profil-/Plan-Snapshot. Auch dieses Schema kennt keine
Standortfelder. Die Antwort enthält `answer`, `safety_notes`, eine
`escalation`-Stufe und serverseitige Provider-Metadaten. Bei akuten Warnzeichen
muss das Modell auf lokale Notfallhilfe verweisen; eine verfehlte Eskalation
wird serverseitig verworfen. Es gibt keinen als KI ausgegebenen Regeltext-
Fallback.

Referenz: [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
und [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs).

### Supermärkte in der Nähe

- Für Adressen werden Geocoding **und** Places benötigt. Mit Koordinaten genügt
  Places. `GOOGLE_MAPS_API_KEY` kann beide bedienen; produktiv sind getrennte,
  API- und serverseitig eingeschränkte Keys über
  `GOOGLE_GEOCODING_API_KEY` / `GOOGLE_PLACES_API_KEY` empfehlenswert.
- Adresse und Koordinaten werden nur für die aktuelle Anfrage verarbeitet und
  durch diesen Code weder geloggt noch gespeichert. Sie werden niemals an das
  KI-Modell gesendet.
- Antworten enthalten nur minimale Provider-Felder, einen Abrufzeitpunkt und
  eine Distanz. Budget und Währung bleiben Planungskontext. Der Endpoint
  behauptet ausdrücklich **keine** aktuellen Preise, Bestände, Öffnungszeiten
  oder Budget-Eignung.

Referenz: [Google Geocoding](https://developers.google.com/maps/documentation/geocoding/requests-geocoding)
und [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search).

### Produktionsgrenzen

- `CORS_ORIGINS` akzeptiert nur exakte `http(s)`-Origins; `*` stoppt den Start.
  Sichere Defaults erlauben die öffentliche GitHub-Pages-Origin und lokale
  Vite-Ports.
- Die drei teuren anonymen Endpoints haben Body-, Timeout-, Token- und
  Prozess-Ratenlimits. Das In-Memory-Limit gilt nur pro Prozess. Mehrere Worker
  benötigen einen gemeinsamen Store (z. B. Redis) plus Limits am Reverse Proxy.
- Der Produktionshost muss HTTPS, Secret-Management, Provider-Quoten/Budgets,
  Monitoring ohne sensible Payloads und eine vertrauenswürdig konfigurierte
  Proxy-IP-Kette bereitstellen.
- Google-Maps-Billing, Key-Restriktionen und die für den Betreiber geltenden
  EWR-Nutzungsbedingungen müssen vor dem öffentlichen Start eingerichtet bzw.
  geprüft werden.

Konfiguration siehe [`.env.example`](.env.example). Tests:

```bash
cd backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
pytest -q
ruff check app tests
```

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

### Bot-Befehle

Nachrichten, die mit `!` beginnen, fängt der Bot ab (2 s Cooldown pro User):

| Befehl | Wirkung |
|---|---|
| `!profile` / `!stats` | Liest die RPG-Akte des Absenders aus `user_stats` (Rang, XP, Attribut-Balken, Streak, Titel) und schickt sie **privat** zurück |
| `!loadout <Name>` | Gibt ein optimiertes Waffen-Setup **im Raum** aus (z. B. `!loadout Fennec`, `!loadout WSP-9`); Daten in `services/loadout.py`, tolerante Namensauflösung |
| `!help` | Befehls-Übersicht (privat) |

Die RPG-Daten für `!profile` werden client-seitig berechnet und via
`POST /api/profile/sync` in die Tabelle `user_stats` gespiegelt (beim
Betreten des Chats). Bot-Antworten kommen als `bot`-Nachrichtentyp und
unterstützen Markdown.

## Live-Präsenz

Der WebSocket-Hub sendet bei Join **und** Disconnect ein `presence`-Frame mit
`count` und einem `roster` (`[{uid, user, title}]`) an alle im Raum — das
Frontend rendert daraus die einklappbare Präsenz-Sidebar. Tab-Schließen löst
client-seitig (`pagehide`) ein sofortiges Schließen des Sockets aus, damit das
Roster ohne Verzögerung aktualisiert.

## Hinweise

- CORS: für produktives Hosting `CORS_ORIGINS` auf die Pages-Domain begrenzen.
- Uploads werden per Content-Type **und** Magic-Bytes geprüft; Bild-Inhalte
  selbst werden nicht gescannt.
- Das Frontend bleibt ohne Backend voll funktionsfähig (GitHub Pages pur) —
  nur der Nexus-Chat zeigt dann den Offline-Zustand.
