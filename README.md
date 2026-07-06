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
2. **Smart Cart (Proviant-Kalkulator)** — simulierter Supermarkt-Algorithmus mit
   lokaler JSON-Preisdatenbank (Billa, Billa Plus, Spar, Hofer, Lidl), wöchentlich
   rotierenden Rabatt-Aktionen (deterministischer PRNG), Budget-Knapsack
   (Nährwert-Score pro Euro, Ziel-gewichtet) und adress-basierter
   Distanz-Simulation zum günstigsten Markt.
3. **Materia-Scanner 2.0** — Foto-Upload mit Live-Vorschau (`object-fit: cover`,
   12 px Radius), theme-adaptiver Scan-Animation (Cyber-Raster / Scanlines) und
   lokal simulierter Bild-Analyse nach 2 Sekunden.
4. **Dynamic Glow** — die Rahmen der UI leuchten stärker, je näher der User seinen
   Tageszielen kommt (`--glow-lvl` 0→1); bei 100 % pulsiert das Interface sanft.

## Dateien

- `index.html` — komplette App (CSS + JS inline, modulare Sektionen)
- `manifest.json` / `sw.js` / `icons/` — PWA-Installation & Offline-Cache
