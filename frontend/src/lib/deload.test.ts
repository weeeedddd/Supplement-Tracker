import { describe, expect, it } from 'vitest';

import {
  DELOAD_LOOKBACK_DAYS,
  deloadFactor,
  detectDeload,
  lighterSession,
  volumeBetween,
} from './deload';
import type { MuscleLoadEntry } from './muscleLoad';

const DAY = 86_400_000;
const NOW = new Date('2026-08-18T12:00:00Z').getTime();

const entry = (over: Partial<MuscleLoadEntry> & { id: string }): MuscleLoadEntry => ({
  muscleId: 'chest', sets: 5, reps: 12, durationMinutes: 0,
  createdAt: NOW, source: 'set', ...over,
});

/** Ein Muskel, der über mehrere Tage hinweg hart belastet wird. */
function hammered(muscleId: MuscleLoadEntry['muscleId'], days: number[]): MuscleLoadEntry[] {
  return days.map((day, index) => entry({
    id: `${muscleId}-${index}`, muscleId, sets: 8, reps: 15,
    durationMinutes: 45, createdAt: NOW - day * DAY,
  }));
}

describe('deload detection', () => {
  it('stays quiet when nothing has been logged', () => {
    const signal = detectDeload([], NOW);

    expect(signal.level).toBe('none');
    expect(signal.strained).toEqual([]);
    expect(signal.reasons).toEqual([]);
  });

  it('stays quiet for a single hard session', () => {
    const signal = detectDeload(hammered('chest', [0]), NOW);

    expect(signal.level).toBe('none');
  });

  it('flags muscles that stay in the strained band across days', () => {
    // Alle 12 h nachlegen hält die Last über das 48-h-Fenster oben.
    const entries = [
      ...hammered('chest', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
      ...hammered('triceps', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
    ];
    const signal = detectDeload(entries, NOW);

    expect(signal.strained).toContain('chest');
    expect(signal.strained).toContain('triceps');
    expect(signal.reasons).toContain('persistent-strain');
    expect(signal.level).not.toBe('none');
  });

  it('reports a volume spike against the previous week', () => {
    const entries = [
      entry({ id: 'old', createdAt: NOW - 10 * DAY, sets: 2, reps: 8 }),
      ...hammered('chest', [0, 1, 2, 3]),
    ];
    const signal = detectDeload(entries, NOW);

    expect(signal.volumeTrendPct).toBeGreaterThanOrEqual(40);
    expect(signal.reasons).toContain('volume-spike');
  });

  it('has no opinion on the trend without a previous week to compare', () => {
    expect(detectDeload(hammered('chest', [0, 1]), NOW).volumeTrendPct).toBe(0);
  });

  it('escalates to urgent only when the signals stack up', () => {
    const many = ['chest', 'triceps', 'shoulders', 'back', 'biceps'] as const;
    const entries = many.flatMap(muscleId =>
      hammered(muscleId, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]));
    const signal = detectDeload(entries, NOW);

    expect(signal.strained.length).toBeGreaterThanOrEqual(4);
    expect(signal.level).toBe('urgent');
  });

  it('looks back over a bounded window', () => {
    // Alles älter als das Fenster darf die Warnung nicht mehr auslösen.
    const stale = hammered('chest', [20, 21, 22, 23]);

    expect(detectDeload(stale, NOW).level).toBe('none');
    expect(DELOAD_LOOKBACK_DAYS).toBe(5);
  });
});

describe('lighter session prescription', () => {
  it('proposes nothing while no deload is advised', () => {
    expect(lighterSession(hammered('chest', [0]), detectDeload(hammered('chest', [0]), NOW), NOW))
      .toEqual([]);
  });

  it('cuts sets from what was actually last done, keeping the reps', () => {
    const entries = [
      ...hammered('chest', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
      ...hammered('triceps', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
      ...hammered('shoulders', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
      ...hammered('back', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]),
    ];
    const signal = detectDeload(entries, NOW);
    const plan = lighterSession(entries, signal, NOW);

    expect(plan.length).toBe(signal.strained.length);
    plan.forEach(item => {
      expect(item.sets).toBeLessThan(8);        // weniger als zuletzt geleistet
      expect(item.sets).toBeGreaterThanOrEqual(1);
      expect(item.reps).toBe(15);               // Wiederholungen bleiben
    });
  });

  it('reduces harder the more urgent the signal is', () => {
    expect(deloadFactor('urgent')).toBeLessThan(deloadFactor('advised'));
    expect(deloadFactor('advised')).toBeLessThan(deloadFactor('none'));
    expect(deloadFactor('none')).toBe(1);
  });
});

describe('volume window', () => {
  it('counts only entries inside the requested range', () => {
    const entries = [
      entry({ id: 'a', createdAt: NOW - 1 * DAY }),
      entry({ id: 'b', createdAt: NOW - 9 * DAY }),
    ];

    expect(volumeBetween(entries, NOW - 7 * DAY, NOW + 1))
      .toBe(volumeBetween([entries[0]], NOW - 7 * DAY, NOW + 1));
  });
});
