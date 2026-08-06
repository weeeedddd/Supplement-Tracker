export const RECIPE_CATALOG_VERSION = 1 as const;

export type RecipeCategory = 'breakfast' | 'main' | 'dessert' | 'snack';
export type RecipeEquipment = 'none' | 'airfryer' | 'ricecooker' | 'stovetop' | 'oven' | 'blender';

export interface RecipeNutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
}

export interface RecipeIngredient {
  amount: number | string;
  unit: string;
  item: string;
}

export interface RecipeTranslation {
  title: string;
  ingredients?: string[];
  steps?: string[];
}

export interface RecipeCatalogEntry {
  id: string;
  title: string;
  category: RecipeCategory;
  servings: number;
  prepMinutes: number;
  nutritionPerServing: RecipeNutrition;
  ingredients: RecipeIngredient[];
  steps: string[];
  equipment: RecipeEquipment[];
  icon: string;
  image?: string;
  locales?: Record<string, RecipeTranslation>;
  provenance: {
    source: string;
    sourceUrl?: string;
    reviewedAt?: string;
  };
}

export interface RecipeCatalogPayload {
  version: typeof RECIPE_CATALOG_VERSION;
  recipes: RecipeCatalogEntry[];
}

export interface RejectedRecipe {
  index: number;
  id?: string;
  reasons: string[];
}

export interface RecipeImportResult {
  accepted: RecipeCatalogEntry[];
  rejected: RejectedRecipe[];
}

export interface RecipeDishSeed {
  id: string;
  name: string;
  category: RecipeCategory;
  ingredients: string[];
  steps: string[];
  prep_min: number;
  kcal: number;
  prot: number;
  carb: number;
  fat: number;
  sug: number;
  equipment: RecipeEquipment[];
  icon: string;
  image?: string;
  is_preset: true;
  i18n?: Record<string, { name: string; ingredients: string[]; steps: string[] }>;
}

