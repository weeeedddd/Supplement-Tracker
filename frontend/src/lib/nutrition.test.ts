import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calcConsumed } from './engine';
import {
  estimateCaloriesFromMacros,
  logMeal,
  normalizeNutrition,
  scaleIngredientLine,
  scaleNutrition,
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

  it('rejects every nutrient above its per-entry safety limit', () => {
    const issues = validateNutrition({ kcal: 10_000.1, prot: 1_000.1, carb: 1_500.1, fat: 1_000.1, sug: 1_500.1 });

    expect(issues.filter(issue => issue.code === 'above-maximum').map(issue => issue.field)).toEqual([
      'kcal',
      'prot',
      'carb',
      'fat',
      'sug',
    ]);
  });

  it('clamps normalized nutrients and macro-derived calories to their safety limits', () => {
    expect(normalizeNutrition({ kcal: 99_999, prot: 9_999, carb: 9_999, fat: 9_999, sug: 9_999 })).toEqual({
      kcal: 10_000,
      prot: 1_000,
      carb: 1_500,
      fat: 1_000,
      sug: 1_500,
    });
    expect(normalizeNutrition({ kcal: 0, prot: 1_000, carb: 1_500, fat: 1_000, sug: 1_500 }).kcal).toBe(10_000);
  });

  it('rejects an oversized meal before anything is persisted', async () => {
    await expect(logMeal({ name: 'Oversized meal', kcal: 10_001, prot: 20, carb: 30, fat: 10, sug: 5 }))
      .rejects.toThrow('above-maximum');

    expect(calcConsumed()).toEqual({ kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 });
  });

  it('logs all five nutrition values into the daily food total', async () => {
    await logMeal({ name: 'Balanced bowl', kcal: 510, prot: 32, carb: 58, fat: 17, sug: 9 });

    expect(calcConsumed()).toEqual({ kcal: 510, prot: 32, carb: 58, fat: 17, sug: 9 });
  });

  it('recalculates every nutrient and ingredient amount for fractional servings', () => {
    expect(scaleNutrition({ kcal: 510, prot: 32, carb: 58, fat: 17, sug: 9 }, 1.5)).toEqual({
      kcal: 765,
      prot: 48,
      carb: 87,
      fat: 25.5,
      sug: 13.5,
    });
    expect(scaleIngredientLine('160 g Hähnchenbrust', 1.5)).toBe('240 g Hähnchenbrust');
    expect(scaleIngredientLine('1 Stück Wrap', .5)).toBe('0,5 Stück Wrap');
  });
});
