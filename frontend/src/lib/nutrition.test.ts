import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calcConsumed } from './engine';
import {
  estimateCaloriesFromMacros,
  logMeal,
  normalizeNutrition,
  validateNutrition,
} from './fitness';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('nutrition calculations and persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
  });

  it('estimates calories from protein, carbohydrate, and fat without double-counting sugar', () => {
    expect(estimateCaloriesFromMacros({ prot: 20, carb: 30, fat: 10, sug: 12 })).toBe(290);
  });

  it('derives missing calories and preserves decimal macro values', () => {
    expect(normalizeNutrition({ kcal: 0, prot: 20.4, carb: 30.2, fat: 10.1, sug: 12.2 })).toEqual({
      kcal: 293,
      prot: 20.4,
      carb: 30.2,
      fat: 10.1,
      sug: 12.2,
    });
  });

  it('rejects negative nutrients and sugar above total carbohydrates', () => {
    const issues = validateNutrition({ kcal: 300, prot: -1, carb: 20, fat: 10, sug: 25 });
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['negative', 'sugar-exceeds-carbs']));
  });

  it('logs all five nutrition values into the daily food total', async () => {
    await logMeal({ name: 'Balanced bowl', kcal: 510, prot: 32, carb: 58, fat: 17, sug: 9 });

    expect(calcConsumed()).toEqual({ kcal: 510, prot: 32, carb: 58, fat: 17, sug: 9 });
  });
});
