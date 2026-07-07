// ═══════════════════════════════════════════════════════════════════
//  ◈ SMART CART (PROVIANT-KALKULATOR) + LIVE PRICE SYNC — TS-Port
//  Live-Preise: bevorzugt das Python-Backend (/api/prices/live),
//  fällt auf die Open Prices API direkt zurück, dann auf Simulation.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';
import { refresh } from './store';
import { getBackendUrl } from './backend';

export interface Market { id: string; name: string; factor: number; }
export interface Product {
  id: string; name: string; icon: string; base: number;
  kcal: number; prot: number; tags: string[];
  off: string[]; kg: number; unitCount?: number;
}

export const MARKET_DB: { markets: Market[]; products: Product[] } = {
  markets: [
    { id: 'hofer', name: 'HOFER', factor: 0.92 },
    { id: 'lidl', name: 'Lidl', factor: 0.90 },
    { id: 'billa', name: 'BILLA', factor: 1.15 },
    { id: 'billaplus', name: 'BILLA Plus', factor: 1.12 },
    { id: 'spar', name: 'SPAR', factor: 1.18 },
  ],
  products: [
    { id: 'oats', name: 'Haferflocken 500g', icon: '🥣', base: 1.29, kcal: 1850, prot: 67, tags: ['bulk', 'perf'], off: ['en:oat-flakes', 'en:oats'], kg: 0.5 },
    { id: 'eggs', name: 'Eier 10 Stk', icon: '🥚', base: 3.29, kcal: 780, prot: 66, tags: ['bulk', 'cut'], off: ['en:chicken-eggs', 'en:eggs'], kg: 0.6, unitCount: 10 },
    { id: 'quark', name: 'Magerquark 500g', icon: '🥛', base: 1.19, kcal: 335, prot: 60, tags: ['cut', 'bulk'], off: ['en:quarks'], kg: 0.5 },
    { id: 'chicken', name: 'Hähnchenbrust 1kg', icon: '🍗', base: 7.99, kcal: 1100, prot: 230, tags: ['bulk', 'cut', 'perf'], off: ['en:chicken-breasts'], kg: 1 },
    { id: 'rice', name: 'Naturreis 1kg', icon: '🍚', base: 2.29, kcal: 3500, prot: 75, tags: ['bulk', 'perf'], off: ['en:brown-rices', 'en:rices'], kg: 1 },
    { id: 'tuna', name: 'Thunfisch 3×80g', icon: '🐟', base: 3.49, kcal: 260, prot: 58, tags: ['cut', 'long'], off: ['en:canned-tunas', 'en:tunas'], kg: 0.24 },
    { id: 'banana', name: 'Bananen 1kg', icon: '🍌', base: 1.79, kcal: 890, prot: 11, tags: ['perf', 'bulk'], off: ['en:bananas'], kg: 1 },
    { id: 'broccoli', name: 'Brokkoli TK 750g', icon: '🥦', base: 1.99, kcal: 255, prot: 21, tags: ['cut', 'long'], off: ['en:broccoli'], kg: 0.75 },
    { id: 'lentils', name: 'Linsen 500g', icon: '🫘', base: 1.49, kcal: 1650, prot: 120, tags: ['long', 'cut'], off: ['en:lentils', 'en:pulses'], kg: 0.5 },
    { id: 'oil', name: 'Olivenöl 500ml', icon: '🫒', base: 5.99, kcal: 4400, prot: 0, tags: ['long'], off: ['en:olive-oils'], kg: 0.5 },
    { id: 'bread', name: 'Vollkornbrot 500g', icon: '🍞', base: 2.19, kcal: 1100, prot: 42, tags: ['bulk'], off: ['en:wholemeal-breads', 'en:breads'], kg: 0.5 },
    { id: 'skyr', name: 'Skyr 450g', icon: '🍶', base: 1.99, kcal: 280, prot: 49, tags: ['cut'], off: ['en:skyrs', 'en:strained-yogurts'], kg: 0.45 },
    { id: 'pb', name: 'Erdnussbutter 350g', icon: '🥜', base: 2.99, kcal: 2100, prot: 90, tags: ['bulk'], off: ['en:peanut-butters', 'en:nut-butters'], kg: 0.35 },
    { id: 'berries', name: 'TK-Beeren 300g', icon: '🫐', base: 2.49, kcal: 135, prot: 3, tags: ['long', 'cut'], off: ['en:frozen-berries', 'en:berries'], kg: 0.3 },
  ],
};

