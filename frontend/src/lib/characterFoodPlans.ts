import { getCharacterPath } from './characterPaths';
import type { Nutrition } from './fitness';
import type {
  DietPreference,
  InspirationProfileId,
  NutritionTargets,
  TrainingGoal,
} from './plans';
import type { UserProfileV3 } from './profile';
import { CURATED_RECIPES, type RecipeCatalogEntry, type RecipeCategory } from './recipes';
import { S } from './storage';

export const CHARACTER_FOOD_PLAN_STORAGE_KEY = 'character_food_plan_v1';
export const CHARACTER_FOOD_PLAN_VERSION = 1 as const;

export type CharacterFoodPlanChoice = 'accepted' | 'own-plan';
export type CharacterMealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface CharacterFoodPlanMeal {
  slot: CharacterMealSlot;
  recipeId: string;
  title: string;
  portions: number;
  nutrition: Nutrition;
}

export interface CharacterFoodPlan {
  version: typeof CHARACTER_FOOD_PLAN_VERSION;
  characterId: InspirationProfileId;
  characterName: string;
  title: string;
  focus: string;
  targetCalories: number;
  targetProtein: number;
  meals: CharacterFoodPlanMeal[];
  plannedNutrition: Nutrition;
  generatedAt: string;
}

export interface StoredCharacterFoodPlan {
  choice: CharacterFoodPlanChoice;
  selectedAt: string;
  plan: CharacterFoodPlan;
}

interface CharacterFoodStyle {
  title: { de: string; en: string };
  focus: { de: string; en: string };
  proteinWeight: number;
  carbWeight: number;
  energyWeight: number;
  lowerSugarWeight: number;
}

const STYLES: Record<InspirationProfileId, CharacterFoodStyle> = {
  toji: {
    title: { de: 'Functional Fuel Protocol', en: 'Functional Fuel Protocol' },
    focus: {
      de: 'Proteinbetonte, sättigende Mahlzeiten mit Kohlenhydraten rund um harte Einheiten.',
      en: 'Protein-forward, filling meals with carbohydrates placed around hard sessions.',
    },
    proteinWeight: 8,
    carbWeight: 2,
    energyWeight: 1,
    lowerSugarWeight: 3,
  },
  goku: {
    title: { de: 'Limitless Growth Protocol', en: 'Limitless Growth Protocol' },
    focus: {
      de: 'Kalorien- und kohlenhydratstarke Mahlzeiten für den berechneten kontrollierten Überschuss.',
      en: 'Energy- and carbohydrate-rich meals for the calculated controlled surplus.',
    },
    proteinWeight: 5,
    carbWeight: 6,
    energyWeight: 5,
    lowerSugarWeight: 1,
  },
  tanjiro: {
    title: { de: 'Steady Balance Protocol', en: 'Steady Balance Protocol' },
    focus: {
      de: 'Ausgewogene Energie, verlässliches Protein und gut wiederholbare Mahlzeiten.',
      en: 'Balanced energy, reliable protein, and repeatable everyday meals.',
    },
    proteinWeight: 6,
    carbWeight: 4,
    energyWeight: 2,
    lowerSugarWeight: 2,
  },
  kaneki: {
    title: { de: 'Adaptive Control Protocol', en: 'Adaptive Control Protocol' },
    focus: {
      de: 'Einfache proteinreiche Mahlzeiten, die sich an Training und Alltag anpassen lassen.',
      en: 'Simple high-protein meals that can adapt to training and daily life.',
    },
    proteinWeight: 7,
    carbWeight: 3,
    energyWeight: 2,
    lowerSugarWeight: 2,
  },
  sanji: {
    title: { de: 'Precision Performance Protocol', en: 'Precision Performance Protocol' },
    focus: {
      de: 'Ausgewogene Protein- und Kohlenhydratquellen für Beinkraft, Fußarbeit und Erholung.',
      en: 'Balanced protein and carbohydrate sources for leg power, footwork, and recovery.',
    },
    proteinWeight: 6,
    carbWeight: 5,
    energyWeight: 2,
    lowerSugarWeight: 2,
  },
  baki: {
    title: { de: 'Total Strength Protocol', en: 'Total Strength Protocol' },
    focus: {
      de: 'Kräftige Hauptmahlzeiten mit hohem Proteinanteil für den berechneten Kraftaufbau.',
      en: 'Substantial main meals with high protein for the calculated strength target.',
    },
    proteinWeight: 7,
    carbWeight: 4,
    energyWeight: 4,
    lowerSugarWeight: 1,
  },
  mikasa: {
    title: { de: 'Tactical Endurance Protocol', en: 'Tactical Endurance Protocol' },
    focus: {
      de: 'Leistungsfähige, ausgewogene Mahlzeiten für wiederholbare Ganzkörperarbeit.',
      en: 'Performance-oriented balanced meals for repeatable full-body work.',
    },
    proteinWeight: 6,
    carbWeight: 5,
    energyWeight: 2,
    lowerSugarWeight: 2,
  },
};

const SLOT_SHARE: Record<CharacterMealSlot, number> = {
  breakfast: 0.24,
  lunch: 0.29,
  snack: 0.17,
  dinner: 0.30,
};

const SLOT_CATEGORIES: Record<CharacterMealSlot, RecipeCategory[]> = {
  breakfast: ['breakfast'],
  lunch: ['main'],
  snack: ['snack', 'dessert'],
  dinner: ['main'],
};

