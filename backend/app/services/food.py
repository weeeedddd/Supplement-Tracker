"""Materia-Scanner-Backend — präzise Nährwerte über Open Food Facts.

  · Barcode → /api/v2/product/{code} = exakte Herstellerwerte
  · Freitext → Volltextsuche mit Wort-Überlappungs-Validierung
  · Gramm-Parsing ("150 g") skaliert per-100g-Werte exakt
  · 7-Tage-Query-Cache in SQL gegen das search.pl-Rate-Limit
"""
from __future__ import annotations

import json
import re
import time

import httpx
from sqlalchemy.orm import Session

from ..models import PriceCache

OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/"
OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"
FIELDS = "product_name,brands,nutriments,serving_quantity"
TIMEOUT_S = 8.0
CACHE_TTL_S = 7 * 24 * 3600

GRAMS_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:g|gramm|grams?)\b", re.I)
WORD_RE = re.compile(r"[^a-zäöüßàáâçéèêíìîñóòôúùû0-9']+", re.I)
QTY_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:g|gramm|grams?|x|×)?\b", re.I)


def parse_grams(text: str | None) -> int | None:
    m = GRAMS_RE.search(text or "")
    if not m:
        return None
    v = round(float(m.group(1).replace(",", ".")))
    return v if 5 <= v <= 2000 else None


def clean_query(text: str) -> str:
    """Mengenangaben ("150 g", "2x") aus der Query entfernen —
    sie verwässern sonst Suche und Wort-Überlappungs-Validierung."""
    return re.sub(r"\s+", " ", QTY_RE.sub(" ", text)).strip()


def _macros(prod: dict, grams: int | None) -> dict | None:
    n = prod.get("nutriments") or {}
    kcal100 = n.get("energy-kcal_100g")
    if kcal100 is None and n.get("energy_100g"):
        kcal100 = n["energy_100g"] / 4.184
    if not kcal100 or kcal100 <= 0:
        return None
    g = int(round(grams or _num(prod.get("serving_quantity")) or 100))
    f = g / 100.0
    r = lambda v: round((_num(v) or 0) * f)
    return {
        "grams": g,
        "macros": {
            "kcal": round(kcal100 * f),
            "prot": r(n.get("proteins_100g")),
            "carb": r(n.get("carbohydrates_100g")),
            "fat": r(n.get("fat_100g")),
            "sug": r(n.get("sugars_100g")),
        },
    }


def _num(v) -> float | None:
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def _name(prod: dict, grams: int) -> str:
    brands = prod.get("brands") or ""
    brand = (brands[0] if isinstance(brands, list) else str(brands).split(",")[0]).strip()
    nm = (prod.get("product_name") or "").strip() or "Produkt"
    full = f"{brand} {nm}" if brand and brand.lower() not in nm.lower() else nm
    return f"{full} ({grams} g)"


def analyze_barcode(code: str, hint: str | None) -> dict | None:
    try:
        r = httpx.get(f"{OFF_PRODUCT}{code}.json", params={"fields": FIELDS},
                      timeout=TIMEOUT_S, headers={"Accept": "application/json"})
        r.raise_for_status()
        d = r.json()
    except Exception:
        return None
    if not d or d.get("status") != 1:
        return None
    res = _macros(d["product"], parse_grams(hint))
    if not res:
        return None
    return {"found": True, "name": _name(d["product"], res["grams"]), "macros": res["macros"], "source": "barcode"}


def analyze_text(db: Session, query: str) -> dict | None:
    search_q = clean_query(query) or query
    key = "foodq_" + re.sub(r"\s+", " ", search_q.lower().strip())[:56]
    row = db.get(PriceCache, key)
    prod: dict | None = None
    if row and time.time() - row.ts < CACHE_TTL_S:
        prod = json.loads(row.payload) or None
    else:
        try:
            r = httpx.get(OFF_SEARCH, params={
                "search_terms": search_q, "search_simple": 1, "action": "process",
                "json": 1, "page_size": 5, "fields": FIELDS,
            }, timeout=TIMEOUT_S, headers={"Accept": "application/json"})
            r.raise_for_status()
            products = r.json().get("products", [])
        except Exception:
            products = None  # Upstream down → kein Cache-Write, ggf. stale nutzen

        if products is not None:
            words = [w for w in WORD_RE.split(search_q.lower()) if len(w) > 2]
            best, best_score = None, 0.0
            for p in products:
                hay = f"{p.get('brands') or ''} {p.get('product_name') or ''}".lower()
                hits = sum(1 for w in words if w in hay)
                complete = (p.get("nutriments") or {}).get("energy-kcal_100g", 0) > 0
                if complete and hits >= max(1, -(-len(words) * 2 // 5)):  # ceil(40%)
                    score = hits + 0.5
                    if score > best_score:
                        best, best_score = p, score
            prod = best
            # Auch Fehltreffer cachen — schützt das Rate-Limit
            if not row:
                row = PriceCache(key=key)
                db.add(row)
            row.payload = json.dumps(prod or {})
            row.ts = time.time()
            db.commit()
        elif row:
            prod = json.loads(row.payload) or None

    if not prod:
        return None
    res = _macros(prod, parse_grams(query))
    if not res:
        return None
    return {"found": True, "name": _name(prod, res["grams"]), "macros": res["macros"], "source": "search"}
