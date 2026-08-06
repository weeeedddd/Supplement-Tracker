// ═══════════════════════════════════════════════════════════════════
//  ◈ MATERIA-SCANNER — TS-Port der Genauigkeits-Kaskade
//  Bevorzugt das Python-Backend (/api/food/…) für Analyse & Caching;
//  ohne Backend läuft die identische Kaskade direkt gegen Open Food
//  Facts (funktioniert auch auf GitHub Pages). Nie werfende Fallbacks.
// ═══════════════════════════════════════════════════════════════════
import { S, timeoutSignal } from './storage';
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
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: timeoutSignal(FOOD_API.timeoutMs) });
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
  { w: ['chips', 'crisps', 'sour cream', 'kartoffelchips', 'chip', 'potato chips', 'doritos', 'lay\'s', 'lays', 'dorito', 'cheese chips'], g: 50, m: { kcal: 530, prot: 6, carb: 50, fat: 34, sug: 2 } },
  { w: ['schokolade', 'chocolate', 'schoko'], g: 50, m: { kcal: 540, prot: 7, carb: 57, fat: 31, sug: 52 } },
  { w: ['keks', 'cookie', 'biscuit'], g: 40, m: { kcal: 480, prot: 6, carb: 66, fat: 21, sug: 32 } },
  { w: ['gummibär', 'haribo', 'gummy'], g: 75, m: { kcal: 340, prot: 7, carb: 77, fat: 0, sug: 46 } },
  { w: ['eis', 'ice cream', 'gelato'], g: 100, m: { kcal: 210, prot: 4, carb: 24, fat: 11, sug: 22 } },
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

// Retained as a compatibility shim for older callers. A failed image analysis
// must be represented honestly instead of mapping image bytes to canned meals.
export function simulateVisionScan(_imageB64: string): ScanResult | null { return null; }

// ── Backend-Analyse (bevorzugt, wenn konfiguriert) ───────────────────
async function backendAnalyze(params: Record<string, string>): Promise<ScanResult | null> {
  const backend = getBackendUrl();
  if (!backend) return null;
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${backend}/api/food/analyze?${qs}`, { signal: timeoutSignal(9000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.found && d.macros) return { name: '◈ ' + d.name, macros: d.macros };
  } catch { /* Backend down → lokale Kaskade */ }
  return null;
}

// ── ECHTER Foto-Scan über das Backend: das Bild selbst wird hochgeladen
//    und serverseitig ausgewertet (Barcode-Dekodierung, optional OCR)
async function backendScanImage(imageB64: string, hint: string): Promise<ScanResult | null> {
  const backend = getBackendUrl();
  if (!backend) return null;
  try {
    const blob = await (await fetch(imageB64)).blob();
    const fd = new FormData();
    fd.append('file', blob, 'scan.jpg');
    const qs = hint ? `?q=${encodeURIComponent(hint)}` : '';
    const res = await fetch(`${backend}/api/food/scan${qs}`, { method: 'POST', body: fd, signal: timeoutSignal(15000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.found && d.macros) return { name: '◈ ' + d.name, macros: d.macros };
  } catch { /* Backend down → Browser-Kaskade */ }
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

// FIX „Burrito Bowl": Die Vision-SIMULATION ist raus. Wird nichts echt
// erkannt, liefert die Kaskade null — die UI zeigt dann eine ehrliche
// Meldung statt erfundener Nährwerte.
export async function analyzeImageLocally(imageB64: string, hint: string): Promise<ScanResult | null> {
  // 1) Backend wertet das ECHTE Bild aus (Barcode serverseitig, optional OCR)
  const viaScan = await backendScanImage(imageB64, hint);
  if (viaScan) return viaScan;

  // 2) Browser-BarcodeDetector (Chrome/Android/Safari 17+) → OFF-Produkt
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

  // 3) Text-Hint des Users → validierte Suche/Keyword-Schätzung
  if (hint && hint.trim()) return analyzeTextLocally(hint);

  // 4) Nichts erkannt → ehrlich null (keine Mock-Daten mehr)
  return null;
}
