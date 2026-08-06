import { describe, expect, it } from 'vitest';
import { CURATED_RECIPES, importRecipeCatalog, recipeToDish, type RecipeCatalogEntry } from './recipes';

const validRecipe = {
  id: 'import-protein-oats',
  title: 'Protein overnight oats',
  category: 'breakfast',
  servings: 1,
  prepMinutes: 10,
  nutritionPerServing: { kcal: 420, protein: 30, carbs: 50, fat: 10, sugar: 12 },
  ingredients: [
    { amount: 60, unit: 'g', item: 'rolled oats' },
    { amount: 200, unit: 'g', item: 'plain skyr' },
  ],
  steps: ['Mix all ingredients.', 'Cover and chill overnight.'],
  equipment: ['none'],
  icon: 'O',
  provenance: { source: 'test-import' },
} satisfies RecipeCatalogEntry;

describe('typed recipe catalog', () => {
  it('ships a small, complete, internally valid curated sample', () => {
    expect(CURATED_RECIPES.length).toBeGreaterThanOrEqual(3);
    expect(CURATED_RECIPES.length).toBeLessThanOrEqual(8);
    expect(new Set(CURATED_RECIPES.map(recipe => recipe.id)).size).toBe(CURATED_RECIPES.length);
    for (const recipe of CURATED_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThanOrEqual(2);
      expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
      expect(recipe.nutritionPerServing.sugar).toBeLessThanOrEqual(recipe.nutritionPerServing.carbs);
    }
  });

  it('imports valid versioned recipes, de-duplicates ids, and reports rejected rows', () => {
    const invalid = {
      ...validRecipe,
      id: 'invalid-sugar',
      nutritionPerServing: { ...validRecipe.nutritionPerServing, carbs: 10, sugar: 20 },
    };
    const result = importRecipeCatalog({
      version: 1,
      recipes: [validRecipe, validRecipe, invalid],
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].id).toBe(validRecipe.id);
    expect(result.rejected).toHaveLength(2);
  });

  it('adapts a catalog recipe to the existing dish contract including sugar', () => {
    const dish = recipeToDish(validRecipe);
    expect(dish).toMatchObject({
      id: validRecipe.id,
      name: validRecipe.title,
      prep_min: 10,
      kcal: 420,
      prot: 30,
      carb: 50,
      fat: 10,
      sug: 12,
    });
    expect(dish.ingredients[0]).toContain('rolled oats');
  });
});
