import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPublicSocialSnapshot, compareWithFriend, type SocialProfileView } from './social';
import { S } from './storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('real social snapshot', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

  it('publishes exact weekly volume and top lifts without raw workout history', () => {
    S.set('user_profile_v3', {
      schemaVersion: 3, displayName: 'Mika', age: 25, heightCm: 170, weightKg: 70,
      gender: 'f', goal: 'get_stronger', experience: 'intermediate', daysPerWeek: 4,
      equipment: ['full_gym'], diet: 'flexible', dietaryPreferences: [], difficulty: 'medium',
      mode: 'inspiration', inspirationProfile: 'mikasa', lifestyle: {},
    });
    const now = Date.UTC(2026, 7, 20, 12);
    const snapshot = buildPublicSocialSnapshot([{
      id: 's1', workoutId: 'm1', name: 'Mikasa Strength', kind: 'fullbody',
      startedAt: now - 4_000, completedAt: now - 2_000,
      completedSets: 3, totalSets: 3, setState: {}, totalVolumeKg: 1800,
      inspirationProfile: 'mikasa', exercises: [
        { name: 'Deadlift', completedSets: 3, reps: 5, weightKg: 120, durationSeconds: 0, volumeKg: 1800 },
      ],
    }], now);

    expect(snapshot.characterPath).toBe('mikasa');
    expect(snapshot.gender).toBe('female');
    expect(snapshot.weekly).toMatchObject({ activeDays: 1, workouts: 1, volumeKg: 1800, completedQuests: 1 });
    expect(snapshot.topLifts[0]).toMatchObject({ name: 'Deadlift', weightKg: 120, reps: 5 });
    expect(snapshot).not.toHaveProperty('sessions');
  });

  it('compares only identical exercises side by side', () => {
    const friend = {
      weekly: { activeDays: 2, workouts: 2, volumeKg: 5000, completedQuests: 1 },
      topLifts: [{ exerciseKey: 'deadlift', name: 'Deadlift', weightKg: 130, reps: 3 }],
    } as SocialProfileView;
    const result = compareWithFriend(friend);
    expect(result.shared).toEqual([]);
    expect(result.weeklyVolume.theirs).toBe(5000);
  });
});
