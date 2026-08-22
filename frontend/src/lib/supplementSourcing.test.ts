import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SAFE_SUPPLEMENT_CATALOG } from './supplements';
import {
  getSupplementSourcing,
  getSupplementStockState,
  loadSupplementStock,
  missingSupplementIds,
  nearbyShopLinks,
  nearbyShopSearchUrl,
  onlineOrderLinks,
  setSupplementStockState,
  SUPPLEMENT_SOURCING,
} from './supplementSourcing';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('supplement sourcing', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', undefined);
  });

  it('covers every catalogue entry with shop categories and a product term', () => {
    for (const item of SAFE_SUPPLEMENT_CATALOG) {
      const sourcing = SUPPLEMENT_SOURCING[item.id];
      expect(sourcing, `missing sourcing for ${item.id}`).toBeDefined();
      expect(sourcing.storeKinds.length).toBeGreaterThan(0);
      expect(sourcing.productTerm.de.length).toBeGreaterThan(2);
      expect(sourcing.productTerm.en.length).toBeGreaterThan(2);
    }
  });

  it('falls back to a neutral sourcing entry for an unknown product', () => {
    expect(getSupplementSourcing('does-not-exist').storeKinds).toEqual(['pharmacy', 'drugstore']);
  });

  it('builds https map searches for each shop category', () => {
    const links = nearbyShopLinks('magnesium', 'de');
    expect(links.map(link => link.id)).toEqual(['pharmacy', 'drugstore', 'supermarket']);
    for (const link of links) expect(link.url.startsWith('https://www.google.com/maps/search/')).toBe(true);
    expect(nearbyShopSearchUrl('pharmacy', 'de')).toContain(encodeURIComponent('Apotheke in der Nähe'));
    expect(nearbyShopSearchUrl('pharmacy', 'de', '1070 Wien')).toContain(encodeURIComponent('Apotheke 1070 Wien'));
    expect(nearbyShopSearchUrl('pharmacy', 'en')).toContain(encodeURIComponent('pharmacy near me'));
  });

  it('builds online searches that stay on the requested marketplace region', () => {
    const german = onlineOrderLinks('kreatin', 'de', 'AT');
    expect(german.map(option => option.id)).toEqual(['web-search', 'shopping-search', 'marketplace']);
    expect(german.every(option => option.url.startsWith('https://'))).toBe(true);
    expect(german[2].url).toContain('amazon.de');
    expect(onlineOrderLinks('kreatin', 'en', 'GB')[2].url).toContain('amazon.co.uk');
    expect(onlineOrderLinks('kreatin', 'en', 'ZZ')[2].url).toContain('amazon.com');
    expect(german[0].url).toContain(encodeURIComponent('Kreatin Monohydrat kaufen'));
  });

  it('records and clears whether a product is already owned', () => {
    setSupplementStockState('protein', 'have');
    setSupplementStockState('kreatin', 'need');
    expect(getSupplementStockState('protein')).toBe('have');
    expect(missingSupplementIds(['protein', 'kreatin', 'omega'])).toEqual(['kreatin']);

    setSupplementStockState('kreatin', null);
    expect(getSupplementStockState('kreatin')).toBeNull();
    expect(missingSupplementIds(['protein', 'kreatin'])).toEqual([]);
  });

  it('drops stored stock entries that are not a valid answer', () => {
    localStorage.setItem('sg_supplement_stock_v1', JSON.stringify({ protein: 'have', kreatin: 'maybe', 7: 'need' }));
    expect(loadSupplementStock()).toEqual({ protein: 'have', 7: 'need' });
    localStorage.setItem('sg_supplement_stock_v1', JSON.stringify(['protein']));
    expect(loadSupplementStock()).toEqual({});
  });
});
