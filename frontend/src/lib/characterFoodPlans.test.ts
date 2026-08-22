import { describe, expect, it } from 'vitest';

import { buildCharacterFoodPlan } from './characterFoodPlans';
import type { NutritionTargets } from './plans';

const targets: NutritionTargets = {
  calories: 2_600,
  protein: 170,
  carbs: 330,
  fat: 70,
  sugar: 60,
  method: 'mifflin-st-jeor-profile-v2',
  note: 'test',
};

describe('character food plans', () => {
  it('builds a four-meal plan from reviewed recipes without logging food', () => {
    const plan = buildCharacterFoodPlan('goku', { diet: 'omnivore', goal: 'build_muscle' }, targets, 'en', '2026-08-22T10:00:00.000Z');
    expect(plan.meals).toHaveLength(4);
    expect(new Set(plan.meals.map(meal => meal.recipeId)).size).toBe(4);
    expect(plan.meals.every(meal => meal.portions >= 0.5 && meal.portions <= 2.5)).toBe(true);
    expect(plan.plannedNutrition.kcal).toBeGreaterThan(1_800);
    expect(plan.targetCalories).toBe(2_600);
  });

  it('respects vegan selection for every recommended recipe', async () => {
    const plan = buildCharacterFoodPlan('toji', { diet: 'vegan', goal: 'fat_loss' }, targets, 'de');
    const { CURATED_RECIPES } = await import('./recipes');
    for (const meal of plan.meals) {
      expect(CURATED_RECIPES.find(recipe => recipe.id === meal.recipeId)?.diets).toContain('vegan');
    }
  });

  it('changes the meal ranking for character style while keeping target data explicit', () => {
    const toji = buildCharacterFoodPlan('toji', { diet: 'flexible', goal: 'general_fitness' }, targets, 'en');
    const goku = buildCharacterFoodPlan('goku', { diet: 'flexible', goal: 'general_fitness' }, targets, 'en');
    expect(toji.title).not.toBe(goku.title);
    expect(toji.meals.map(meal => meal.recipeId)).not.toEqual(goku.meals.map(meal => meal.recipeId));
    expect(goku.targetProtein).toBe(170);
  });
});
