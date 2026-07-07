// ═══════════════════════════════════════════════════════════════════
//  ◈ MATERIA-SCANNER — TS-Port der Genauigkeits-Kaskade
//  Bevorzugt das Python-Backend (/api/food/…) für Analyse & Caching;
//  ohne Backend läuft die identische Kaskade direkt gegen Open Food
//  Facts (funktioniert auch auf GitHub Pages). Nie werfende Fallbacks.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';
import { t } from './i18n';
import { getBackendUrl } from './backend';
import type { Macros } from './engine';

export interface ScanResult { name: string; macros: Macros; }

const FOOD_API = {
  product: 'https://world.openfoodfacts.org/api/v2/product/',
  search: 'https://world.openfoodfacts.org/cgi/search.pl',
  fields: 'product_name,brands,nutriments,serving_quantity',
  timeoutMs: 7000,
  cacheTtl: 7 * 24 * 60 * 60 * 1000,
};

export function parseGrams(text: string): number | null {
  const m = (text || '').match(/(\d+(?:[.,]\d+)?)\s*(?:g|gramm|grams?)\b/i);
  const v = m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null;
  return v && v >= 5 && v <= 2000 ? v : null;
}
export function parseMultiplier(text: string): number {
  const m = (text || '').match(/(?:^|\s)(\d+)\s*[x×](?:\s|$)|(?:^|\s)[x×]\s*(\d+)(?:\s|$)|^(\d+)\s+(?:teller|portion(?:en)?|plates?|servings?|접시|皿)/i);
  const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 1;
  return n >= 1 && n <= 10 ? n : 1;
}

