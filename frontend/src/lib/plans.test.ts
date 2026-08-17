import { describe, expect, it } from 'vitest';

import {
  INSPIRATION_PROFILES,
  calculateNutritionTargets,
  generateInitialPlan,
  validatePlanInput,
  type PlanInput,
} from './plans';

const guidedInput: PlanInput = {
  mode: 'guided',
  displayName: 'Mira',
  age: 32,
  heightCm: 168,
  weightKg: 65,
  experience: 'beginner',
  daysPerWeek: 3,
  equipment: ['bodyweight', 'dumbbells'],
  diet: 'vegetarian',
  goal: 'general_fitness',
  difficulty: 'medium',
};

describe('validatePlanInput', () => {
  it('accepts a complete, plausible local profile', () => {
    expect(validatePlanInput(guidedInput)).toEqual({ valid: true, errors: {} });
  });

  it('rejects missing identity and implausible body or schedule values', () => {
    const result = validatePlanInput({
      ...guidedInput,
      displayName: '   ',
      age: 12,
      heightCm: 90,
      weightKg: 400,
      daysPerWeek: 7,
      equipment: [],
    });

    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining([
      'displayName',
      'age',
      'heightCm',
      'weightKg',
      'daysPerWeek',
      'equipment',
    ]));
  });

  it('requires an inspiration profile only in inspiration mode', () => {
    const result = validatePlanInput({ ...guidedInput, mode: 'inspiration' });

    expect(result.errors.inspirationProfile).toBeTruthy();
    expect(validatePlanInput({
      ...guidedInput,
      mode: 'inspiration',
      inspirationProfile: 'tanjiro',
    }).valid).toBe(true);
  });
});

describe('generateInitialPlan', () => {
  it('creates a deterministic weekly plan that matches the requested schedule', () => {
    const first = generateInitialPlan(guidedInput);
    const second = generateInitialPlan(guidedInput);

    expect(first).toEqual(second);
    expect(first.daysPerWeek).toBe(3);
    expect(first.sessions).toHaveLength(3);
    expect(first.sessions.every((session) => session.exercises.length >= 3)).toBe(true);
    expect(first.sessions.every((session) => session.exercises.length <= 6)).toBe(true);
  });

  it('only selects exercises compatible with the available equipment', () => {
    const plan = generateInitialPlan({
      ...guidedInput,
      equipment: ['bodyweight'],
    });

    const usedEquipment = plan.sessions.flatMap((session) =>
      session.exercises.map((exercise) => exercise.equipment),
    );
    expect(new Set(usedEquipment)).toEqual(new Set(['bodyweight']));
  });

  it('caps hard plans for beginners and avoids prescribed loading or supplement doses', () => {
    const plan = generateInitialPlan({ ...guidedInput, difficulty: 'hard' });
    const exercises = plan.sessions.flatMap((session) => session.exercises);
    const copy = JSON.stringify(plan).toLowerCase();

    expect(Math.max(...exercises.map((exercise) => exercise.sets))).toBeLessThanOrEqual(3);
    expect(exercises.every((exercise) => exercise.effort === 'leave 2-3 reps in reserve')).toBe(true);
    expect(copy).not.toMatch(/\b\d+\s?(kg|lb|mg|iu)\b/);
    expect(copy).not.toContain('supplement');
    expect(copy).not.toContain('guarantee');
  });

  it('adds an extra safeguarding note for users under 18', () => {
    const plan = generateInitialPlan({ ...guidedInput, age: 16 });

    expect(plan.safetyNotes.join(' ').toLowerCase()).toContain('parent or guardian');
  });

  it('uses text-only inspiration profiles to adjust emphasis without artwork', () => {
    expect(INSPIRATION_PROFILES.map((profile) => profile.id)).toEqual(['toji', 'goku', 'tanjiro', 'kaneki', 'sanji', 'baki', 'mikasa']);
    expect(INSPIRATION_PROFILES.every((profile) => !('image' in profile))).toBe(true);

    const plan = generateInitialPlan({
      ...guidedInput,
      mode: 'inspiration',
      inspirationProfile: 'goku',
    });
    expect(plan.emphasis).toContain('conditioning');
    expect(plan.sourceLabel).toContain('Goku');
  });

  it('creates exclusive exercise pools for each equipped character path', () => {
    const plans = INSPIRATION_PROFILES.map(profile => ({
      id: profile.id,
      plan: generateInitialPlan({ ...guidedInput, mode: 'inspiration', inspirationProfile: profile.id }),
    }));
    const exercisePools = plans.map(({ id, plan }) => {
      const exercises = plan.sessions.flatMap(session => session.exercises);
      expect(exercises.every(exercise => exercise.id.startsWith(`${id}-`))).toBe(true);
      return exercises.map(exercise => exercise.id);
    });

    expect(new Set(exercisePools.map(pool => pool.join('|'))).size).toBe(INSPIRATION_PROFILES.length);
  });

  it('keeps character-specific muscle distributions on generated exercises', () => {
    const sanji = generateInitialPlan({
      ...guidedInput,
      mode: 'inspiration',
      inspirationProfile: 'sanji',
      equipment: ['bodyweight'],
    });
    const calfRaise = sanji.sessions.flatMap(session => session.exercises)
      .find(exercise => exercise.id === 'sanji-calf-raise');

    expect(calfRaise?.muscleTargets?.[0]).toEqual({ muscleId: 'calves', role: 'primary', share: .85 });
  });
});

describe('calculateNutritionTargets', () => {
  it('returns bounded targets whose energy roughly matches their macros', () => {
    const targets = calculateNutritionTargets(guidedInput);
    const macroCalories = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;

    expect(targets.calories).toBeGreaterThanOrEqual(1_200);
    expect(targets.calories).toBeLessThanOrEqual(4_500);
    expect(targets.protein / guidedInput.weightKg).toBeGreaterThanOrEqual(1.4);
    expect(targets.protein / guidedInput.weightKg).toBeLessThanOrEqual(2.2);
    expect(Math.abs(macroCalories - targets.calories)).toBeLessThan(40);
    expect(targets.sugar).toBeLessThanOrEqual(targets.carbs);
  });

  it('uses the goal to adjust energy without producing extreme targets', () => {
    const fatLoss = calculateNutritionTargets({ ...guidedInput, goal: 'fat_loss' });
    const muscle = calculateNutritionTargets({ ...guidedInput, goal: 'build_muscle' });

    expect(fatLoss.calories).toBeLessThan(muscle.calories);
    expect(fatLoss.protein).toBeGreaterThanOrEqual(muscle.protein);
  });
});
