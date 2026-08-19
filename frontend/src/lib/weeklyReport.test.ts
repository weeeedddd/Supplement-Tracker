import { beforeEach, describe, expect, it } from 'vitest';

import {
  REPORT_MIN_ENTRIES,
  buildWeeklyReport,
  calorieAdherence,
  muscleBalance,
  nutritionConsistency,
  personalRecords,
  protocolConsistency,
  recommendations,
  volumeProgression,
} from './weeklyReport';
import type { MuscleLoadEntry } from './muscleLoad';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

const DAY = 86_400_000;
// Mittags lokaler Zeit, damit Tagesgrenzen nicht in die Prüfungen hineinspielen.
const NOW = new Date(2026, 7, 18, 12, 0).getTime();

const dayKeyOf = (offset: number) => {
  const date = new Date(NOW - offset * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const entry = (over: Partial<MuscleLoadEntry> & { id: string }): MuscleLoadEntry => ({
  muscleId: 'chest', sets: 4, reps: 10, durationMinutes: 0,
  createdAt: NOW, source: 'set', ...over,
});

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('weekly report — data honesty', () => {
  it('says outright when there is too little to report on', () => {
    const result = recommendations([entry({ id: 'a' })], NOW);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('low-data');
    expect(result[0].evidence).toBe(`1/${REPORT_MIN_ENTRIES}`);
  });

  it('every recommendation carries the number behind it', () => {
    const entries = Array.from({ length: 8 }, (_, index) => entry({
      id: `e${index}`, createdAt: NOW - index * DAY,
    }));

    recommendations(entries, NOW).forEach(recommendation => {
      expect(recommendation.evidence.trim().length).toBeGreaterThan(0);
    });
  });
});

describe('muscle balance', () => {
  it('measures each region against its own weekly target', () => {
    const balance = muscleBalance([
      entry({ id: 'a', muscleId: 'chest', sets: 6, reps: 12, durationMinutes: 40 }),
    ], NOW);
    const push = balance.find(row => row.id === 'push')!;
    const legs = balance.find(row => row.id === 'legs')!;

    expect(push.volume).toBeGreaterThan(0);
    expect(push.target).toBe(3 * 150);       // chest + shoulders + triceps
    expect(legs.volume).toBe(0);
    expect(legs.pct).toBe(0);
  });

  it('flags a clear imbalance between regions', () => {
    const entries = Array.from({ length: 6 }, (_, index) => entry({
      id: `push${index}`, muscleId: 'chest', sets: 8, reps: 15,
      durationMinutes: 60, createdAt: NOW - index * 0.5 * DAY,
    }));

    expect(recommendations(entries, NOW).map(r => r.id)).toContain('imbalance');
  });
});

describe('volume progression', () => {
  it('buckets entries into the right week and counts distinct session days', () => {
    const weeks = volumeProgression([
      entry({ id: 'now1', createdAt: NOW - 1 * DAY }),
      entry({ id: 'now2', createdAt: NOW - 1 * DAY }),   // gleicher Tag
      entry({ id: 'now3', createdAt: NOW - 3 * DAY }),
      entry({ id: 'prev', createdAt: NOW - 9 * DAY }),
    ], 4, NOW);

    const current = weeks[weeks.length - 1];
    const previous = weeks[weeks.length - 2];

    expect(current.sessions).toBe(2);
    expect(current.volume).toBeGreaterThan(0);
    expect(previous.volume).toBeGreaterThan(0);
    expect(weeks[0].volume).toBe(0);
  });
});

describe('consistency from what was actually logged', () => {
  it('counts only days with food entries', () => {
    localStorage.setItem(`sg_food_${dayKeyOf(0)}`, JSON.stringify([{ kcal: 600 }]));
    localStorage.setItem(`sg_food_${dayKeyOf(2)}`, JSON.stringify([{ kcal: 700 }]));
    localStorage.setItem(`sg_food_${dayKeyOf(3)}`, JSON.stringify([]));   // leer zählt nicht

    expect(nutritionConsistency(7, NOW)).toBe(Math.round((2 / 7) * 100));
  });

  it('counts protocol days independently', () => {
    localStorage.setItem(`sg_day_${dayKeyOf(0)}`, JSON.stringify(['kreatin']));

    expect(protocolConsistency(7, NOW)).toBe(Math.round((1 / 7) * 100));
  });

  it('has no calorie opinion without a target', () => {
    localStorage.setItem(`sg_food_${dayKeyOf(0)}`, JSON.stringify([{ kcal: 2000 }]));

    expect(calorieAdherence(7, NOW)).toBeNull();
  });

  it('compares logged calories against the stored target', () => {
    localStorage.setItem('sg_nutrition_targets_v2', JSON.stringify({ calories: 2000 }));
    localStorage.setItem(`sg_food_${dayKeyOf(0)}`, JSON.stringify([{ kcal: 1000 }]));

    expect(calorieAdherence(7, NOW)).toBe(50);
  });
});

describe('personal records', () => {
  it('reports the hardest single entry, the best day and the streak', () => {
    localStorage.setItem('sg_streak', JSON.stringify({ count: 9 }));
    const records = personalRecords([
      entry({ id: 'small', sets: 2, reps: 6 }),
      entry({ id: 'big', sets: 8, reps: 20, durationMinutes: 60 }),
    ], NOW);

    const kinds = records.map(record => record.kind);
    expect(kinds).toContain('session');
    expect(kinds).toContain('day');
    expect(kinds).toContain('streak');
    expect(records.find(record => record.kind === 'streak')!.value).toBe(9);
  });

  it('reports nothing at all when nothing was logged', () => {
    expect(personalRecords([], NOW)).toEqual([]);
  });
});

describe('report assembly', () => {
  it('produces every section without throwing on an empty history', () => {
    const report = buildWeeklyReport([], NOW);

    expect(report.balance).toHaveLength(4);
    expect(report.volume).toHaveLength(4);
    expect(report.nutrition).toHaveLength(7);
    expect(report.recommendations[0].id).toBe('low-data');
    expect(report.caloriePct).toBeNull();
  });
});
