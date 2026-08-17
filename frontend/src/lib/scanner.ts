// ═══════════════════════════════════════════════════════════════════
//  ◈ MATERIA-SCANNER — TS-Port der Genauigkeits-Kaskade
//  Bevorzugt das Python-Backend (/api/food/…) für Analyse & Caching;
//  ohne Backend läuft die identische Kaskade direkt gegen Open Food
//  Facts (funktioniert auch auf GitHub Pages). Nie werfende Fallbacks.
// ═══════════════════════════════════════════════════════════════════
import { S, timeoutSignal } from './storage';
import type { Macros } from './engine';

export interface ScanDetails {
  source: 'barcode-database' | 'local-reference' | 'legacy-estimate';
  confidence: 'database' | 'estimated';
  servingGrams?: number;
  fiber?: number;
  saturatedFat?: number;
  sodiumMg?: number;
  components?: number;
}

export interface ScanResult { name: string; macros: Macros; details?: ScanDetails; }

const FOOD_API = {
  product: 'https://world.openfoodfacts.org/api/v2/product/',
  search: 'https://world.openfoodfacts.org/cgi/search.pl',
  fields: 'product_name,brands,nutriments,serving_quantity,nutrition_data_per',
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
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: timeoutSignal(FOOD_API.timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export function macrosFromOFF(prod: any, grams: number | null): { grams: number; macros: Macros; details: Omit<ScanDetails, 'source' | 'confidence'> } | null {
  const n = prod?.nutriments || {};
  const finite = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const kcal100 = finite(n['energy-kcal_100g']) ?? (() => {
    const kilojoules = finite(n['energy_100g']);
    return kilojoules === null ? null : kilojoules / 4.184;
  })();
  if (kcal100 == null || !(kcal100 > 0) || kcal100 > 1_000) return null;
  const serving = finite(prod.serving_quantity);
  const g = grams || (serving && serving >= 5 && serving <= 2_000 ? serving : 100);
  const f = g / 100;
  const r = (value: unknown, maximum = 100) => {
    const parsed = finite(value);
    if (parsed === null || parsed > maximum) return 0;
    return Math.round(parsed * f * 10) / 10;
  };
  const carbs = r(n.carbohydrates_100g);
  const fat = r(n.fat_100g);
  const sugar = Math.min(carbs, r(n.sugars_100g));
  const saturatedFat = Math.min(fat, r(n['saturated-fat_100g']));
  const sodium100 = finite(n.sodium_100g);
  return {
    grams: g,
    macros: {
      kcal: Math.round(kcal100 * f),
      prot: r(n.proteins_100g),
      carb: carbs,
      fat,
      sug: sugar,
    },
    details: {
      servingGrams: g,
      fiber: r(n.fiber_100g),
      saturatedFat,
      sodiumMg: sodium100 === null || sodium100 > 10 ? undefined : Math.round(sodium100 * f * 1_000),
    },
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
  { w: ['chips', 'crisps', 'sour cream', 'kartoffelchips', 'chip', 'potato chips', 'doritos', 'lay\'s', 'lays', 'dorito', 'cheese chips'], g: 50, m: { kcal: 530, prot: 6, carb: 50, fat: 34, sug: 2 } },
  { w: ['schokolade', 'chocolate', 'schoko'], g: 50, m: { kcal: 540, prot: 7, carb: 57, fat: 31, sug: 52 } },
  { w: ['keks', 'cookie', 'biscuit'], g: 40, m: { kcal: 480, prot: 6, carb: 66, fat: 21, sug: 32 } },
  { w: ['gummibär', 'haribo', 'gummy'], g: 75, m: { kcal: 340, prot: 7, carb: 77, fat: 0, sug: 46 } },
  { w: ['eis', 'ice cream', 'gelato'], g: 100, m: { kcal: 210, prot: 4, carb: 24, fat: 11, sug: 22 } },
  { w: ['skyr'], g: 250, m: { kcal: 63, prot: 11, carb: 4, fat: 0, sug: 4 } },
  { w: ['joghurt', 'yogurt', 'yoghurt'], g: 200, m: { kcal: 62, prot: 4, carb: 5, fat: 3, sug: 5 } },
  { w: ['banane', 'banana'], g: 120, m: { kcal: 89, prot: 1, carb: 23, fat: 0, sug: 12 } },
  { w: ['apfel', 'apple'], g: 180, m: { kcal: 52, prot: 0, carb: 14, fat: 0, sug: 10 } },
  { w: ['rührei', 'spiegelei', 'scrambled egg'], g: 120, m: { kcal: 155, prot: 13, carb: 1, fat: 11, sug: 1 } },
  { w: ['nüsse', 'nuts', 'mandeln', 'almonds'], g: 40, m: { kcal: 610, prot: 21, carb: 10, fat: 53, sug: 4 } },
  { w: ['kefir'], g: 250, m: { kcal: 60, prot: 3, carb: 4, fat: 3, sug: 4 } },
  { w: ['pizza', 'pizza'], g: 200, m: { kcal: 260, prot: 11, carb: 33, fat: 10, sug: 3 } },
  { w: ['bagel'], g: 100, m: { kcal: 280, prot: 10, carb: 54, fat: 3, sug: 6 } },
  { w: ['donut', 'doughnut'], g: 80, m: { kcal: 450, prot: 5, carb: 51, fat: 25, sug: 26 } },
  { w: ['müsli', 'granola'], g: 60, m: { kcal: 470, prot: 10, carb: 64, fat: 18, sug: 22 } },
  { w: ['popcorn'], g: 40, m: { kcal: 400, prot: 11, carb: 75, fat: 4, sug: 1 } },
  { w: ['brot', 'bread', 'toast'], g: 60, m: { kcal: 265, prot: 9, carb: 49, fat: 3, sug: 5 } },
  { w: ['reis', 'rice', 'basmati'], g: 180, m: { kcal: 230, prot: 4, carb: 50, fat: 0, sug: 0 } },
  { w: ['nudel', 'pasta', 'spaghetti', 'penne'], g: 100, m: { kcal: 158, prot: 5, carb: 31, fat: 1, sug: 1 } },
  { w: ['kartoffel', 'potato'], g: 200, m: { kcal: 157, prot: 4, carb: 36, fat: 0, sug: 1 } },
  { w: ['quark', 'magerquark'], g: 200, m: { kcal: 72, prot: 14, carb: 4, fat: 0, sug: 4 } },
  { w: ['käse', 'cheese'], g: 30, m: { kcal: 350, prot: 25, carb: 1, fat: 28, sug: 1 } },
  { w: ['lachs', 'salmon'], g: 150, m: { kcal: 312, prot: 32, carb: 0, fat: 19, sug: 0 } },
  { w: ['hähnchen', 'chicken'], g: 150, m: { kcal: 248, prot: 46, carb: 0, fat: 6, sug: 0 } },
  { w: ['rind', 'beef', 'steak'], g: 150, m: { kcal: 390, prot: 42, carb: 0, fat: 24, sug: 0 } },
  { w: ['sushi'], g: 100, m: { kcal: 340, prot: 18, carb: 52, fat: 6, sug: 8 } },
  { w: ['protein shake', 'shake'], g: 300, m: { kcal: 180, prot: 30, carb: 8, fat: 3, sug: 3 } },
  { w: ['salat', 'salad'], g: 150, m: { kcal: 180, prot: 8, carb: 14, fat: 10, sug: 5 } },
  { w: ['suppe', 'soup'], g: 300, m: { kcal: 120, prot: 5, carb: 15, fat: 4, sug: 3 } },
  { w: ['omelett', 'omelette'], g: 150, m: { kcal: 200, prot: 15, carb: 2, fat: 14, sug: 1 } },
  { w: ['smoothie'], g: 300, m: { kcal: 150, prot: 3, carb: 32, fat: 2, sug: 24 } },
  { w: ['kaffee', 'coffee'], g: 200, m: { kcal: 2, prot: 0, carb: 0, fat: 0, sug: 0 } },
  { w: ['tee', 'tea'], g: 250, m: { kcal: 2, prot: 0, carb: 0, fat: 0, sug: 0 } },
  { w: ['butter'], g: 15, m: { kcal: 717, prot: 1, carb: 0, fat: 81, sug: 0 } },
  { w: ['öl', 'oil', 'olive oil', 'olive oil'], g: 15, m: { kcal: 884, prot: 0, carb: 0, fat: 100, sug: 0 } },
  { w: ['avocado'], g: 150, m: { kcal: 240, prot: 3, carb: 13, fat: 22, sug: 1 } },
  { w: ['bohne', 'bean'], g: 150, m: { kcal: 127, prot: 9, carb: 22, fat: 1, sug: 0 } },
  { w: ['linsen', 'lentil'], g: 150, m: { kcal: 116, prot: 9, carb: 20, fat: 1, sug: 1 } },
  { w: [' tofu'], g: 150, m: { kcal: 76, prot: 8, carb: 1, fat: 5, sug: 0 } },
  { w: ['taco'], g: 150, m: { kcal: 300, prot: 14, carb: 28, fat: 14, sug: 2 } },
  { w: ['burrito'], g: 300, m: { kcal: 480, prot: 24, carb: 52, fat: 18, sug: 4 } },
  { w: ['wrap'], g: 250, m: { kcal: 350, prot: 18, carb: 36, fat: 14, sug: 3 } },
  { w: ['curry'], g: 300, m: { kcal: 280, prot: 12, carb: 32, fat: 12, sug: 5 } },
  { w: ['bowl', 'buddha bowl'], g: 400, m: { kcal: 380, prot: 18, carb: 52, fat: 12, sug: 6 } },
  { w: ['baguette'], g: 100, m: { kcal: 270, prot: 9, carb: 53, fat: 1, sug: 1 } },
  { w: ['crepe'], g: 100, m: { kcal: 200, prot: 6, carb: 28, fat: 7, sug: 10 } },
  { w: ['waffel'], g: 80, m: { kcal: 280, prot: 5, carb: 38, fat: 12, sug: 12 } },
  { w: ['pudding'], g: 150, m: { kcal: 120, prot: 3, carb: 20, fat: 3, sug: 18 } },
  { w: ['cake', 'kuchen'], g: 100, m: { kcal: 350, prot: 5, carb: 45, fat: 18, sug: 30 } },
  { w: ['brownie'], g: 80, m: { kcal: 430, prot: 5, carb: 52, fat: 24, sug: 38 } },
  { w: ['trinkwasser', 'water'], g: 500, m: { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 } },
  { w: ['bier', 'beer'], g: 500, m: { kcal: 218, prot: 2, carb: 18, fat: 0, sug: 0 } },
  { w: ['wein', 'wine'], g: 150, m: { kcal: 125, prot: 0, carb: 4, fat: 0, sug: 1 } },
  { w: ['cola', 'fanta', 'sprite', 'fanta', 'pepsi', 'coca', 'coca-cola'], g: 330, m: { kcal: 140, prot: 0, carb: 35, fat: 0, sug: 35 } },
  { w: ['milch', 'milk'], g: 250, m: { kcal: 120, prot: 8, carb: 12, fat: 3, sug: 12 } },
  { w: ['apfelsaft', 'orange juice', 'saft'], g: 200, m: { kcal: 100, prot: 1, carb: 24, fat: 0, sug: 22 } },
  { w: ['honig', 'honey'], g: 20, m: { kcal: 61, prot: 0, carb: 17, fat: 0, sug: 16 } },
  { w: ['sirup', 'syrup'], g: 30, m: { kcal: 90, prot: 0, carb: 23, fat: 0, sug: 22 } },
  { w: ['soße', 'sauce'], g: 50, m: { kcal: 80, prot: 1, carb: 8, fat: 5, sug: 4 } },
  { w: ['dip', 'dipp'], g: 50, m: { kcal: 150, prot: 3, carb: 10, fat: 11, sug: 3 } },
  { w: ['humus'], g: 80, m: { kcal: 180, prot: 8, carb: 14, fat: 10, sug: 1 } },
  { w: ['nussbutterm', 'peanut butter'], g: 30, m: { kcal: 188, prot: 8, carb: 6, fat: 16, sug: 2 } },
  { w: ['apfelmus', 'applesauce'], g: 150, m: { kcal: 75, prot: 0, carb: 19, fat: 0, sug: 15 } },
  { w: ['zucchini', 'courgette'], g: 200, m: { kcal: 40, prot: 2, carb: 7, fat: 0, sug: 5 } },
  { w: ['tomate', 'tomato'], g: 200, m: { kcal: 36, prot: 2, carb: 8, fat: 0, sug: 5 } },
  { w: ['gurke', 'cucumber'], g: 200, m: { kcal: 24, prot: 1, carb: 5, fat: 0, sug: 3 } },
  { w: ['paprika', 'pepper', 'bell pepper'], g: 150, m: { kcal: 35, prot: 1, carb: 7, fat: 0, sug: 5 } },
  { w: ['zwiebel', 'onion'], g: 100, m: { kcal: 40, prot: 1, carb: 9, fat: 0, sug: 4 } },
  { w: ['knoblauch', 'garlic'], g: 10, m: { kcal: 15, prot: 1, carb: 3, fat: 0, sug: 0 } },
  { w: ['brokkoli', 'broccoli'], g: 200, m: { kcal: 68, prot: 6, carb: 13, fat: 1, sug: 4 } },
  { w: ['spinat', 'spinach'], g: 150, m: { kcal: 30, prot: 3, carb: 4, fat: 0, sug: 1 } },
  { w: ['champignon', 'mushroom'], g: 150, m: { kcal: 30, prot: 4, carb: 4, fat: 0, sug: 2 } },
  { w: ['erbse', 'pea'], g: 150, m: { kcal: 120, prot: 8, carb: 16, fat: 0, sug: 6 } },
  { w: ['mais', 'corn'], g: 150, m: { kcal: 130, prot: 5, carb: 28, fat: 2, sug: 5 } },
  { w: ['karotte', 'carrot'], g: 150, m: { kcal: 60, prot: 1, carb: 14, fat: 0, sug: 7 } },
  { w: ['birne', 'pear'], g: 180, m: { kcal: 90, prot: 0, carb: 24, fat: 0, sug: 14 } },
  { w: ['pfirsich', 'peach'], g: 180, m: { kcal: 80, prot: 1, carb: 20, fat: 0, sug: 14 } },
  { w: ['orange', 'orangen'], g: 180, m: { kcal: 80, prot: 1, carb: 20, fat: 0, sug: 14 } },
  { w: ['traube', 'grape'], g: 150, m: { kcal: 90, prot: 1, carb: 23, fat: 0, sug: 18 } },
  { w: ['erdbeere', 'strawberry'], g: 150, m: { kcal: 45, prot: 1, carb: 11, fat: 0, sug: 7 } },
  { w: ['himbeere', 'raspberry'], g: 150, m: { kcal: 50, prot: 1, carb: 12, fat: 0, sug: 5 } },
  { w: ['kirsche', 'cherry'], g: 150, m: { kcal: 80, prot: 1, carb: 19, fat: 0, sug: 14 } },
  { w: ['wurst', 'sausage'], g: 100, m: { kcal: 350, prot: 16, carb: 1, fat: 30, sug: 1 } },
  { w: ['schnitzel'], g: 150, m: { kcal: 280, prot: 30, carb: 12, fat: 12, sug: 0 } },
  { w: ['kotelett'], g: 150, m: { kcal: 320, prot: 28, carb: 0, fat: 22, sug: 0 } },
  { w: ['fisch', 'fish'], g: 150, m: { kcal: 200, prot: 24, carb: 0, fat: 10, sug: 0 } },
  { w: ['schalentier', 'shrimp', 'prawn'], g: 100, m: { kcal: 99, prot: 24, carb: 0, fat: 0, sug: 0 } },
  { w: ['nudelsalat', 'noodle', 'ramen'], g: 300, m: { kcal: 350, prot: 12, carb: 52, fat: 8, sug: 2 } },
  { w: ['dim sum'], g: 200, m: { kcal: 250, prot: 10, carb: 30, fat: 10, sug: 4 } },
  { w: ['chili con carne'], g: 300, m: { kcal: 380, prot: 24, carb: 30, fat: 18, sug: 6 } },
  { w: ['mac and cheese'], g: 300, m: { kcal: 450, prot: 18, carb: 48, fat: 20, sug: 4 } },
  { w: ['nachos'], g: 150, m: { kcal: 420, prot: 10, carb: 42, fat: 24, sug: 2 } },
  { w: ['falafel'], g: 100, m: { kcal: 300, prot: 12, carb: 28, fat: 18, sug: 1 } },
  { w: ['gyros', 'souvlaki'], g: 300, m: { kcal: 550, prot: 28, carb: 52, fat: 24, sug: 3 } },
  { w: ['cevapcici', 'cevapi'], g: 200, m: { kcal: 450, prot: 24, carb: 30, fat: 26, sug: 1 } },
  { w: ['manti'], g: 300, m: { kcal: 320, prot: 14, carb: 40, fat: 12, sug: 2 } },
  { w: ['dolma'], g: 200, m: { kcal: 180, prot: 4, carb: 24, fat: 8, sug: 4 } },
  { w: ['kibbeh'], g: 150, m: { kcal: 280, prot: 14, carb: 20, fat: 16, sug: 1 } },
  { w: ['tagine'], g: 350, m: { kcal: 350, prot: 20, carb: 30, fat: 16, sug: 8 } },
  { w: ['paella'], g: 300, m: { kcal: 400, prot: 20, carb: 50, fat: 12, sug: 4 } },
  { w: ['risotto'], g: 300, m: { kcal: 420, prot: 12, carb: 58, fat: 14, sug: 2 } },
  { w: ['gnocchi'], g: 250, m: { kcal: 250, prot: 7, carb: 42, fat: 6, sug: 2 } },
  { w: ['lasagne'], g: 300, m: { kcal: 380, prot: 20, carb: 34, fat: 18, sug: 4 } },
  { w: ['ravioli'], g: 250, m: { kcal: 280, prot: 12, carb: 36, fat: 10, sug: 2 } },
  { w: ['tortellini'], g: 250, m: { kcal: 300, prot: 14, carb: 34, fat: 12, sug: 2 } },
  { w: ['focaccia'], g: 100, m: { kcal: 280, prot: 7, carb: 40, fat: 10, sug: 2 } },
  { w: ['ciabatta'], g: 80, m: { kcal: 220, prot: 7, carb: 40, fat: 4, sug: 1 } },
  { w: ['bagel'], g: 100, m: { kcal: 280, prot: 10, carb: 54, fat: 3, sug: 6 } },
  { w: ['pretzel'], g: 100, m: { kcal: 290, prot: 8, carb: 52, fat: 4, sug: 4 } },
  { w: ['muffin'], g: 100, m: { kcal: 350, prot: 5, carb: 50, fat: 14, sug: 28 } },
  { w: ['croissant'], g: 80, m: { kcal: 400, prot: 8, carb: 44, fat: 22, sug: 8 } },
  { w: ['bagel'], g: 100, m: { kcal: 280, prot: 10, carb: 54, fat: 3, sug: 6 } },
  { w: ['kuchen', 'cake'], g: 100, m: { kcal: 350, prot: 5, carb: 45, fat: 18, sug: 30 } },
  { w: ['brownie'], g: 80, m: { kcal: 430, prot: 5, carb: 52, fat: 24, sug: 38 } },
  { w: ['trinkwasser', 'water'], g: 500, m: { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 } },
  { w: ['bier', 'beer'], g: 500, m: { kcal: 218, prot: 2, carb: 18, fat: 0, sug: 0 } },
  { w: ['wein', 'wine'], g: 150, m: { kcal: 125, prot: 0, carb: 4, fat: 0, sug: 1 } },
  { w: ['cola', 'fanta', 'sprite', 'pepsi', 'coca', 'coca-cola'], g: 330, m: { kcal: 140, prot: 0, carb: 35, fat: 0, sug: 35 } },
  { w: ['milch', 'milk'], g: 250, m: { kcal: 120, prot: 8, carb: 12, fat: 3, sug: 12 } },
  { w: ['apfelsaft', 'orange juice', 'saft'], g: 200, m: { kcal: 100, prot: 1, carb: 24, fat: 0, sug: 22 } },
  { w: ['honig', 'honey'], g: 20, m: { kcal: 61, prot: 0, carb: 17, fat: 0, sug: 16 } },
  { w: ['sirup', 'syrup'], g: 30, m: { kcal: 90, prot: 0, carb: 23, fat: 0, sug: 22 } },
  { w: ['soße', 'sauce'], g: 50, m: { kcal: 80, prot: 1, carb: 8, fat: 5, sug: 4 } },
  { w: ['dip', 'dipp'], g: 50, m: { kcal: 150, prot: 3, carb: 10, fat: 11, sug: 3 } },
  { w: ['humus'], g: 80, m: { kcal: 180, prot: 8, carb: 14, fat: 10, sug: 1 } },
  { w: ['nussbutterm', 'peanut butter'], g: 30, m: { kcal: 188, prot: 8, carb: 6, fat: 16, sug: 2 } },
  { w: ['apfelmus', 'applesauce'], g: 150, m: { kcal: 75, prot: 0, carb: 19, fat: 0, sug: 15 } },
  { w: ['zucchini', 'courgette'], g: 200, m: { kcal: 40, prot: 2, carb: 7, fat: 0, sug: 5 } },
  { w: ['tomate', 'tomato'], g: 200, m: { kcal: 36, prot: 2, carb: 8, fat: 0, sug: 5 } },
  { w: ['gurke', 'cucumber'], g: 200, m: { kcal: 24, prot: 1, carb: 5, fat: 0, sug: 3 } },
  { w: ['paprika', 'pepper', 'bell pepper'], g: 150, m: { kcal: 35, prot: 1, carb: 7, fat: 0, sug: 5 } },
  { w: ['zwiebel', 'onion'], g: 100, m: { kcal: 40, prot: 1, carb: 9, fat: 0, sug: 4 } },
  { w: ['knoblauch', 'garlic'], g: 10, m: { kcal: 15, prot: 1, carb: 3, fat: 0, sug: 0 } },
  { w: ['brokkoli', 'broccoli'], g: 200, m: { kcal: 68, prot: 6, carb: 13, fat: 1, sug: 4 } },
  { w: ['spinat', 'spinach'], g: 150, m: { kcal: 30, prot: 3, carb: 4, fat: 0, sug: 1 } },
  { w: ['champignon', 'mushroom'], g: 150, m: { kcal: 30, prot: 4, carb: 4, fat: 0, sug: 2 } },
  { w: ['erbse', 'pea'], g: 150, m: { kcal: 120, prot: 8, carb: 16, fat: 0, sug: 6 } },
  { w: ['mais', 'corn'], g: 150, m: { kcal: 130, prot: 5, carb: 28, fat: 2, sug: 5 } },
  { w: ['karotte', 'carrot'], g: 150, m: { kcal: 60, prot: 1, carb: 14, fat: 0, sug: 7 } },
  { w: ['birne', 'pear'], g: 180, m: { kcal: 90, prot: 0, carb: 24, fat: 0, sug: 14 } },
  { w: ['pfirsich', 'peach'], g: 180, m: { kcal: 80, prot: 1, carb: 20, fat: 0, sug: 14 } },
  { w: ['orange', 'orangen'], g: 180, m: { kcal: 80, prot: 1, carb: 20, fat: 0, sug: 14 } },
  { w: ['traube', 'grape'], g: 150, m: { kcal: 90, prot: 1, carb: 23, fat: 0, sug: 18 } },
  { w: ['erdbeere', 'strawberry'], g: 150, m: { kcal: 45, prot: 1, carb: 11, fat: 0, sug: 7 } },
  { w: ['himbeere', 'raspberry'], g: 150, m: { kcal: 50, prot: 1, carb: 12, fat: 0, sug: 5 } },
  { w: ['kirsche', 'cherry'], g: 150, m: { kcal: 80, prot: 1, carb: 19, fat: 0, sug: 14 } },
  { w: ['wurst', 'sausage'], g: 100, m: { kcal: 350, prot: 16, carb: 1, fat: 30, sug: 1 } },
  { w: ['schnitzel'], g: 150, m: { kcal: 280, prot: 30, carb: 12, fat: 12, sug: 0 } },
  { w: ['kotelett'], g: 150, m: { kcal: 320, prot: 28, carb: 0, fat: 22, sug: 0 } },
  { w: ['fisch', 'fish'], g: 150, m: { kcal: 200, prot: 24, carb: 0, fat: 10, sug: 0 } },
  { w: ['schalentier', 'shrimp', 'prawn'], g: 100, m: { kcal: 99, prot: 24, carb: 0, fat: 0, sug: 0 } },
  { w: ['nudelsalat', 'noodle', 'ramen'], g: 300, m: { kcal: 350, prot: 12, carb: 52, fat: 8, sug: 2 } },
  { w: ['dim sum'], g: 200, m: { kcal: 250, prot: 10, carb: 30, fat: 10, sug: 4 } },
  { w: ['chili con carne'], g: 300, m: { kcal: 380, prot: 24, carb: 30, fat: 18, sug: 6 } },
  { w: ['mac and cheese'], g: 300, m: { kcal: 450, prot: 18, carb: 48, fat: 20, sug: 4 } },
  { w: ['nachos'], g: 150, m: { kcal: 420, prot: 10, carb: 42, fat: 24, sug: 2 } },
  { w: ['falafel'], g: 100, m: { kcal: 300, prot: 12, carb: 28, fat: 18, sug: 1 } },
  { w: ['gyros', 'souvlaki'], g: 300, m: { kcal: 550, prot: 28, carb: 52, fat: 24, sug: 3 } },
  { w: ['cevapcici', 'cevapi'], g: 200, m: { kcal: 450, prot: 24, carb: 30, fat: 26, sug: 1 } },
  { w: ['manti'], g: 300, m: { kcal: 320, prot: 14, carb: 40, fat: 12, sug: 2 } },
  { w: ['dolma'], g: 200, m: { kcal: 180, prot: 4, carb: 24, fat: 8, sug: 4 } },
  { w: ['kibbeh'], g: 150, m: { kcal: 280, prot: 14, carb: 20, fat: 16, sug: 1 } },
  { w: ['tagine'], g: 350, m: { kcal: 350, prot: 20, carb: 30, fat: 16, sug: 8 } },
  { w: ['paella'], g: 300, m: { kcal: 400, prot: 20, carb: 50, fat: 12, sug: 4 } },
  { w: ['risotto'], g: 300, m: { kcal: 420, prot: 12, carb: 58, fat: 14, sug: 2 } },
  { w: ['gnocchi'], g: 250, m: { kcal: 250, prot: 7, carb: 42, fat: 6, sug: 2 } },
  { w: ['lasagne'], g: 300, m: { kcal: 380, prot: 20, carb: 34, fat: 18, sug: 4 } },
  { w: ['ravioli'], g: 250, m: { kcal: 280, prot: 12, carb: 36, fat: 10, sug: 2 } },
  { w: ['tortellini'], g: 250, m: { kcal: 300, prot: 14, carb: 34, fat: 12, sug: 2 } },
  { w: ['focaccia'], g: 100, m: { kcal: 280, prot: 7, carb: 40, fat: 10, sug: 2 } },
  { w: ['ciabatta'], g: 80, m: { kcal: 220, prot: 7, carb: 40, fat: 4, sug: 1 } },
  { w: ['pretzel'], g: 100, m: { kcal: 290, prot: 8, carb: 52, fat: 4, sug: 4 } },
  { w: ['muffin'], g: 100, m: { kcal: 350, prot: 5, carb: 50, fat: 14, sug: 28 } },
  { w: ['croissant'], g: 80, m: { kcal: 400, prot: 8, carb: 44, fat: 22, sug: 8 } },
  { w: ['bagel'], g: 100, m: { kcal: 280, prot: 10, carb: 54, fat: 3, sug: 6 } },
];

interface ReferenceFood {
  id: string;
  aliases: string[];
  defaultGrams: number;
  per100: Macros;
  fiber100?: number;
  saturatedFat100?: number;
}

// Generic reference values are deliberately limited to foods whose usual
// plain form is reasonably predictable. Branded products still require a
// barcode/label because recipes, oil and processing can change the result.
const REFERENCE_FOODS: ReferenceFood[] = [
  { id: 'skyr', aliases: ['skyr'], defaultGrams: 250, per100: { kcal: 63, prot: 11, carb: 3.6, fat: .2, sug: 3.6 } },
  { id: 'quark', aliases: ['magerquark', 'low fat quark', 'quark'], defaultGrams: 250, per100: { kcal: 67, prot: 12, carb: 4, fat: .2, sug: 4 } },
  { id: 'greek-yogurt', aliases: ['greek yogurt', 'greek yoghurt', 'griechischer joghurt'], defaultGrams: 200, per100: { kcal: 73, prot: 9.5, carb: 3.6, fat: 2, sug: 3.6 }, saturatedFat100: 1.3 },
  { id: 'cottage-cheese', aliases: ['cottage cheese', 'hüttenkäse', 'huettenkaese'], defaultGrams: 200, per100: { kcal: 90, prot: 12.4, carb: 3.4, fat: 2.5, sug: 2.7 }, saturatedFat100: 1.6 },
  { id: 'whey', aliases: ['whey isolate', 'whey protein', 'protein powder', 'proteinpulver'], defaultGrams: 30, per100: { kcal: 380, prot: 82, carb: 7, fat: 4, sug: 4 } },
  { id: 'protein-shake', aliases: ['protein shake', 'proteinshake'], defaultGrams: 300, per100: { kcal: 60, prot: 10, carb: 2.7, fat: 1, sug: 1 } },
  { id: 'oats', aliases: ['rolled oats', 'oatmeal', 'haferflocken', 'oats'], defaultGrams: 60, per100: { kcal: 372, prot: 13.5, carb: 58.7, fat: 7, sug: 1 }, fiber100: 10 },
  { id: 'milk', aliases: ['semi skimmed milk', 'low fat milk', 'milch', 'milk'], defaultGrams: 250, per100: { kcal: 47, prot: 3.4, carb: 4.8, fat: 1.5, sug: 4.8 }, saturatedFat100: 1 },
  { id: 'berries', aliases: ['mixed berries', 'beeren', 'berries'], defaultGrams: 100, per100: { kcal: 50, prot: 1, carb: 10, fat: .5, sug: 7 }, fiber100: 4.5 },
  { id: 'banana', aliases: ['banane', 'banana'], defaultGrams: 120, per100: { kcal: 89, prot: 1.1, carb: 22.8, fat: .3, sug: 12.2 }, fiber100: 2.6 },
  { id: 'apple', aliases: ['apfel', 'apple'], defaultGrams: 180, per100: { kcal: 52, prot: .3, carb: 13.8, fat: .2, sug: 10.4 }, fiber100: 2.4 },
  { id: 'egg-whites', aliases: ['egg whites', 'eiklar'], defaultGrams: 150, per100: { kcal: 52, prot: 10.9, carb: .7, fat: .2, sug: .7 } },
  { id: 'eggs', aliases: ['eggs', 'eier', 'egg', 'ei'], defaultGrams: 60, per100: { kcal: 143, prot: 12.6, carb: .7, fat: 9.5, sug: .4 }, saturatedFat100: 3.1 },
  { id: 'chicken', aliases: ['chicken breast', 'hähnchenbrust', 'haehnchenbrust', 'chicken', 'hähnchen'], defaultGrams: 150, per100: { kcal: 165, prot: 31, carb: 0, fat: 3.6, sug: 0 }, saturatedFat100: 1 },
  { id: 'turkey', aliases: ['turkey breast', 'putenbrust', 'turkey', 'pute'], defaultGrams: 150, per100: { kcal: 135, prot: 29, carb: 0, fat: 1.6, sug: 0 }, saturatedFat100: .5 },
  { id: 'tuna', aliases: ['tuna in water', 'thunfisch im eigenen saft', 'thunfisch', 'tuna'], defaultGrams: 130, per100: { kcal: 116, prot: 26, carb: 0, fat: 1, sug: 0 }, saturatedFat100: .3 },
  { id: 'salmon', aliases: ['lachs', 'salmon'], defaultGrams: 150, per100: { kcal: 208, prot: 20.4, carb: 0, fat: 13.4, sug: 0 }, saturatedFat100: 3.1 },
  { id: 'lean-beef', aliases: ['lean beef', 'mageres rind', 'steak'], defaultGrams: 150, per100: { kcal: 217, prot: 26, carb: 0, fat: 12, sug: 0 }, saturatedFat100: 4.8 },
  { id: 'tofu', aliases: ['firm tofu', 'naturtofu', 'tofu'], defaultGrams: 180, per100: { kcal: 144, prot: 17, carb: 3, fat: 9, sug: .5 }, fiber100: 2.3, saturatedFat100: 1.3 },
  { id: 'lentils', aliases: ['cooked lentils', 'gekochte linsen', 'linsen', 'lentils'], defaultGrams: 180, per100: { kcal: 116, prot: 9, carb: 20.1, fat: .4, sug: 1.8 }, fiber100: 7.9 },
  { id: 'chickpeas', aliases: ['chickpeas', 'kichererbsen'], defaultGrams: 180, per100: { kcal: 164, prot: 8.9, carb: 27.4, fat: 2.6, sug: 4.8 }, fiber100: 7.6 },
  { id: 'rice', aliases: ['cooked rice', 'gekochter reis', 'basmati rice', 'basmatireis', 'rice', 'reis'], defaultGrams: 180, per100: { kcal: 130, prot: 2.7, carb: 28.2, fat: .3, sug: .1 }, fiber100: .4 },
  { id: 'potato', aliases: ['boiled potato', 'gekochte kartoffel', 'kartoffeln', 'potato'], defaultGrams: 250, per100: { kcal: 87, prot: 1.9, carb: 20.1, fat: .1, sug: .9 }, fiber100: 1.8 },
  { id: 'pasta', aliases: ['cooked pasta', 'gekochte nudeln', 'pasta', 'nudeln'], defaultGrams: 200, per100: { kcal: 158, prot: 5.8, carb: 30.9, fat: .9, sug: .6 }, fiber100: 1.8 },
  { id: 'wholegrain-bread', aliases: ['wholegrain bread', 'whole wheat bread', 'vollkornbrot'], defaultGrams: 80, per100: { kcal: 247, prot: 13, carb: 41, fat: 4.2, sug: 5 }, fiber100: 7 },
  { id: 'avocado', aliases: ['avocado'], defaultGrams: 100, per100: { kcal: 160, prot: 2, carb: 8.5, fat: 14.7, sug: .7 }, fiber100: 6.7, saturatedFat100: 2.1 },
  { id: 'olive-oil', aliases: ['olive oil', 'olivenöl', 'olivenoel'], defaultGrams: 10, per100: { kcal: 884, prot: 0, carb: 0, fat: 100, sug: 0 }, saturatedFat100: 14 },
  { id: 'peanut-butter', aliases: ['peanut butter', 'erdnussbutter'], defaultGrams: 30, per100: { kcal: 588, prot: 25, carb: 20, fat: 50, sug: 9 }, fiber100: 6, saturatedFat100: 10 },
  { id: 'broccoli', aliases: ['brokkoli', 'broccoli'], defaultGrams: 200, per100: { kcal: 35, prot: 2.4, carb: 7.2, fat: .4, sug: 1.4 }, fiber100: 3.3 },
  { id: 'mixed-vegetables', aliases: ['mixed vegetables', 'gemischtes gemüse', 'gemischtes gemuese'], defaultGrams: 200, per100: { kcal: 50, prot: 2.5, carb: 9, fat: .5, sug: 4 }, fiber100: 3.5 },
  { id: 'soda', aliases: ['coca-cola', 'coke', 'cola', 'fanta', 'sprite', 'soda'], defaultGrams: 330, per100: { kcal: 42, prot: 0, carb: 10.6, fat: 0, sug: 10.6 } },
  { id: 'juice', aliases: ['orange juice', 'apple juice', 'orangensaft', 'apfelsaft', 'saft', 'juice'], defaultGrams: 250, per100: { kcal: 45, prot: .7, carb: 10.4, fat: .2, sug: 8.4 } },
];

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

function aliasPosition(text: string, alias: string): number {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^a-z0-9äöüß])(${escaped})(?=$|[^a-z0-9äöüß])`, 'i').exec(text);
  return match ? match.index + match[1].length : -1;
}

function quantityNearAlias(text: string, aliasIndex: number, aliasLength: number, fallback: number): number {
  const before = text.slice(Math.max(0, aliasIndex - 24), aliasIndex);
  const after = text.slice(aliasIndex + aliasLength, aliasIndex + aliasLength + 18);
  const beforeGrams = before.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gramm|grams?)\s*$/i);
  const afterGrams = after.match(/^\s*(?:[:=-]?\s*)?(\d+(?:[.,]\d+)?)\s*(?:g|gramm|grams?)\b/i);
  const grams = beforeGrams?.[1] ?? afterGrams?.[1];
  if (grams) return Math.min(2_000, Math.max(5, Number(grams.replace(',', '.'))));
  const count = before.match(/(?:^|\s)(\d+)\s*(?:x\s*)?$/i)?.[1];
  return count ? Math.min(10, Math.max(1, Number(count))) * fallback : fallback;
}

function referenceFoodEstimate(text: string): ScanResult | null {
  const normalized = text.toLowerCase();
  const candidates = REFERENCE_FOODS.flatMap(food => {
    const alias = [...food.aliases].sort((a, b) => b.length - a.length).find(candidate => aliasPosition(normalized, candidate) >= 0);
    if (!alias) return [];
    return [{ food, alias, index: aliasPosition(normalized, alias) }];
  }).sort((a, b) => b.alias.length - a.alias.length);
  const matches = candidates.filter((candidate, index, all) => !all.slice(0, index).some(selected => {
    const selectedEnd = selected.index + selected.alias.length;
    const candidateEnd = candidate.index + candidate.alias.length;
    return candidate.index < selectedEnd && candidateEnd > selected.index;
  })).sort((a, b) => a.index - b.index);
  if (!matches.length) return null;

  const totals: Macros = { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 };
  let totalGrams = 0;
  let fiber = 0;
  let saturatedFat = 0;
  for (const match of matches) {
    const grams = quantityNearAlias(normalized, match.index, match.alias.length, match.food.defaultGrams);
    const factor = grams / 100;
    totalGrams += grams;
    (Object.keys(totals) as Array<keyof Macros>).forEach(key => {
      totals[key] += match.food.per100[key] * factor;
    });
    fiber += (match.food.fiber100 ?? 0) * factor;
    saturatedFat += (match.food.saturatedFat100 ?? 0) * factor;
  }
  (Object.keys(totals) as Array<keyof Macros>).forEach(key => { totals[key] = oneDecimal(totals[key]); });
  totals.kcal = Math.round(totals.kcal);
  totals.sug = Math.min(totals.carb, totals.sug);
  return {
    name: `${text.trim()} · ${Math.round(totalGrams)} g`,
    macros: totals,
    details: {
      source: 'local-reference',
      confidence: 'estimated',
      servingGrams: oneDecimal(totalGrams),
      fiber: oneDecimal(fiber),
      saturatedFat: oneDecimal(saturatedFat),
      components: matches.length,
    },
  };
}

// Portionsbasierte Alt-DB (letzte Text-Stufe)
export function dummyFoodMacros(input: string): Macros | null {
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
      return { ...m };
    }
  }
  return null;
}

export function keywordFoodEstimate(text: string): ScanResult | null {
  const reference = referenceFoodEstimate(text);
  if (reference) return reference;
  const s = (text || '').toLowerCase();
  const grams = parseGrams(s);
  const mult = parseMultiplier(s);
  for (const e of FOOD_PER100) {
    if (e.w.some(w => s.includes(w))) {
      const g = grams || e.g * mult;
      const f = g / 100;
      const r = (v: number) => Math.round(v * f);
      return {
        name: `${text} (${g} g)`,
        macros: { kcal: r(e.m.kcal), prot: r(e.m.prot), carb: r(e.m.carb), fat: r(e.m.fat), sug: r(e.m.sug) },
        details: { source: 'legacy-estimate', confidence: 'estimated', servingGrams: g, components: 1 },
      };
    }
  }
  const base = dummyFoodMacros(text || '');
  if (!base) return null;
  if (mult > 1) (Object.keys(base) as (keyof Macros)[]).forEach(k => { base[k] = Math.round(base[k] * mult); });
  return { name: text, macros: base, details: { source: 'legacy-estimate', confidence: 'estimated' } };
}

// Retained as a compatibility shim for older callers. A failed image analysis
// must be represented honestly instead of mapping image bytes to canned meals.
export function simulateVisionScan(_imageB64: string): ScanResult | null { return null; }

// Text entries deliberately stay on-device. They are conservative estimates
// until the user edits them; no configured backend receives the query.
export async function analyzeTextLocally(txt: string): Promise<ScanResult | null> {
  return keywordFoodEstimate(txt);
}

// The image itself never leaves the browser. A locally decoded barcode may be
// looked up at Open Food Facts; when that fails, return null instead of using
// the optional text hint as a fabricated image result.
export async function analyzeImageLocally(imageB64: string, hint: string): Promise<ScanResult | null> {
  const code = await detectBarcode(imageB64);
  if (code) {
    try {
      const prod = await offProductByBarcode(code);
      if (prod) {
        const r = macrosFromOFF(prod, parseGrams(hint));
        if (r) return {
          name: offName(prod, r.grams),
          macros: r.macros,
          details: {
            ...r.details,
            source: 'barcode-database',
            confidence: 'database',
            components: 1,
          },
        };
      }
    } catch { /* weiter in der Kaskade */ }
  }
  return null;
}
