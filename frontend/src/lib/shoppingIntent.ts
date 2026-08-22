import { SAFE_SUPPLEMENT_CATALOG } from './supplements';
import { S } from './storage';

export const SHOPPING_INTENT_STORAGE_KEY = 'shopping_intent_v1';

export interface SupplementShoppingIntent {
  kind: 'supplement';
  supplementId: string;
  label: string;
  createdAt: number;
}

const SAFE_SUPPLEMENT_IDS = new Set(SAFE_SUPPLEMENT_CATALOG.map(item => item.id));
const MAX_INTENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setSupplementShoppingIntent(
  supplementId: string,
  label: string,
  createdAt = Date.now(),
): SupplementShoppingIntent | null {
  if (!SAFE_SUPPLEMENT_IDS.has(supplementId)) return null;
  const intent: SupplementShoppingIntent = {
    kind: 'supplement',
    supplementId,
    label: label.trim().slice(0, 100),
    createdAt,
  };
  S.set(SHOPPING_INTENT_STORAGE_KEY, intent);
  return intent;
}

export function loadSupplementShoppingIntent(now = Date.now()): SupplementShoppingIntent | null {
  const value = S.get<SupplementShoppingIntent>(SHOPPING_INTENT_STORAGE_KEY);
  if (!value || value.kind !== 'supplement' || !SAFE_SUPPLEMENT_IDS.has(value.supplementId)) return null;
  if (typeof value.label !== 'string' || !value.label.trim()) return null;
  if (!Number.isFinite(value.createdAt) || value.createdAt < now - MAX_INTENT_AGE_MS || value.createdAt > now + 60_000) return null;
  return { ...value, label: value.label.trim().slice(0, 100) };
}

export function onlineSupplementSearchUrl(
  intent: SupplementShoppingIntent,
  country: string,
  language: 'de' | 'en',
): string {
  const query = language === 'de'
    ? `${intent.label} kaufen ${country} seriöser Händler Produktetikett`
    : `buy ${intent.label} ${country} reputable retailer product label`;
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.toString();
}
