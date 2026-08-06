import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as engine from './engine';
import type { FoodEntry } from './engine';
import { dateKey } from './storage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('supplement XP', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('credits a supplement only once per local day', () => {
    const credit = (
      engine as typeof engine & {
        creditDailySupplementXP?: (id: string, amount?: number, now?: Date) => boolean;
      }
    ).creditDailySupplementXP;

    expect(credit).toBeTypeOf('function');
    if (!credit) return;

    const today = new Date(2031, 0, 15, 12);
    const tomorrow = new Date(2031, 0, 16, 12);

    expect(credit('omega', 5, today)).toBe(true);
    expect(engine.getXP()).toBe(5);
    expect(credit('omega', 5, today)).toBe(false);
    expect(engine.getXP()).toBe(5);
    expect(credit('omega', 5, tomorrow)).toBe(true);
    expect(engine.getXP()).toBe(10);
  });
});

describe('food persistence boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('normalizes non-finite and negative macro values before storage and totals', () => {
    const malformed = {
      id: 1,
      name: 'Malformed meal',
      ts: 1,
      kcal: -400,
      prot: Number.POSITIVE_INFINITY,
      carb: Number.NaN,
      fat: 12,
      sug: -3,
    } as FoodEntry;

    engine.saveFoodLog([malformed]);

    expect(engine.getFoodLog()).toEqual([
      {
        id: 1,
        name: 'Malformed meal',
        ts: 1,
        kcal: 0,
        prot: 0,
        carb: 0,
        fat: 12,
        sug: 0,
      },
    ]);
    expect(engine.calcConsumed()).toEqual({ kcal: 0, prot: 0, carb: 0, fat: 12, sug: 0 });
  });

  it('also normalizes malformed legacy entries read from storage', () => {
    localStorage.setItem(
      `sg_food_${dateKey()}`,
      JSON.stringify([
        { id: 2, name: 'Legacy', ts: 2, kcal: -1, prot: null, carb: 8, fat: 3, sug: -2 },
      ]),
    );

    expect(engine.getFoodLog()[0]).toMatchObject({ kcal: 0, prot: 0, carb: 8, fat: 3, sug: 0 });
  });
});

describe('automatic supplement recommendations', () => {
  it('does not autonomously recommend higher-risk supplements', () => {
    const protocol = engine.generateSmartProtocol(
      {
        gender: 'f',
        goal: 'long',
      },
      {
        sleep: 'sleepless',
        stress: 'high',
      },
    );
    const ids = protocol.map((item) => item.id);

    for (const higherRiskId of ['iron', 'melatonin', 'ashwagandha', 'rhodiola']) {
      expect(ids).not.toContain(higherRiskId);
    }
  });

  it('exposes tracking-card copy without a dose or health claim', () => {
    const getDisplay = (
      engine as typeof engine & {
        getSafeProtocolDisplay?: (id: string) => { nameKey: string } | null;
      }
    ).getSafeProtocolDisplay;

    expect(getDisplay).toBeTypeOf('function');
    expect(getDisplay?.('omega')).toEqual({ nameKey: 'supp_omega' });
  });
});

describe('visible progression copy', () => {
  it('uses original neutral consistency and training language', () => {
    const visibleCopy = [
      ...engine.XP_RANKS.map((rank) => rank.label),
      ...Object.values(engine.ACHIEVE_DEFS).flatMap((achievement) => [
        achievement.name,
        achievement.desc,
      ]),
    ].join(' ');

    expect(visibleCopy).not.toMatch(/shadow|seven shadows|void|diener|nachtwandler|lord|alchemist/i);
  });
});
