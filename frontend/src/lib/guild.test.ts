import { beforeEach, describe, expect, it } from 'vitest';

import {
  SYNC_ALLOW,
  applyRemoteState,
  collectLocalState,
  isSyncable,
  weekContribution,
} from './guild';
import type { MuscleLoadEntry } from './muscleLoad';

// vitest läuft hier ohne DOM — ein minimaler Speicher genügt, um das
// tatsächliche Verhalten zu prüfen statt es nur zu behaupten.
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

const entry = (over: Partial<MuscleLoadEntry>): MuscleLoadEntry => ({
  id: 'e', muscleId: 'chest', sets: 4, reps: 10, durationMinutes: 0,
  createdAt: 0, source: 'set', ...over,
});

describe('sync allow-list', () => {
  it('never lets credentials or device-local state leave the device', () => {
    // Der kritische Fall: eine Sperrliste würde diese Schlüssel mitnehmen.
    for (const key of [
      'auth', '_pending', 'guild_account_v1', 'session', 'backend_url',
      'guild_sync_rev_v1', 'guild_sync_last_v1',
      'notification_preferences_v1', 'notification_items_v1',
      'price_cache', 'food_cache', 'local_workspace',
    ]) {
      expect(isSyncable(key)).toBe(false);
    }
  });

  it('carries the real training and nutrition data', () => {
    for (const key of ['profile', 'macros', 'train_muscle_load_v1', 'streak', 'xp']) {
      expect(isSyncable(key)).toBe(true);
    }
    // Tagesbezogene Schlüssel tragen ein Datum im Namen …
    expect(isSyncable('day_2026-08-18')).toBe(true);
    expect(isSyncable('food_2026-08-18')).toBe(true);
    // … ein gleichnamiger Cache ohne Datum dagegen nicht.
    expect(isSyncable('food_cache')).toBe(false);
    expect(isSyncable('day_notes')).toBe(false);
  });

  it('collects only allow-listed keys even when secrets sit beside them', () => {
    localStorage.setItem('sg_auth', JSON.stringify({ email: 'a@x.de', pw: 'YmFzZTY0' }));
    localStorage.setItem('sg_guild_account_v1', JSON.stringify({ token: 'deadbeef' }));
    localStorage.setItem('sg_profile', JSON.stringify({ firstName: 'Vaze' }));
    localStorage.setItem('sg_day_2026-08-18', JSON.stringify(['kreatin']));

    const collected = collectLocalState();
    const serialized = JSON.stringify(collected);

    expect(Object.keys(collected).sort()).toEqual(['day_2026-08-18', 'profile']);
    expect(serialized).not.toContain('YmFzZTY0');
    expect(serialized).not.toContain('deadbeef');
  });

  it('refuses to write non-allow-listed keys coming back from a server', () => {
    const applied = applyRemoteState({
      profile: { firstName: 'Kira' },
      guild_account_v1: { token: 'attacker' },
      backend_url: 'https://evil.example',
    });

    expect(applied).toBe(1);
    expect(localStorage.getItem('sg_profile')).toContain('Kira');
    expect(localStorage.getItem('sg_guild_account_v1')).toBeNull();
    expect(localStorage.getItem('sg_backend_url')).toBeNull();
  });

  it('keeps every known credential key out of the allow-list', () => {
    // Ein präziser Abgleich statt einer unscharfen Regex: 'train_sessions'
    // ist Trainingsdatum, keine Anmeldesitzung.
    const credentialKeys = [
      'auth', '_pending', 'session', 'guild_account_v1', 'backend_url',
      'notification_preferences_v1', 'local_workspace',
    ];
    const leaked = credentialKeys.filter(key => (SYNC_ALLOW as readonly string[]).includes(key));

    expect(leaked).toEqual([]);
  });
});

describe('raid contribution from local training data', () => {
  const now = new Date(2026, 7, 18, 12, 0).getTime();
  const DAY = 86_400_000;

  it('sums training load for a volume raid and ignores anything older than a week', () => {
    const recent = weekContribution('volume', [
      entry({ id: 'a', createdAt: now - 2 * DAY }),
      entry({ id: 'b', createdAt: now - 30 * DAY }),
    ], now);
    const single = weekContribution('volume', [entry({ id: 'a', createdAt: now - 2 * DAY })], now);

    expect(recent).toBe(single);
    expect(recent).toBeGreaterThan(0);
  });

  it('counts distinct calendar days for a session raid', () => {
    const value = weekContribution('sessions', [
      entry({ id: 'a', createdAt: now - 1 * DAY }),
      entry({ id: 'b', createdAt: now - 1 * DAY }),   // gleicher Tag → zählt einmal
      entry({ id: 'c', createdAt: now - 3 * DAY }),
    ], now);

    expect(value).toBe(2);
  });

  it('adds protocol adherence on top of training days for a consistency raid', () => {
    localStorage.setItem(`sg_day_${'2026-08-18'}`, JSON.stringify(['kreatin']));
    const value = weekContribution('consistency', [entry({ id: 'a', createdAt: now - 1 * DAY })], now);

    expect(value).toBe(2);   // 1 Trainingstag + 1 Protokolltag
  });
});
