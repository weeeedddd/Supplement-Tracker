import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadSupplementShoppingIntent,
  onlineSupplementSearchUrl,
  setSupplementShoppingIntent,
} from './shoppingIntent';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('supplement shopping intent', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('accepts only reviewed supplement ids and expires old intents', () => {
    expect(setSupplementShoppingIntent('unknown', 'Unknown', 1_000)).toBeNull();
    expect(setSupplementShoppingIntent('kreatin', 'Creatine monohydrate', 10_000)).not.toBeNull();
    expect(loadSupplementShoppingIntent(10_000)?.supplementId).toBe('kreatin');
    expect(loadSupplementShoppingIntent(8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('builds a neutral external search URL without treating stock as verified', () => {
    const intent = setSupplementShoppingIntent('protein', 'Whey isolate', 10_000)!;
    const url = new URL(onlineSupplementSearchUrl(intent, 'MK', 'en'));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('q')).toContain('Whey isolate');
    expect(url.searchParams.get('q')).toContain('MK');
  });
});