// ── Deterministik: Mulberry32 + String-Hash + ISO-Woche ──────────────
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h;
}
export function isoWeek(): number {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y0) / 86400000 + 1) / 7);
}

export function getMarketDeals(marketId: string): Record<string, number> {
  const rng = mulberry32(hashStr(marketId) ^ (isoWeek() * 2654435761));
  const deals: Record<string, number> = {};
  const n = MARKET_DB.products.length;
  for (let k = 0; k < 3; k++) {
    const idx = Math.floor(rng() * n);
    deals[MARKET_DB.products[idx].id] = rng() < 0.5 ? 0.25 : 0.15;
  }
  return deals;
}

export function marketDistances(addr: string) {
  const key = addr.toLowerCase().trim();
  return MARKET_DB.markets.map(m => ({
    id: m.id, name: m.name,
    dist: Math.round((0.3 + (hashStr(key + '::' + m.id) % 330) / 100) * 10) / 10,
  }));
}

export function fmtEUR(v: number): string { return v.toFixed(2).replace('.', ',') + ' €'; }

// ═══ LIVE PRICE SYNC — Backend bevorzugt, Open Prices API als Fallback ═══
const PRICE_API = {
  endpoint: 'https://prices.openfoodfacts.org/api/v1/prices',
  query: 'currency=EUR&order_by=-date&size=30',
  timeoutMs: 6000,
  ttlMs: 24 * 60 * 60 * 1000,
  maxTags: 2,
  chunk: 7,
};
export interface LivePrice { price: number; samples: number; tag: string; }
export let LIVE_PRICES: Record<string, LivePrice> = {};
export const priceSyncState = { running: false, ts: null as number | null, count: 0, error: null as string | null };

