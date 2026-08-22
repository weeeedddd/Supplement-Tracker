// ═══════════════════════════════════════════════════════════════════
//  ◈ SUPPLEMENT-BEZUG — „habe ich / brauche ich" plus Bezugswege
//  Nur Suchlinks: keine Preise, keine Verfügbarkeit, keine Kaufempfehlung
//  und keine Bestellung aus der App heraus.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';

export const SUPPLEMENT_STOCK_STORAGE_KEY = 'supplement_stock_v1';
export const SUPPLEMENT_STOCK_UPDATED_EVENT = 'coreline:supplement-stock-updated';

export type SupplementStockState = 'have' | 'need';
export type LocalStoreKind = 'pharmacy' | 'drugstore' | 'supplement_shop' | 'supermarket';

export interface LocalizedText { de: string; en: string }

export interface SupplementSourcing {
  /** Local shop categories that commonly stock this kind of product. */
  storeKinds: LocalStoreKind[];
  /** Product wording used for an online search. */
  productTerm: LocalizedText;
}

export const LOCAL_STORE_LABELS: Record<LocalStoreKind, LocalizedText> = {
  pharmacy: { de: 'Apotheke', en: 'Pharmacy' },
  drugstore: { de: 'Drogeriemarkt', en: 'Drugstore' },
  supplement_shop: { de: 'Sportnahrung-Fachgeschäft', en: 'Sports nutrition store' },
  supermarket: { de: 'Supermarkt', en: 'Supermarket' },
};

const LOCAL_STORE_QUERIES: Record<LocalStoreKind, LocalizedText> = {
  pharmacy: { de: 'Apotheke in der Nähe', en: 'pharmacy near me' },
  drugstore: { de: 'Drogeriemarkt in der Nähe', en: 'drugstore near me' },
  supplement_shop: { de: 'Sportnahrung Geschäft in der Nähe', en: 'sports nutrition store near me' },
  supermarket: { de: 'Supermarkt in der Nähe', en: 'supermarket near me' },
};

export const SUPPLEMENT_SOURCING: Record<string, SupplementSourcing> = {
  protein: {
    storeKinds: ['supermarket', 'drugstore', 'supplement_shop'],
    productTerm: { de: 'Proteinpulver', en: 'protein powder' },
  },
  kreatin: {
    storeKinds: ['supplement_shop', 'drugstore', 'pharmacy'],
    productTerm: { de: 'Kreatin Monohydrat', en: 'creatine monohydrate' },
  },
  omega: {
    storeKinds: ['pharmacy', 'drugstore', 'supermarket'],
    productTerm: { de: 'Omega-3 Kapseln', en: 'omega-3 capsules' },
  },
  vitd: {
    storeKinds: ['pharmacy', 'drugstore'],
    productTerm: { de: 'Vitamin D3', en: 'vitamin D3' },
  },
  magnesium: {
    storeKinds: ['pharmacy', 'drugstore', 'supermarket'],
    productTerm: { de: 'Magnesium', en: 'magnesium' },
  },
  eaa: {
    storeKinds: ['supplement_shop', 'drugstore'],
    productTerm: { de: 'EAA essenzielle Aminosäuren', en: 'EAA essential amino acids' },
  },
  zinc: {
    storeKinds: ['pharmacy', 'drugstore'],
    productTerm: { de: 'Zink Tabletten', en: 'zinc tablets' },
  },
  'mass-gainer': {
    storeKinds: ['supplement_shop', 'drugstore'],
    productTerm: { de: 'Mass Gainer', en: 'mass gainer' },
  },
  preworkout: {
    storeKinds: ['supplement_shop', 'drugstore'],
    productTerm: { de: 'Pre-Workout Booster', en: 'pre-workout supplement' },
  },
};

const DEFAULT_SOURCING: SupplementSourcing = {
  storeKinds: ['pharmacy', 'drugstore'],
  productTerm: { de: 'Nahrungsergänzungsmittel', en: 'dietary supplement' },
};

export function getSupplementSourcing(id: string): SupplementSourcing {
  return SUPPLEMENT_SOURCING[id] ?? DEFAULT_SOURCING;
}