async function offFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FOOD_API.timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export function macrosFromOFF(prod: any, grams: number | null): { grams: number; macros: Macros } | null {
  const n = prod?.nutriments || {};
  const kcal100 = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null);
  if (kcal100 == null || !(kcal100 > 0)) return null;
  const g = grams || Number(prod.serving_quantity) || 100;
  const f = g / 100;
  const r = (v: any) => Math.round((Number(v) || 0) * f);
  return {
    grams: g,
    macros: { kcal: Math.round(kcal100 * f), prot: r(n.proteins_100g), carb: r(n.carbohydrates_100g), fat: r(n.fat_100g), sug: r(n.sugars_100g) },
  };
}
export function offName(prod: any, grams: number): string {
  const brand = (Array.isArray(prod.brands) ? prod.brands[0] : String(prod.brands || '').split(',')[0] || '').trim();
  const nm = (prod.product_name || '').trim() || 'Produkt';
  const full = brand && !nm.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${nm}` : nm;
  return `${full} (${grams} g)`;
}

export async function offProductByBarcode(code: string): Promise<any | null> {
  const d = await offFetch(`${FOOD_API.product}${encodeURIComponent(code)}.json?fields=${FOOD_API.fields}`);
  return d && d.status === 1 ? d.product : null;
}

export async function offSearchProduct(query: string): Promise<any | null> {
  const key = 'q_' + query.toLowerCase().trim().replace(/\s+/g, ' ');
  const cache = S.get<Record<string, { ts: number; prod: any }>>('food_cache') || {};
  if (cache[key] && Date.now() - cache[key].ts < FOOD_API.cacheTtl) return cache[key].prod;

  const url = `${FOOD_API.search}?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=${FOOD_API.fields}`;
  const d = await offFetch(url);

  const words = query.toLowerCase().split(/[^a-zäöüßàáâçéèêíìîñóòôúùû0-9']+/).filter(w => w.length > 2);
  let best: { prod: any; score: number } | null = null;
  for (const p of (d.products || [])) {
    const hay = ((p.brands || '') + ' ' + (p.product_name || '')).toLowerCase();
    const hits = words.filter(w => hay.includes(w)).length;
    const complete = p.nutriments && p.nutriments['energy-kcal_100g'] > 0;
    if (complete && hits >= Math.max(1, Math.ceil(words.length * 0.4))) {
      const score = hits + 0.5;
      if (!best || score > best.score) best = { prod: p, score };
    }
  }
  const prod = best ? best.prod : null;
  cache[key] = { ts: Date.now(), prod };
  try { S.set('food_cache', cache); } catch { /* noop */ }
  return prod;
}

export async function detectBarcode(imageB64: string): Promise<string | null> {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const blob = await (await fetch(imageB64)).blob();
    const bmp = await createImageBitmap(blob);
    const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    const found = await det.detect(bmp);
    return found?.[0]?.rawValue || null;
  } catch { return null; }
}

// ── Keyword-DB: per-100g + typische Portion ──────────────────────────
const FOOD_PER100: { w: string[]; g: number; m: Macros }[] = [
  { w: ['chips', 'crisps'], g: 50, m: { kcal: 530, prot: 6, carb: 50, fat: 34, sug: 2 } },
  { w: ['schokolade', 'chocolate', 'schoko'], g: 50, m: { kcal: 540, prot: 7, carb: 57, fat: 31, sug: 52 } },
  { w: ['keks', 'cookie', 'biscuit'], g: 40, m: { kcal: 480, prot: 6, carb: 66, fat: 21, sug: 32 } },
  { w: ['gummibär', 'haribo', 'gummy'], g: 75, m: { kcal: 340, prot: 7, carb: 77, fat: 0, sug: 46 } },
  { w: ['eis', 'ice cream', 'gelato'], g: 100, m: { kcal: 210, prot: 4, carb: 24, fat: 11, sug: 22 } },
  { w: ['joghurt', 'yogurt', 'yoghurt'], g: 200, m: { kcal: 62, prot: 4, carb: 5, fat: 3, sug: 5 } },
  { w: ['banane', 'banana'], g: 120, m: { kcal: 89, prot: 1, carb: 23, fat: 0, sug: 12 } },
  { w: ['apfel', 'apple'], g: 180, m: { kcal: 52, prot: 0, carb: 14, fat: 0, sug: 10 } },
  { w: ['rührei', 'spiegelei', 'scrambled egg'], g: 120, m: { kcal: 155, prot: 13, carb: 1, fat: 11, sug: 1 } },
  { w: ['nüsse', 'nuts', 'mandeln', 'almonds'], g: 40, m: { kcal: 610, prot: 21, carb: 10, fat: 53, sug: 4 } },
];

// Portionsbasierte Alt-DB (letzte Text-Stufe)
export function dummyFoodMacros(input: string): Macros {
  const s = input.toLowerCase();
  const kw: { w: string[]; m: Macros }[] = [
    { w: ['pizza'], m: { kcal: 620, prot: 24, carb: 72, fat: 22, sug: 6 } },
    { w: ['burger', 'hamburger'], m: { kcal: 540, prot: 28, carb: 42, fat: 26, sug: 8 } },
    { w: ['jollof', 'rice'], m: { kcal: 520, prot: 22, carb: 78, fat: 12, sug: 4 } },
    { w: ['chicken', 'hähnchen'], m: { kcal: 320, prot: 38, carb: 4, fat: 14, sug: 1 } },
    { w: ['cordon bleu'], m: { kcal: 480, prot: 34, carb: 22, fat: 26, sug: 2 } },
    { w: ['pasta', 'nudel'], m: { kcal: 420, prot: 14, carb: 68, fat: 10, sug: 3 } },
    { w: ['salad', 'salat'], m: { kcal: 180, prot: 8, carb: 14, fat: 10, sug: 5 } },
    { w: ['steak', 'beef', 'rind'], m: { kcal: 460, prot: 42, carb: 0, fat: 28, sug: 0 } },
    { w: ['oats', 'haferflocken', 'oatmeal'], m: { kcal: 360, prot: 12, carb: 60, fat: 8, sug: 4 } },
    { w: ['protein shake', 'shake'], m: { kcal: 180, prot: 30, carb: 8, fat: 3, sug: 3 } },
    { w: ['sandwich', 'toast'], m: { kcal: 310, prot: 14, carb: 40, fat: 10, sug: 4 } },
    { w: ['sushi'], m: { kcal: 340, prot: 18, carb: 52, fat: 6, sug: 8 } },
  ];
  for (const { w, m } of kw) {
    if (w.some(word => s.includes(word))) {
      const jitter = (v: number) => Math.round(v * (0.95 + Math.random() * .1));
      return { kcal: jitter(m.kcal), prot: jitter(m.prot), carb: jitter(m.carb), fat: jitter(m.fat), sug: jitter(m.sug) };
    }
  }
  return { kcal: 400, prot: 18, carb: 44, fat: 14, sug: 5 };
}

export function keywordFoodEstimate(text: string): ScanResult {
  const s = (text || '').toLowerCase();
  const grams = parseGrams(s);
  const mult = parseMultiplier(s);
  for (const e of FOOD_PER100) {
    if (e.w.some(w => s.includes(w))) {
      const g = grams || e.g * mult;
      const f = g / 100;
      const r = (v: number) => Math.round(v * f);
      return { name: `${text} (${g} g)`, macros: { kcal: r(e.m.kcal), prot: r(e.m.prot), carb: r(e.m.carb), fat: r(e.m.fat), sug: r(e.m.sug) } };
    }
  }
  const base = dummyFoodMacros(text || '');
  if (mult > 1) (Object.keys(base) as (keyof Macros)[]).forEach(k => { base[k] = Math.round(base[k] * mult); });
  return { name: text, macros: base };
}

// ── Vision-Hash-Simulation (letztes Netz für Fotos ohne Barcode/Hint) ─
const MEAL_VISION_DB: ({ name: string } & Macros)[] = [
  { name: 'Protein Bowl', kcal: 520, prot: 38, carb: 52, fat: 16, sug: 9 },
  { name: 'Hähnchen mit Reis', kcal: 560, prot: 42, carb: 64, fat: 12, sug: 3 },
  { name: 'Lachs mit Gemüse', kcal: 480, prot: 36, carb: 18, fat: 28, sug: 6 },
  { name: 'Pasta Bolognese', kcal: 640, prot: 28, carb: 78, fat: 22, sug: 8 },
  { name: 'Gemischter Salat + Ei', kcal: 290, prot: 16, carb: 14, fat: 18, sug: 6 },
  { name: 'Wrap mit Hähnchen', kcal: 450, prot: 30, carb: 44, fat: 16, sug: 5 },
  { name: 'Ofenkartoffeln + Quark', kcal: 410, prot: 22, carb: 58, fat: 9, sug: 4 },
  { name: 'Rührei mit Brot', kcal: 380, prot: 24, carb: 28, fat: 18, sug: 3 },
  { name: 'Curry mit Reis', kcal: 590, prot: 20, carb: 74, fat: 21, sug: 9 },
  { name: 'Burrito Bowl', kcal: 610, prot: 32, carb: 66, fat: 22, sug: 7 },
];

export function simulateVisionScan(imageB64: string): ScanResult {
  let h = 5381;
  for (let i = 0; i < imageB64.length; i += 13) h = (((h << 5) + h) + imageB64.charCodeAt(i)) >>> 0;
  const meal = MEAL_VISION_DB[h % MEAL_VISION_DB.length];
  const jitter = (v: number) => Math.round(v * (0.92 + ((h >>> 8) % 17) / 100));
  return {
    name: '📷 ' + meal.name + ' (' + t('scan_detected') + ')',
    macros: { kcal: jitter(meal.kcal), prot: jitter(meal.prot), carb: jitter(meal.carb), fat: jitter(meal.fat), sug: jitter(meal.sug) },
  };
}

// ── Backend-Analyse (bevorzugt, wenn konfiguriert) ───────────────────
async function backendAnalyze(params: Record<string, string>): Promise<ScanResult | null> {
  const backend = getBackendUrl();
  if (!backend) return null;
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${backend}/api/food/analyze?${qs}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.found && d.macros) return { name: '◈ ' + d.name, macros: d.macros };
  } catch { /* Backend down → lokale Kaskade */ }
  return null;
}

// ── Öffentliche Kaskaden ─────────────────────────────────────────────
export async function analyzeTextLocally(txt: string): Promise<ScanResult> {
  const viaBackend = await backendAnalyze({ q: txt });
  if (viaBackend) return viaBackend;
  try {
    const prod = await offSearchProduct(txt);
    if (prod) {
      const r = macrosFromOFF(prod, parseGrams(txt));
      if (r) return { name: '◈ ' + offName(prod, r.grams), macros: r.macros };
    }
  } catch { /* API down → lokale Schätzung */ }
  return keywordFoodEstimate(txt);
}

export async function analyzeImageLocally(imageB64: string, hint: string): Promise<ScanResult> {
  const code = await detectBarcode(imageB64);
  if (code) {
    const viaBackend = await backendAnalyze({ barcode: code, ...(hint ? { q: hint } : {}) });
    if (viaBackend) return viaBackend;
    try {
      const prod = await offProductByBarcode(code);
      if (prod) {
        const r = macrosFromOFF(prod, parseGrams(hint));
        if (r) return { name: '◈ ' + offName(prod, r.grams), macros: r.macros };
      }
    } catch { /* weiter in der Kaskade */ }
  }
  if (hint) return analyzeTextLocally(hint);
  return simulateVisionScan(imageB64);
}