function localized(value: { de: string; en: string }, language: 'de' | 'en'): string {
  return value[language];
}

function compatibleWithDiet(recipe: RecipeCatalogEntry, diet: DietPreference): boolean {
  if (diet === 'flexible') return true;
  return !recipe.diets?.length || recipe.diets.includes(diet);
}

function recipeTitle(recipe: RecipeCatalogEntry, language: 'de' | 'en'): string {
  return language === 'en' ? recipe.locales?.en?.title || recipe.title : recipe.title;
}

function characterScore(
  recipe: RecipeCatalogEntry,
  style: CharacterFoodStyle,
  goal: TrainingGoal,
  targetCalories: number,
): number {
  const nutrition = recipe.nutritionPerServing;
  const proteinDensity = nutrition.kcal > 0 ? nutrition.protein / nutrition.kcal * 100 : 0;
  const carbDensity = nutrition.kcal > 0 ? nutrition.carbs / nutrition.kcal * 100 : 0;
  const energyFit = Math.max(0, 1 - Math.abs(nutrition.kcal - targetCalories) / Math.max(1, targetCalories));
  const sugarRatio = nutrition.carbs > 0 ? nutrition.sugar / nutrition.carbs : 0;
  return proteinDensity * style.proteinWeight
    + carbDensity * style.carbWeight
    + energyFit * 100 * style.energyWeight
    + (1 - Math.min(1, sugarRatio)) * 25 * style.lowerSugarWeight
    + (recipe.goals?.includes(goal) ? 140 : 0);
}

function roundPortions(value: number): number {
  return Math.max(0.5, Math.min(2.5, Math.round(value * 2) / 2));
}

function scaledNutrition(recipe: RecipeCatalogEntry, portions: number): Nutrition {
  const value = recipe.nutritionPerServing;
  return {
    kcal: Math.round(value.kcal * portions),
    prot: Math.round(value.protein * portions * 10) / 10,
    carb: Math.round(value.carbs * portions * 10) / 10,
    fat: Math.round(value.fat * portions * 10) / 10,
    sug: Math.round(value.sugar * portions * 10) / 10,
  };
}

function sumNutrition(meals: CharacterFoodPlanMeal[]): Nutrition {
  return meals.reduce<Nutrition>((total, meal) => ({
    kcal: total.kcal + meal.nutrition.kcal,
    prot: Math.round((total.prot + meal.nutrition.prot) * 10) / 10,
    carb: Math.round((total.carb + meal.nutrition.carb) * 10) / 10,
    fat: Math.round((total.fat + meal.nutrition.fat) * 10) / 10,
    sug: Math.round((total.sug + meal.nutrition.sug) * 10) / 10,
  }), { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 });
}

export function buildCharacterFoodPlan(
  characterId: InspirationProfileId,
  profile: Pick<UserProfileV3, 'diet' | 'goal'>,
  targets: NutritionTargets,
  language: 'de' | 'en' = 'en',
  generatedAt = new Date().toISOString(),
): CharacterFoodPlan {
  const character = getCharacterPath(characterId);
  const style = STYLES[characterId];
  const used = new Set<string>();
  const slots: CharacterMealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
  const meals = slots.map((slot): CharacterFoodPlanMeal => {
    const targetCalories = targets.calories * SLOT_SHARE[slot];
    const preferred = CURATED_RECIPES
      .filter(recipe => SLOT_CATEGORIES[slot].includes(recipe.category))
      .filter(recipe => compatibleWithDiet(recipe, profile.diet))
      .filter(recipe => !used.has(recipe.id))
      .sort((left, right) => characterScore(right, style, profile.goal, targetCalories)
        - characterScore(left, style, profile.goal, targetCalories));
    const fallback = CURATED_RECIPES
      .filter(recipe => compatibleWithDiet(recipe, profile.diet))
      .filter(recipe => !used.has(recipe.id));
    const recipe = preferred[0] || fallback[0] || CURATED_RECIPES[0];
    used.add(recipe.id);
    const portions = roundPortions(targetCalories / Math.max(1, recipe.nutritionPerServing.kcal));
    return {
      slot,
      recipeId: recipe.id,
      title: recipeTitle(recipe, language),
      portions,
      nutrition: scaledNutrition(recipe, portions),
    };
  });

  return {
    version: CHARACTER_FOOD_PLAN_VERSION,
    characterId,
    characterName: character?.name || characterId,
    title: localized(style.title, language),
    focus: localized(style.focus, language),
    targetCalories: targets.calories,
    targetProtein: targets.protein,
    meals,
    plannedNutrition: sumNutrition(meals),
    generatedAt,
  };
}

export function saveCharacterFoodPlanChoice(
  plan: CharacterFoodPlan,
  choice: CharacterFoodPlanChoice,
  selectedAt = new Date().toISOString(),
): StoredCharacterFoodPlan {
  const stored = { plan, choice, selectedAt } satisfies StoredCharacterFoodPlan;
  S.set(CHARACTER_FOOD_PLAN_STORAGE_KEY, stored);
  return stored;
}

export function loadCharacterFoodPlanChoice(): StoredCharacterFoodPlan | null {
  const value = S.get<StoredCharacterFoodPlan>(CHARACTER_FOOD_PLAN_STORAGE_KEY);
  if (!value || !['accepted', 'own-plan'].includes(value.choice)) return null;
  if (!value.plan || value.plan.version !== CHARACTER_FOOD_PLAN_VERSION) return null;
  if (!STYLES[value.plan.characterId]) return null;
  return value;
}