const pick = (value: LocalizedText, language: string): string => language === 'de' ? value.de : value.en;

// ── Lokaler Bestand: „habe ich" / „brauche ich" ──────────────────────

export type SupplementStock = Record<string, SupplementStockState>;

function sanitizeStock(value: unknown): SupplementStock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<SupplementStock>((stock, [id, state]) => {
    if (typeof id === 'string' && id.length <= 60 && (state === 'have' || state === 'need')) {
      stock[id] = state;
    }
    return stock;
  }, {});
}

export function loadSupplementStock(): SupplementStock {
  return sanitizeStock(S.get<unknown>(SUPPLEMENT_STOCK_STORAGE_KEY));
}

export function getSupplementStockState(id: string): SupplementStockState | null {
  return loadSupplementStock()[id] ?? null;
}

/** Passing ``null`` clears the answer for that product. */
export function setSupplementStockState(id: string, state: SupplementStockState | null): SupplementStock {
  const stock = loadSupplementStock();
  if (state === null) delete stock[id];
  else stock[id] = state;
  S.set(SUPPLEMENT_STOCK_STORAGE_KEY, stock);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SUPPLEMENT_STOCK_UPDATED_EVENT));
  return stock;
}

export function missingSupplementIds(ids: string[]): string[] {
  const stock = loadSupplementStock();
  return ids.filter(id => stock[id] === 'need');
}

// ── Bezugswege: nur Suchlinks ────────────────────────────────────────

export interface SourcingLink {
  id: string;
  label: string;
  url: string;
}

/**
 * Map search for one shop category. Maps resolves "near me" against the
 * device location, so CORELINE never has to read or store it.
 */
export function nearbyShopSearchUrl(kind: LocalStoreKind, language: string, place?: string): string {
  const query = place?.trim()
    ? `${pick(LOCAL_STORE_LABELS[kind], language)} ${place.trim()}`
    : pick(LOCAL_STORE_QUERIES[kind], language);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function nearbyShopLinks(id: string, language: string, place?: string): SourcingLink[] {
  return getSupplementSourcing(id).storeKinds.map(kind => ({
    id: kind,
    label: pick(LOCAL_STORE_LABELS[kind], language),
    url: nearbyShopSearchUrl(kind, language, place),
  }));
}

const AMAZON_DOMAINS: Record<string, string> = {
  DE: 'amazon.de',
  AT: 'amazon.de',
  CH: 'amazon.de',
  NL: 'amazon.nl',
  BE: 'amazon.com.be',
  FR: 'amazon.fr',
  IT: 'amazon.it',
  ES: 'amazon.es',
  PL: 'amazon.pl',
  SE: 'amazon.se',
  GB: 'amazon.co.uk',
  IE: 'amazon.co.uk',
  US: 'amazon.com',
  CA: 'amazon.ca',
};

/**
 * Online search options. These are searches, not product links: CORELINE
 * verifies no price, no stock and no seller, and recommends no brand.
 */
export function onlineOrderLinks(id: string, language: string, country = 'DE'): SourcingLink[] {
  const term = pick(getSupplementSourcing(id).productTerm, language);
  const query = encodeURIComponent(term);
  const marketplace = AMAZON_DOMAINS[country.toUpperCase()] ?? 'amazon.com';
  return [
    {
      id: 'web-search',
      label: language === 'de' ? 'Shops im Web suchen' : 'Search shops on the web',
      url: `https://duckduckgo.com/?q=${encodeURIComponent(`${term} ${language === 'de' ? 'kaufen' : 'buy'}`)}`,
    },
    {
      id: 'shopping-search',
      label: language === 'de' ? 'Produktsuche mit Preisvergleich' : 'Product search with price comparison',
      url: `https://www.google.com/search?tbm=shop&q=${query}`,
    },
    {
      id: 'marketplace',
      label: language === 'de' ? `Marktplatz (${marketplace})` : `Marketplace (${marketplace})`,
      url: `https://www.${marketplace}/s?k=${query}`,
    },
  ];
}