function median(arr: number[]): number {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function fetchCategoryPrices(tag: string): Promise<any[]> {
  const url = `${PRICE_API.endpoint}?category_tag=${encodeURIComponent(tag)}&${PRICE_API.query}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(PRICE_API.timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error('Malformed API response');
  return data.items;
}

function toPackPrice(item: any, prod: Product): number | null {
  const v = Number(item?.price);
  if (!isFinite(v) || v <= 0) return null;
  if (item.price_per === 'KILOGRAM') return v * (prod.kg || 1);
  return v * (prod.unitCount || 1);
}

async function fetchLivePrice(prod: Product): Promise<LivePrice | null> {
  for (const tag of (prod.off || []).slice(0, PRICE_API.maxTags)) {
    try {
      const items = await fetchCategoryPrices(tag);
      const vals = items.map(i => toPackPrice(i, prod))
        .filter((v): v is number => v != null && v >= prod.base * 0.35 && v <= prod.base * 3);
      if (vals.length) return { price: Math.round(median(vals) * 100) / 100, samples: vals.length, tag };
    } catch { /* nächster Tag / Fallback */ }
  }
  return null;
}

export async function syncLivePrices(force = false): Promise<void> {
  if (priceSyncState.running) return;
  const cache = S.get<{ ts: number; prices: Record<string, LivePrice> }>('price_cache');

  if (!force && cache && cache.prices && Date.now() - cache.ts < PRICE_API.ttlMs) {
    LIVE_PRICES = cache.prices;
    Object.assign(priceSyncState, { running: false, ts: cache.ts, count: Object.keys(LIVE_PRICES).length, error: null });
    refresh(); return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (cache?.prices) { LIVE_PRICES = cache.prices; priceSyncState.ts = cache.ts; priceSyncState.count = Object.keys(LIVE_PRICES).length; }
    priceSyncState.error = 'offline'; refresh(); return;
  }

  priceSyncState.running = true; priceSyncState.error = null; refresh();

  let results: Record<string, LivePrice> = {};

  // 1) Backend bevorzugt: serverseitiger Cache + Aggregation
  const backend = getBackendUrl();
  if (backend) {
    try {
      const res = await fetch(`${backend}/api/prices/live`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.prices === 'object') results = data.prices;
      }
    } catch { /* Backend down → direkter API-Pfad */ }
  }

  // 2) Direkter Open-Prices-Pfad (funktioniert auch auf GitHub Pages ohne Backend)
  if (!Object.keys(results).length) {
    const products = MARKET_DB.products.filter(p => p.off && p.off.length);
    for (let i = 0; i < products.length; i += PRICE_API.chunk) {
      const chunk = products.slice(i, i + PRICE_API.chunk);
      const settled = await Promise.allSettled(chunk.map(p => fetchLivePrice(p)));
      settled.forEach((r, j) => { if (r.status === 'fulfilled' && r.value) results[chunk[j].id] = r.value; });
    }
  }

  priceSyncState.running = false;
  if (Object.keys(results).length) {
    LIVE_PRICES = results;
    priceSyncState.ts = Date.now();
    priceSyncState.count = Object.keys(results).length;
    priceSyncState.error = null;
    S.set('price_cache', { ts: priceSyncState.ts, prices: results });
  } else if (cache?.prices) {
    LIVE_PRICES = cache.prices;
    priceSyncState.ts = cache.ts;
    priceSyncState.count = Object.keys(LIVE_PRICES).length;
    priceSyncState.error = 'stale';
  } else {
    LIVE_PRICES = {};
    priceSyncState.ts = null;
    priceSyncState.count = 0;
    priceSyncState.error = 'no-data';
  }
  refresh();
}

export function effBase(prod: Product): number {
  const live = LIVE_PRICES[prod.id];
  return live ? live.price : prod.base;
}

// ═══ KNAPSACK — Einkaufsliste exakt ins Budget ═══════════════════════
export interface CartItem { product: Product; market: Market; price: number; disc: number; qty: number; }
export interface CartResult {
  items: CartItem[]; total: number; saved: number; util: number;
  cheapest: Market; groups: Record<string, CartItem[]>;
  dists: { id: string; name: string; dist: number }[] | null;
}

export function runSmartCart(period: 'week' | 'month', budget: number, addr: string, goal: string): CartResult | null {
  S.set('cart_cfg', { period, budget, addr });
  const deals: Record<string, Record<string, number>> = {};
  MARKET_DB.markets.forEach(m => { deals[m.id] = getMarketDeals(m.id); });

  const offers = MARKET_DB.products.map(p => {
    let best: { product: Product; market: Market; price: number; disc: number } | null = null;
    for (const m of MARKET_DB.markets) {
      const disc = deals[m.id][p.id] || 0;
      const price = Math.round(effBase(p) * m.factor * (1 - disc) * 100) / 100;
      if (!best || price < best.price) best = { product: p, market: m, price, disc };
    }
    return best!;
  });

  const scored = offers.map(o => {
    const nutri = o.product.prot * 10 + o.product.kcal * 0.05;
    const goalBonus = o.product.tags.includes(goal) ? 1.6 : 1;
    const dealBonus = o.disc > 0 ? 1.25 : 1;
    return { ...o, value: nutri * goalBonus * dealBonus / o.price };
  }).sort((a, b) => b.value - a.value);

  const maxQty = period === 'week' ? 2 : 6;
  const cart = new Map<string, CartItem>();
  let total = 0, progressed = true;
  while (progressed) {
    progressed = false;
    for (const o of scored) {
      const cur = cart.get(o.product.id);
      const qty = cur ? cur.qty : 0;
      if (qty >= maxQty) continue;
      if (Math.round((total + o.price) * 100) / 100 > budget) continue;
      cart.set(o.product.id, { product: o.product, market: o.market, price: o.price, disc: o.disc, qty: qty + 1 });
      total = Math.round((total + o.price) * 100) / 100;
      progressed = true;
    }
  }

  const items = [...cart.values()];
  if (!items.length) return null;

  const saved = items.reduce((a, i) => a + effBase(i.product) * i.market.factor * i.disc * i.qty, 0);
  const util = Math.round(total / budget * 100);
  const level = MARKET_DB.markets
    .map(m => ({ m, sum: MARKET_DB.products.reduce((a, p) => a + effBase(p) * m.factor * (1 - (deals[m.id][p.id] || 0)), 0) }))
    .sort((a, b) => a.sum - b.sum);
  const cheapest = level[0].m;

  const groups: Record<string, CartItem[]> = {};
  items.forEach(i => { (groups[i.market.id] = groups[i.market.id] || []).push(i); });

  return { items, total, saved, util, cheapest, groups, dists: addr ? marketDistances(addr) : null };
}
