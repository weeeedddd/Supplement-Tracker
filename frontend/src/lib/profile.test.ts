import { describe, expect, it } from 'vitest';

import {
  LEGACY_PLAN_PREFERENCES_STORAGE_KEY,
  LEGACY_PROFILE_STORAGE_KEY,
  PROFILE_LIMITS,
  USER_PROFILE_SCHEMA_VERSION,
  USER_PROFILE_STORAGE_KEY,
  calculateNutritionTargetsForProfile,
  loadUserProfile,
  migrateLegacyUserProfile,
  normalizeUserProfile,
  patchStoredUserProfile,
  patchUserProfile,
  saveUserProfile,
  userProfileFromPlanInput,
  userProfileToPlanInput,
  type ProfileStorage,
  type UserProfileV3,
} from './profile';
import type { PlanInput } from './plans';

class MemoryProfileStorage implements ProfileStorage {
  readonly values = new Map<string, unknown>();
  readonly writes: string[] = [];

  constructor(seed: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value);
  }

  get<T = unknown>(key: string): T | null {
    return (this.values.has(key) ? this.values.get(key) : null) as T | null;
  }

  set(key: string, value: unknown): void {
    this.writes.push(key);
    this.values.set(key, value);
  }
}

const planInput: PlanInput = {
  mode: 'inspiration',
  inspirationProfile: 'toji',
  displayName: 'Mira',
  age: 32,
  heightCm: 168,
  weightKg: 65,
  experience: 'intermediate',
  daysPerWeek: 4,
  equipment: ['bodyweight', 'dumbbells'],
  diet: 'vegetarian',
  goal: 'build_muscle',
  difficulty: 'medium',
};

function completeProfile(): UserProfileV3 {
  return userProfileFromPlanInput(planInput, {
    gender: 'f',
    dietaryPreferences: ['high protein'],
    lifestyle: {
      workStudyPattern: 'Office schedule',
      sleepDurationHours: 7.5,
      sleepQuality: 'good',
      allergiesExclusions: ['peanuts'],
    },
  });
}

describe('legacy profile migration', () => {
  it('merges profile and plan preferences while preserving existing values', () => {
    const migrated = migrateLegacyUserProfile({
      firstName: 'Legacy Mira',
      age: 31,
      height: 168,
      weight: 65,
      gender: 'f',
      goal: 'bulk',
      avatarIdx: 2,
      avatarPhoto: 'data:image/png;base64,abc',
      sleepHours: 6.5,
    }, {
      ...planInput,
      typicalDay: 'Commute, desk work, evening training.',
      preferredTrainingWindow: 'After work',
    });

    expect(migrated).toMatchObject({
      schemaVersion: 3,
      displayName: 'Mira',
      age: 32,
      heightCm: 168,
      weightKg: 65,
      gender: 'f',
      goal: 'build_muscle',
      experience: 'intermediate',
      daysPerWeek: 4,
      equipment: ['bodyweight', 'dumbbells'],
      diet: 'vegetarian',
      difficulty: 'medium',
      mode: 'inspiration',
      inspirationProfile: 'toji',
      lifestyle: {
        sleepDurationHours: 6.5,
        typicalDay: 'Commute, desk work, evening training.',
        preferredTrainingWindow: 'After work',
      },
      appearance: {
        avatarIndex: 2,
        avatarPhoto: 'data:image/png;base64,abc',
      },
    });
  });

  it('falls back to valid legacy values when newer preferences are corrupt', () => {
    const migrated = migrateLegacyUserProfile({
      firstName: 'Mira',
      age: 37,
      height: 171,
      weight: 72,
      trainingGoal: 'fat_loss',
      experience: 'advanced',
      daysPerWeek: 5,
      equipment: ['full_gym'],
      diet: 'omnivore',
    }, {
      displayName: '   ',
      age: 999,
      heightCm: 'not-a-number',
      weightKg: -1,
      experience: 'expert',
      daysPerWeek: 9,
      equipment: ['spaceship'],
      diet: 'invalid',
      goal: 'instant-results',
    });

    expect(migrated).toMatchObject({
      displayName: 'Mira',
      age: 37,
      heightCm: 171,
      weightKg: 72,
      goal: 'fat_loss',
      experience: 'advanced',
      daysPerWeek: 5,
      equipment: ['full_gym'],
      diet: 'omnivore',
    });
  });

  it('loads a normalized V3 profile first and otherwise migrates without writing', () => {
    const legacy = { firstName: 'Legacy', age: 29, height: 175, weight: 70 };
    const current = completeProfile();
    const currentStore = new MemoryProfileStorage({
      [USER_PROFILE_STORAGE_KEY]: current,
      [LEGACY_PROFILE_STORAGE_KEY]: legacy,
    });

    expect(loadUserProfile(currentStore)?.displayName).toBe('Mira');
    expect(currentStore.writes).toEqual([]);

    const legacyStore = new MemoryProfileStorage({
      [USER_PROFILE_STORAGE_KEY]: 'corrupt',
      [LEGACY_PROFILE_STORAGE_KEY]: legacy,
      [LEGACY_PLAN_PREFERENCES_STORAGE_KEY]: { ...planInput, displayName: 'Migrated' },
    });
    expect(loadUserProfile(legacyStore)?.displayName).toBe('Migrated');
    expect(legacyStore.writes).toEqual([]);
  });
});

