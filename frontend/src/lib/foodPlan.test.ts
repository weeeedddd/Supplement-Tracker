import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CHARACTER_PATHS } from './characterPaths';
import type { Dish } from './fitness';
import {
  acceptFoodPlanOffer,
  buildCharacterFoodPlan,
  declineFoodPlanOffer,
  FOOD_PLAN_OFFER_WINDOW_MS,
  loadActiveFoodPlan,
  loadFoodPlanOffer,
  pendingFoodPlanOffer,
  portionsForSlot,
  sanitizeFoodPlan,
  storeFoodPlanOffer,
} from './foodPlan';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const dish = (overrides: Partial<Dish> & Pick<Dish, 'id' | 'category' | 'kcal' | 'prot'>): Dish => ({
  name: String(overrides.id),
  ingredients: [],
  prep_min: 10,
  carb: 40,
  fat: 10,
  equipment: [],
  icon: '🍽️',
  ...overrides,
});

const CATALOGUE: Dish[] = [
  dish({ id: 'lean-breakfast', category: 'breakfast', kcal: 400, prot: 38, goals: ['fat_loss', 'general_fitness'] }),
  dish({ id: 'rich-breakfast', category: 'breakfast', kcal: 780, prot: 30, goals: ['build_muscle'] }),
  dish({ id: 'lean-main', category: 'main', kcal: 520, prot: 48, goals: ['fat_loss', 'get_stronger'] }),
  dish({ id: 'rich-main', category: 'main', kcal: 900, prot: 45, goals: ['build_muscle', 'get_stronger'] }),
  dish({ id: 'vegan-main', category: 'main', kcal: 560, prot: 32, goals: ['general_fitness'], diets: ['vegan', 'vegetarian'] }),
  dish({ id: 'omnivore-main', category: 'main', kcal: 540, prot: 52, goals: ['fat_loss', 'get_stronger'], diets: ['omnivore'] }),
  dish({ id: 'snack', category: 'snack', kcal: 220, prot: 22, goals: ['fat_loss', 'build_muscle'] }),
];

const TARGETS = { calories: 2400, protein: 160, carbs: 250, fat: 80, sugar: 40 };

describe('character food plan', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('drafts one meal per slot without repeating a dish', () => {
    const plan = buildCharacterFoodPlan({ path: CHARACTER_PATHS.toji, dishes: CATALOGUE, targets: TARGETS });
    expect(plan).not.toBeNull();
    expect(plan!.meals.map(meal => meal.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(new Set(plan!.meals.map(meal => meal.dishId)).size).toBe(plan!.meals.length);
    expect(plan!.targets.kcal).toBe(2400);
    expect(plan!.totals.kcal).toBe(plan!.meals.reduce((sum, meal) => sum + meal.nutrition.kcal, 0));
  });

  it('follows the energy bias of the equipped path', () => {
    const lean = buildCharacterFoodPlan({ path: CHARACTER_PATHS.toji, dishes: CATALOGUE, targets: TARGETS });
    const surplus = buildCharacterFoodPlan({ path: CHARACTER_PATHS.goku, dishes: CATALOGUE, targets: TARGETS });
    expect(lean!.meals[0].dishId).toBe('lean-breakfast');
    expect(surplus!.meals[0].dishId).toBe('rich-breakfast');
  });

  it('excludes dishes labelled for another diet and keeps unlabelled ones', () => {
    const vegan = buildCharacterFoodPlan({
      path: CHARACTER_PATHS.tanjiro,
      dishes: CATALOGUE,
      targets: TARGETS,
      diet: 'vegan',
    });
    expect(vegan!.meals.map(meal => meal.dishId)).not.toContain('omnivore-main');

    const omnivore = buildCharacterFoodPlan({
      path: CHARACTER_PATHS.tanjiro,
      dishes: CATALOGUE,
      targets: TARGETS,
      diet: 'omnivore',
    });
    expect(omnivore!.meals.map(meal => meal.dishId)).not.toContain('vegan-main');
  });

  it('returns null when no calorie target or no dish is available', () => {
    expect(buildCharacterFoodPlan({ path: CHARACTER_PATHS.toji, dishes: CATALOGUE, targets: { ...TARGETS, calories: 0 } })).toBeNull();
    expect(buildCharacterFoodPlan({ path: CHARACTER_PATHS.toji, dishes: [], targets: TARGETS })).toBeNull();
  });

  it('scales portions in half steps within a usable range', () => {
    expect(portionsForSlot(600, 600)).toBe(1);
    expect(portionsForSlot(400, 600)).toBe(1.5);
    expect(portionsForSlot(2_000, 200)).toBe(0.5);
    expect(portionsForSlot(100, 2_000)).toBe(3);
    expect(portionsForSlot(0, 600)).toBe(1);
  });

  it('accepts an offer inside its window and stores the plan', () => {
    const now = 1_700_000_000_000;
    const plan = buildCharacterFoodPlan({ path: CHARACTER_PATHS.mikasa, dishes: CATALOGUE, targets: TARGETS, now })!;
    const offer = storeFoodPlanOffer(plan, now);
    expect(offer.expiresAt).toBe(now + FOOD_PLAN_OFFER_WINDOW_MS);
    expect(pendingFoodPlanOffer(now)).not.toBeNull();

    expect(acceptFoodPlanOffer(now)).not.toBeNull();
    expect(loadActiveFoodPlan()?.pathId).toBe('mikasa');
    expect(loadFoodPlanOffer()?.decision).toBe('accepted');
    expect(pendingFoodPlanOffer(now)).toBeNull();
  });

  it('keeps nothing when the user declines because they have their own plan', () => {
    const now = 1_700_000_000_000;
    const plan = buildCharacterFoodPlan({ path: CHARACTER_PATHS.baki, dishes: CATALOGUE, targets: TARGETS, now })!;
    storeFoodPlanOffer(plan, now);
    acceptFoodPlanOffer(now);

    declineFoodPlanOffer(now);
    expect(loadActiveFoodPlan()).toBeNull();
    expect(loadFoodPlanOffer()?.decision).toBe('declined');
    expect(pendingFoodPlanOffer(now)).toBeNull();
  });

  it('stops offering a lapsed proposal', () => {
    const now = 1_700_000_000_000;
    const plan = buildCharacterFoodPlan({ path: CHARACTER_PATHS.sanji, dishes: CATALOGUE, targets: TARGETS, now })!;
    storeFoodPlanOffer(plan, now);
    expect(pendingFoodPlanOffer(now + FOOD_PLAN_OFFER_WINDOW_MS + 1)).toBeNull();
    expect(loadFoodPlanOffer()?.decision).toBe('pending');
  });

  it('rejects stored plans that lost their shape', () => {
    expect(sanitizeFoodPlan(null)).toBeNull();
    expect(sanitizeFoodPlan({ pathId: 'not-a-path', meals: [] })).toBeNull();
    expect(sanitizeFoodPlan({ pathId: 'toji', meals: [{ slot: 'brunch' }] })).toBeNull();
    const recovered = sanitizeFoodPlan({
      pathId: 'toji',
      meals: [{
        slot: 'breakfast',
        dishId: 'x',
        portions: 1,
        name: 'Oats',
        nutrition: { kcal: 400, prot: 30, carb: 40, fat: 10, sug: 5 },
      }],
    });
    expect(recovered?.totals.kcal).toBe(400);
  });
});
