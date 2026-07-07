"""Live-Marktpreise — serverseitiger Proxy auf die Open Prices API
(Open Food Facts, kostenlos, kein API-Key, offene Lizenz).

Vorteile gegenüber dem direkten Browser-Zugriff:
  · 12h-Cache in der SQL-Datenbank (ein Upstream-Lauf für ALLE Clients)
  · kein Rate-Limit-Risiko im Client, kein CORS-Thema
Dieselbe Produktliste wie im Frontend (MARKET_DB) inkl. Einheiten-Umrechnung.
"""
from __future__ import annotations

import asyncio
import json
import statistics
import time

import httpx
from sqlalchemy.orm import Session

from ..models import PriceCache

OPEN_PRICES = "https://prices.openfoodfacts.org/api/v1/prices"
CACHE_KEY = "live_prices"
CACHE_TTL_S = 12 * 3600
TIMEOUT_S = 8.0

# id → (Kategorie-Tags nach Priorität, Basispreis €, Packung kg, Stück/Packung)
PRODUCTS: dict[str, tuple[list[str], float, float, int]] = {
    "oats":     (["en:oat-flakes", "en:oats"], 1.29, 0.5, 1),
    "eggs":     (["en:chicken-eggs", "en:eggs"], 3.29, 0.6, 10),
    "quark":    (["en:quarks"], 1.19, 0.5, 1),
    "chicken":  (["en:chicken-breasts"], 7.99, 1.0, 1),
    "rice":     (["en:brown-rices", "en:rices"], 2.29, 1.0, 1),
    "tuna":     (["en:canned-tunas", "en:tunas"], 3.49, 0.24, 1),
    "banana":   (["en:bananas"], 1.79, 1.0, 1),
    "broccoli": (["en:broccoli"], 1.99, 0.75, 1),
    "lentils":  (["en:lentils", "en:pulses"], 1.49, 0.5, 1),
    "oil":      (["en:olive-oils"], 5.99, 0.5, 1),
    "bread":    (["en:wholemeal-breads", "en:breads"], 2.19, 0.5, 1),
    "skyr":     (["en:skyrs", "en:strained-yogurts"], 1.99, 0.45, 1),
    "pb":       (["en:peanut-butters", "en:nut-butters"], 2.99, 0.35, 1),
    "berries":  (["en:frozen-berries", "en:berries"], 2.49, 0.3, 1),
}


async def _fetch_tag(client: httpx.AsyncClient, tag: str) -> list[dict]:
    r = await client.get(OPEN_PRICES, params={
        "category_tag": tag, "currency": "EUR", "order_by": "-date", "size": 30,
    })
    r.raise_for_status()
    data = r.json()
    return data.get("items", []) if isinstance(data, dict) else []


def _pack_price(item: dict, kg: float, unit_count: int) -> float | None:
    try:
        v = float(item.get("price") or 0)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    if item.get("price_per") == "KILOGRAM":
        return v * kg
    return v * unit_count


async def _fetch_product(client: httpx.AsyncClient, pid: str) -> tuple[str, dict] | None:
    tags, base, kg, unit_count = PRODUCTS[pid]
    for tag in tags[:2]:
        try:
            items = await _fetch_tag(client, tag)
        except Exception:
            continue
        vals = [p for i in items if (p := _pack_price(i, kg, unit_count)) is not None
                and base * 0.35 <= p <= base * 3]
        if vals:
            return pid, {
                "price": round(statistics.median(vals), 2),
                "samples": len(vals),
                "tag": tag,
            }
    return None


async def fetch_live_prices() -> dict[str, dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT_S, headers={"Accept": "application/json"}) as client:
        results = await asyncio.gather(*[_fetch_product(client, pid) for pid in PRODUCTS])
    return {pid: data for r in results if r for pid, data in [r]}


def get_live_prices_cached(db: Session, force: bool = False) -> dict:
    row = db.get(PriceCache, CACHE_KEY)
    if row and not force and time.time() - row.ts < CACHE_TTL_S:
        return {"prices": json.loads(row.payload), "cached": True, "ts": row.ts}

    try:
        prices = asyncio.run(fetch_live_prices())
    except Exception:
        prices = {}

    if prices:
        if not row:
            row = PriceCache(key=CACHE_KEY)
            db.add(row)
        row.payload = json.dumps(prices)
        row.ts = time.time()
        db.commit()
        return {"prices": prices, "cached": False, "ts": row.ts}

    # Stale-while-error: Upstream down → alter Cache statt leerer Antwort
    if row:
        return {"prices": json.loads(row.payload), "cached": True, "stale": True, "ts": row.ts}
    return {"prices": {}, "cached": False, "ts": None}