describe('strict profile normalization', () => {
  it('rejects corrupt roots or profiles without a usable local identity', () => {
    expect(normalizeUserProfile(null)).toBeNull();
    expect(normalizeUserProfile('profile')).toBeNull();
    expect(normalizeUserProfile({ displayName: '   ' })).toBeNull();
    expect(migrateLegacyUserProfile({ age: 30 }, null)).toBeNull();
  });

  it('keeps all normalized values within storage and planning bounds', () => {
    const longText = 'a'.repeat(PROFILE_LIMITS.typicalDay + 100);
    const list = Array.from({ length: 30 }, (_, index) => ` item ${index} `);
    const normalized = normalizeUserProfile({
      schemaVersion: 900,
      displayName: ` ${'M'.repeat(60)} `,
      age: 150,
      heightCm: 500,
      weightKg: -20,
      daysPerWeek: 7,
      equipment: ['dumbbells', 'invalid'],
      goal: 'unknown',
      experience: 'expert',
      diet: 'anything',
      difficulty: 'impossible',
      mode: 'telepathy',
      lifestyle: {
        typicalDay: longText,
        sleepDurationHours: 24,
        sleepQuality: 'perfect',
        allergiesExclusions: [...list, 'item 1'],
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.schemaVersion).toBe(USER_PROFILE_SCHEMA_VERSION);
    expect(normalized?.displayName).toHaveLength(PROFILE_LIMITS.displayName);
    expect(normalized).toMatchObject({
      age: 25,
      heightCm: 170,
      weightKg: 70,
      daysPerWeek: 3,
      equipment: ['dumbbells'],
      goal: 'general_fitness',
      experience: 'beginner',
      diet: 'flexible',
      difficulty: 'medium',
      mode: 'own',
    });
    expect(normalized?.lifestyle.typicalDay).toHaveLength(PROFILE_LIMITS.typicalDay);
    expect(normalized?.lifestyle.sleepDurationHours).toBeUndefined();
    expect(normalized?.lifestyle.sleepQuality).toBeUndefined();
    expect(normalized?.lifestyle.allergiesExclusions).toHaveLength(PROFILE_LIMITS.listItems);
  });

  it('is deterministic and independent of the current clock or local date', () => {
    const first = migrateLegacyUserProfile({
      firstName: 'Mira',
      age: '32',
      height: '168',
      weight: '65',
      goal: 'bulk',
    }, planInput);
    const second = migrateLegacyUserProfile({
      firstName: 'Mira',
      age: '32',
      height: '168',
      weight: '65',
      goal: 'bulk',
    }, planInput);

    expect(second).toEqual(first);
    expect(first).not.toHaveProperty('createdAt');
    expect(first).not.toHaveProperty('updatedAt');
  });

  it('normalizes explicit activity and uses it in profile-driven nutrition targets', () => {
    const low = patchUserProfile(completeProfile(), { lifestyle: { activityLevel: 'sedentary' } });
    const high = patchUserProfile(completeProfile(), { lifestyle: { activityLevel: 'very_high' } });
    const lowTargets = calculateNutritionTargetsForProfile(low);
    const highTargets = calculateNutritionTargetsForProfile(high);

    expect(high.lifestyle.activityLevel).toBe('very_high');
    expect(highTargets.activityLevel).toBe('very_high');
    expect(highTargets.maintenanceCalories).toBeGreaterThan(lowTargets.maintenanceCalories! + 500);
  });
});

describe('non-destructive profile persistence', () => {
  it('patches nested lifestyle context without mutating the input profile', () => {
    const current = completeProfile();
    const before = structuredClone(current);
    const patched = patchUserProfile(current, {
      age: 999,
      gender: null,
      lifestyle: {
        typicalDay: 'Early shift, walk commute, train before dinner.',
        sleepDurationHours: 40,
        allergiesExclusions: [],
      },
    });

    expect(current).toEqual(before);
    expect(patched.age).toBe(32);
    expect(patched.gender).toBeUndefined();
    expect(patched.lifestyle).toMatchObject({
      workStudyPattern: 'Office schedule',
      typicalDay: 'Early shift, walk commute, train before dinner.',
      sleepDurationHours: 7.5,
      sleepQuality: 'good',
    });
    expect(patched.lifestyle.allergiesExclusions).toBeUndefined();
  });

  it('writes only the canonical profile key and leaves plans, protocols, workouts, and logs intact', () => {
    const profile = completeProfile();
    const protocol = [{ id: 'omega', phase: 'alpha' }];
    const workouts = [{ id: 'custom-1', name: 'My workout' }];
    const foodLog = [{ id: 1, name: 'Tofu' }];
    const storage = new MemoryProfileStorage({
      [USER_PROFILE_STORAGE_KEY]: profile,
      protocol,
      train_user_plans: workouts,
      'food_2026-08-07': foodLog,
      initial_plan: { id: 'existing-plan' },
    });

    const patched = patchStoredUserProfile({
      lifestyle: { preferredTrainingWindow: 'Morning' },
    }, storage);

    expect(patched?.lifestyle.preferredTrainingWindow).toBe('Morning');
    expect(storage.writes).toEqual([USER_PROFILE_STORAGE_KEY]);
    expect(storage.values.get('protocol')).toEqual(protocol);
    expect(storage.values.get('train_user_plans')).toEqual(workouts);
    expect(storage.values.get('food_2026-08-07')).toEqual(foodLog);
    expect(storage.values.get('initial_plan')).toEqual({ id: 'existing-plan' });
  });

  it('round-trips the existing deterministic PlanInput without adding medical or supplement fields', () => {
    const profile = userProfileFromPlanInput(planInput, {
      lifestyle: { injuriesLimitations: 'Avoid painful ranges.' },
    });
    const storage = new MemoryProfileStorage();
    const saved = saveUserProfile(profile, storage);
    const roundTrip = userProfileToPlanInput(saved);

    expect(roundTrip).toEqual(planInput);
    expect(JSON.stringify(roundTrip).toLowerCase()).not.toMatch(/dose|dosage|prescription|diagnosis|supplement/);
  });
});
