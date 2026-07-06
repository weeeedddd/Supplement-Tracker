# ◈ SHADOW~1 · Supplement Protocol

Serverloses **Shadow Garden Terminal** — eine PWA (HTML/CSS/JS, komplett offline-fähig)
für Supplement-, Makro- und Hydrations-Tracking mit RPG-Progression.

## Starten

Kein Build, kein Server-Backend. Einfach das Verzeichnis statisch ausliefern, z. B.:

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

Alle Daten liegen lokal im `localStorage` (Prefix `sg_`). Optional kann in `index.html`
ein OpenAI-Key hinterlegt werden (`OPENAI_API_KEY` / `USE_PROVIDER`), sonst laufen
alle KI-Features über lokale Simulations-Engines.

## Themes

| Theme | Stil |
|---|---|
| ◈ Shadow Garden | Violett · Glassmorphism |
| ⚡ The System (Solo Leveling) | Neon-Cyan · angulare Kanten |
| 👁 CCG Database (Tokyo Ghoul) | Crimson · Scanlines & Glitch |

## Ultracode-Engines

1. **Smart Supplement Engine** — Score-basierte Protokoll-Generierung aus dem
   vollständigen Profil (Größe, Gewicht, Alter, Geschlecht, Fokus-Ziel) plus
   KI-Gesprächssignalen. Kein starres Set: schwere Massephase → Ashwagandha + Zink,
   Definition → L-Carnitin + Grüntee-Extrakt. Nicht jeder bekommt Omega-3.
2. **Smart Cart (Proviant-Kalkulator)** — Supermarkt-Algorithmus mit lokaler
   Marktdatenbank (Billa, Billa Plus, Spar, Hofer, Lidl), wöchentlich rotierenden
   Rabatt-Aktionen (deterministischer PRNG), Budget-Knapsack (Nährwert-Score pro
   Euro, Ziel-gewichtet) und adress-basierter Distanz-Simulation zum günstigsten
   Markt. Basispreise werden live von der **Open Prices API** (Open Food Facts)
   synchronisiert, wo Daten vorhanden sind — siehe „Live-Marktpreise" unten.
3. **Materia-Scanner 2.0** — Foto-Upload mit Live-Vorschau (`object-fit: cover`,
   12 px Radius), theme-adaptiver Scan-Animation (Cyber-Raster / Scanlines) und
   lokal simulierter Bild-Analyse nach 2 Sekunden.
4. **Dynamic Glow** — die Rahmen der UI leuchten stärker, je näher der User seinen
   Tageszielen kommt (`--glow-lvl` 0→1); bei 100 % pulsiert das Interface sanft.

## Live-Marktpreise

Der Proviant-Kalkulator synchronisiert reale Basispreise über die kostenlose,
API-Key-freie **[Open Prices API](https://prices.openfoodfacts.org)** von
Open Food Facts (CORS-freigegeben, offene Lizenz — läuft direkt aus dem
Browser einer statischen PWA). Stabilitäts-Schichten, damit der Kalkulator
nie blockiert oder abstürzt:

- **24h-Cache** im `localStorage` — ein Sync pro Tag reicht, spart Requests
- **6s-Timeout** pro Request, max. 2 Kategorie-Tags pro Produkt (bounded ≤ 24 s
  selbst bei Totalausfall der API)
- **Plausibilitäts-Klammer** (0,35×–3× Basispreis) + Median gegen Ausreißer
- **Stale-while-error**: schlägt der Refresh fehl, bleibt der letzte gültige
  Cache aktiv statt die Preise zu verwerfen
- **Reiner Simulations-Fallback**, falls weder Live-Daten noch Cache verfügbar
  sind — der Kalkulator liefert in jedem Fall ein Ergebnis

Aktuell liefert die API für gängige deutschsprachige Grundnahrungsmittel
unterschiedlich viel Abdeckung (z. B. Bananen/Brokkoli/Eier gut abgedeckt,
Nischenprodukte wie Skyr oder L-Carnitin-relevante Artikel seltener) — Artikel
ohne Live-Treffer laufen automatisch mit dem simulierten Basispreis weiter.
Im UI markiert ein `LIVE`-Badge, welche Artikel echte Marktdaten verwenden.
Manueller Refresh über den „↻ PREIS-SYNC"-Button im Proviant-Kalkulator.

## Deployment auf GitHub Pages

Die App ist reines Static-HTML/CSS/JS ohne Build-Schritt und direkt
Pages-tauglich:

- Alle Asset-Pfade (`manifest.json`, `icons/`, `sw.js`) sind **relativ**
  verlinkt — funktioniert sowohl unter `username.github.io` (Root) als auch
  unter `username.github.io/repo-name/` (Projekt-Subpfad)
- `.nojekyll` deaktiviert die Jekyll-Verarbeitung, damit alle Dateien 1:1
  ausgeliefert werden
- `manifest.json` nutzt `"start_url": "./index.html"` und `"scope": "./"` —
  ebenfalls Subpfad-sicher

**Aktivieren:** Repo → *Settings → Pages → Source: Deploy from a branch* →
Branch `main`, Ordner `/ (root)` auswählen. Kein Workflow nötig.

## Dateien

- `index.html` — komplette App (CSS + JS inline, modulare Sektionen)
- `manifest.json` / `sw.js` / `icons/` — PWA-Installation & Offline-Cache
- `.nojekyll` — GitHub-Pages-Marker (keine Jekyll-Verarbeitung)