const CATEGORIES = new Set<RecipeCategory>(['breakfast', 'main', 'dessert', 'snack']);
const EQUIPMENT = new Set<RecipeEquipment>(['none', 'airfryer', 'ricecooker', 'stovetop', 'oven', 'blender']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateRecipeCandidate(value: unknown): string[] {
  if (!isRecord(value)) return ['recipe-not-object'];
  const reasons: string[] = [];
  if (typeof value.id !== 'string' || !value.id.trim()) reasons.push('missing-id');
  if (typeof value.title !== 'string' || !value.title.trim()) reasons.push('missing-title');
  if (typeof value.category !== 'string' || !CATEGORIES.has(value.category as RecipeCategory)) reasons.push('invalid-category');
  if (!Number.isInteger(value.servings) || Number(value.servings) <= 0) reasons.push('invalid-servings');
  if (!finiteNonNegative(value.prepMinutes) || value.prepMinutes <= 0) reasons.push('invalid-prep-time');

  const nutrition = value.nutritionPerServing;
  if (!isRecord(nutrition)) {
    reasons.push('missing-nutrition');
  } else {
    for (const key of ['kcal', 'protein', 'carbs', 'fat', 'sugar'] as const) {
      if (!finiteNonNegative(nutrition[key])) reasons.push(`invalid-${key}`);
    }
    if (finiteNonNegative(nutrition.sugar) && finiteNonNegative(nutrition.carbs) && nutrition.sugar > nutrition.carbs) {
      reasons.push('sugar-exceeds-carbs');
    }
  }

  if (!Array.isArray(value.ingredients) || value.ingredients.length < 2) {
    reasons.push('insufficient-ingredients');
  } else if (value.ingredients.some(ingredient => !isRecord(ingredient)
    || !['number', 'string'].includes(typeof ingredient.amount)
    || typeof ingredient.unit !== 'string'
    || typeof ingredient.item !== 'string'
    || !ingredient.item.trim())) {
    reasons.push('invalid-ingredient');
  }

  if (!Array.isArray(value.steps) || value.steps.length < 2
    || value.steps.some(step => typeof step !== 'string' || !step.trim())) reasons.push('invalid-steps');
  if (!Array.isArray(value.equipment) || !value.equipment.length
    || value.equipment.some(item => typeof item !== 'string' || !EQUIPMENT.has(item as RecipeEquipment))) reasons.push('invalid-equipment');
  if (typeof value.icon !== 'string' || !value.icon.trim()) reasons.push('missing-icon');
  if (!isRecord(value.provenance) || typeof value.provenance.source !== 'string' || !value.provenance.source.trim()) {
    reasons.push('missing-provenance');
  }
  return reasons;
}

export function importRecipeCatalog(payload: unknown): RecipeImportResult {
  if (!isRecord(payload) || payload.version !== RECIPE_CATALOG_VERSION || !Array.isArray(payload.recipes)) {
    return { accepted: [], rejected: [{ index: -1, reasons: ['invalid-catalog-envelope'] }] };
  }

  const accepted: RecipeCatalogEntry[] = [];
  const rejected: RejectedRecipe[] = [];
  const seen = new Set<string>();
  payload.recipes.forEach((candidate, index) => {
    const reasons = validateRecipeCandidate(candidate);
    const id = isRecord(candidate) && typeof candidate.id === 'string' ? candidate.id.trim() : undefined;
    if (id && seen.has(id)) reasons.push('duplicate-id');
    if (reasons.length) {
      rejected.push({ index, id, reasons });
      return;
    }
    seen.add(id!);
    accepted.push(candidate as unknown as RecipeCatalogEntry);
  });
  return { accepted, rejected };
}

function formatIngredient(ingredient: RecipeIngredient): string {
  const unit = ingredient.unit.trim();
  const amount = String(ingredient.amount).trim();
  return [amount, unit, ingredient.item.trim()].filter(Boolean).join(' ');
}

export function recipeToDish(recipe: RecipeCatalogEntry): RecipeDishSeed {
  const nutrition = recipe.nutritionPerServing;
  const i18n = recipe.locales
    ? Object.fromEntries(Object.entries(recipe.locales).map(([locale, translation]) => [locale, {
      name: translation.title,
      ingredients: translation.ingredients || recipe.ingredients.map(formatIngredient),
      steps: translation.steps || recipe.steps,
    }]))
    : undefined;
  return {
    id: recipe.id,
    name: recipe.title,
    category: recipe.category,
    ingredients: recipe.ingredients.map(formatIngredient),
    steps: [...recipe.steps],
    prep_min: recipe.prepMinutes,
    kcal: nutrition.kcal,
    prot: nutrition.protein,
    carb: nutrition.carbs,
    fat: nutrition.fat,
    sug: nutrition.sugar,
    equipment: [...recipe.equipment],
    icon: recipe.icon,
    image: recipe.image,
    is_preset: true,
    i18n,
  };
}

export const CURATED_RECIPES: RecipeCatalogEntry[] = [
  {
    id: 'curated-protein-overnight-oats',
    title: 'Protein Overnight Oats',
    category: 'breakfast',
    servings: 1,
    prepMinutes: 10,
    nutritionPerServing: { kcal: 442, protein: 33, carbs: 55, fat: 10, sugar: 14 },
    ingredients: [
      { amount: 60, unit: 'g', item: 'Haferflocken' },
      { amount: 200, unit: 'g', item: 'Skyr natur' },
      { amount: 120, unit: 'ml', item: 'Milch' },
      { amount: 100, unit: 'g', item: 'Beeren' },
      { amount: 10, unit: 'g', item: 'Chiasamen' },
    ],
    steps: ['Alle Zutaten in einem verschließbaren Glas verrühren.', 'Mindestens vier Stunden kalt stellen und vor dem Essen nochmals umrühren.'],
    equipment: ['none'],
    icon: '🥣',
    locales: { en: { title: 'Protein overnight oats', steps: ['Mix all ingredients in a lidded jar.', 'Chill for at least four hours and stir before eating.'] } },
    provenance: { source: 'curated-app-sample', reviewedAt: '2026-08-05' },
  },
  {
    id: 'curated-chicken-rice-bowl',
    title: 'Hähnchen-Reis-Bowl',
    category: 'main',
    servings: 1,
    prepMinutes: 30,
    nutritionPerServing: { kcal: 607, protein: 48, carbs: 70, fat: 15, sugar: 8 },
    ingredients: [
      { amount: 160, unit: 'g', item: 'Hähnchenbrust' },
      { amount: 80, unit: 'g', item: 'Reis, trocken' },
      { amount: 200, unit: 'g', item: 'gemischtes Gemüse' },
      { amount: 10, unit: 'g', item: 'Olivenöl' },
      { amount: 1, unit: 'TL', item: 'Paprikapulver' },
    ],
    steps: ['Reis garen und das Gemüse bissfest dünsten.', 'Hähnchen würzen, vollständig durchgaren und mit Reis und Gemüse anrichten.'],
    equipment: ['stovetop'],
    icon: '🍚',
    locales: { en: { title: 'Chicken rice bowl', steps: ['Cook the rice and steam the vegetables until tender.', 'Season and fully cook the chicken, then serve with rice and vegetables.'] } },
    provenance: { source: 'curated-app-sample', reviewedAt: '2026-08-05' },
  },
  {
    id: 'curated-lentil-tomato-pot',
    title: 'Linsen-Tomaten-Topf',
    category: 'main',
    servings: 2,
    prepMinutes: 35,
    nutritionPerServing: { kcal: 520, protein: 25, carbs: 78, fat: 12, sugar: 14 },
    ingredients: [
      { amount: 160, unit: 'g', item: 'rote Linsen, trocken' },
      { amount: 400, unit: 'g', item: 'gehackte Tomaten' },
      { amount: 1, unit: 'Stück', item: 'Zwiebel' },
      { amount: 200, unit: 'g', item: 'Karotten' },
      { amount: 15, unit: 'g', item: 'Olivenöl' },
    ],
    steps: ['Zwiebel und Karotten im Öl anschwitzen, dann Linsen und Tomaten zugeben.', 'Mit Wasser bedecken und köcheln lassen, bis die Linsen weich sind.'],
    equipment: ['stovetop'],
    icon: '🥘',
    locales: { en: { title: 'Lentil tomato pot', steps: ['Soften onion and carrots in oil, then add lentils and tomatoes.', 'Cover with water and simmer until the lentils are tender.'] } },
    provenance: { source: 'curated-app-sample', reviewedAt: '2026-08-05' },
  },
  {
    id: 'curated-skyr-berry-bowl',
    title: 'Skyr-Beeren-Bowl',
    category: 'snack',
    servings: 1,
    prepMinutes: 5,
    nutritionPerServing: { kcal: 367, protein: 31, carbs: 45, fat: 7, sugar: 22 },
    ingredients: [
      { amount: 300, unit: 'g', item: 'Skyr natur' },
      { amount: 150, unit: 'g', item: 'Beeren' },
      { amount: 30, unit: 'g', item: 'Haferflocken' },
      { amount: 15, unit: 'g', item: 'Mandeln' },
    ],
    steps: ['Skyr glatt rühren und mit Beeren und Haferflocken anrichten.', 'Mandeln grob hacken und direkt vor dem Essen darübergeben.'],
    equipment: ['none'],
    icon: '🫐',
    locales: { en: { title: 'Skyr berry bowl', steps: ['Stir the skyr until smooth and top with berries and oats.', 'Roughly chop the almonds and add immediately before eating.'] } },
    provenance: { source: 'curated-app-sample', reviewedAt: '2026-08-05' },
  },
];
