import type { DietPreference, TrainingGoal } from './plans';

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
  goals?: TrainingGoal[];
  diets?: DietPreference[];
  nutritionBasis?: string;
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
  servings: number;
  goals?: TrainingGoal[];
  diets?: DietPreference[];
  nutritionBasis?: string;
  is_preset: true;
  i18n?: Record<string, { name: string; ingredients: string[]; steps: string[] }>;
}

const CATEGORIES = new Set<RecipeCategory>(['breakfast', 'main', 'dessert', 'snack']);
const EQUIPMENT = new Set<RecipeEquipment>(['none', 'airfryer', 'ricecooker', 'stovetop', 'oven', 'blender']);
const GOALS = new Set<TrainingGoal>(['general_fitness', 'build_muscle', 'get_stronger', 'fat_loss']);
const DIETS = new Set<DietPreference>(['flexible', 'omnivore', 'vegetarian', 'vegan']);

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
  if (value.goals !== undefined && (!Array.isArray(value.goals)
    || value.goals.some(goal => typeof goal !== 'string' || !GOALS.has(goal as TrainingGoal)))) reasons.push('invalid-goals');
  if (value.diets !== undefined && (!Array.isArray(value.diets)
    || value.diets.some(diet => typeof diet !== 'string' || !DIETS.has(diet as DietPreference)))) reasons.push('invalid-diets');
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
    servings: recipe.servings,
    goals: recipe.goals ? [...recipe.goals] : undefined,
    diets: recipe.diets ? [...recipe.diets] : undefined,
    nutritionBasis: recipe.nutritionBasis,
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
    icon: 'food',
    goals: ['build_muscle', 'get_stronger', 'general_fitness'],
    diets: ['flexible', 'omnivore', 'vegetarian'],
    nutritionBasis: 'Per serving; calculated from the listed edible ingredient quantities.',
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
    icon: 'food',
    goals: ['build_muscle', 'get_stronger', 'general_fitness'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated from dry rice and raw chicken quantities.',
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
    icon: 'food',
    goals: ['general_fitness', 'get_stronger'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; total recipe divided into two equal portions.',
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
    icon: 'food',
    goals: ['fat_loss', 'general_fitness', 'build_muscle'],
    diets: ['flexible', 'omnivore', 'vegetarian'],
    nutritionBasis: 'Per serving; calculated from plain skyr, berries, oats, and almonds.',
    locales: { en: { title: 'Skyr berry bowl', steps: ['Stir the skyr until smooth and top with berries and oats.', 'Roughly chop the almonds and add immediately before eating.'] } },
    provenance: { source: 'curated-app-sample', reviewedAt: '2026-08-05' },
  },
  {
    id: 'curated-turkey-couscous-bowl',
    title: 'Puten-Couscous-Bowl',
    category: 'main',
    servings: 1,
    prepMinutes: 25,
    nutritionPerServing: { kcal: 546, protein: 50, carbs: 55, fat: 14, sugar: 9 },
    ingredients: [
      { amount: 160, unit: 'g', item: 'Putenbrust' },
      { amount: 65, unit: 'g', item: 'Couscous, trocken' },
      { amount: 200, unit: 'g', item: 'Paprika und Zucchini' },
      { amount: 8, unit: 'g', item: 'Olivenöl' },
      { amount: 50, unit: 'g', item: 'Joghurt natur' },
    ],
    steps: ['Couscous nach Packungsangabe quellen lassen und das Gemüse anbraten.', 'Pute vollständig durchgaren, alles anrichten und mit Joghurt servieren.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['build_muscle', 'fat_loss', 'get_stronger'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated from raw turkey and dry couscous quantities.',
    locales: { en: { title: 'Turkey couscous bowl', steps: ['Prepare the couscous as directed and sauté the vegetables.', 'Cook the turkey through, assemble everything, and serve with yogurt.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-salmon-potato-greens',
    title: 'Lachs mit Kartoffeln & Grünzeug',
    category: 'main',
    servings: 1,
    prepMinutes: 32,
    nutritionPerServing: { kcal: 590, protein: 41, carbs: 57, fat: 22, sugar: 7 },
    ingredients: [
      { amount: 160, unit: 'g', item: 'Lachsfilet' },
      { amount: 250, unit: 'g', item: 'Kartoffeln' },
      { amount: 200, unit: 'g', item: 'Brokkoli oder grüne Bohnen' },
      { amount: 1, unit: 'TL', item: 'Zitronensaft und Kräuter' },
    ],
    steps: ['Kartoffeln garen und das Gemüse bissfest dämpfen.', 'Lachs vollständig garen und mit Zitrone, Kräutern, Kartoffeln und Gemüse servieren.'],
    equipment: ['stovetop', 'oven'],
    icon: 'food',
    goals: ['general_fitness', 'build_muscle', 'get_stronger'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated from raw salmon and edible cooked side portions.',
    locales: { en: { title: 'Salmon with potatoes and greens', steps: ['Cook the potatoes and steam the greens until tender.', 'Cook the salmon through and serve with lemon, herbs, potatoes, and greens.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-tofu-edamame-rice',
    title: 'Tofu-Edamame-Reis-Bowl',
    category: 'main',
    servings: 1,
    prepMinutes: 28,
    nutritionPerServing: { kcal: 652, protein: 42, carbs: 76, fat: 20, sugar: 10 },
    ingredients: [
      { amount: 180, unit: 'g', item: 'Naturtofu' },
      { amount: 120, unit: 'g', item: 'Edamame, gegart' },
      { amount: 160, unit: 'g', item: 'Reis, gegart' },
      { amount: 200, unit: 'g', item: 'gemischtes Gemüse' },
      { amount: 10, unit: 'ml', item: 'Sojasauce' },
    ],
    steps: ['Tofu trocken tupfen, würfeln und rundum anbraten.', 'Mit Reis, Edamame und Gemüse anrichten und sparsam mit Sojasauce würzen.'],
    equipment: ['stovetop', 'ricecooker'],
    icon: 'food',
    goals: ['build_muscle', 'get_stronger', 'general_fitness'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; calculated from cooked rice and shelled cooked edamame.',
    locales: { en: { title: 'Tofu edamame rice bowl', steps: ['Pat the tofu dry, cube it, and brown on all sides.', 'Serve with rice, edamame, and vegetables, seasoning lightly with soy sauce.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-seitan-lentil-chili',
    title: 'Seitan-Linsen-Chili',
    category: 'main',
    servings: 2,
    prepMinutes: 35,
    nutritionPerServing: { kcal: 539, protein: 42, carbs: 68, fat: 11, sugar: 13 },
    ingredients: [
      { amount: 240, unit: 'g', item: 'Seitan' },
      { amount: 300, unit: 'g', item: 'Linsen, gegart' },
      { amount: 400, unit: 'g', item: 'gehackte Tomaten' },
      { amount: 200, unit: 'g', item: 'Kidneybohnen, abgespült' },
      { amount: 10, unit: 'g', item: 'Olivenöl' },
    ],
    steps: ['Seitan im Öl anbraten, dann Tomaten, Linsen und Bohnen zugeben.', 'Würzen, 15 Minuten köcheln lassen und in zwei gleich große Portionen teilen.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['build_muscle', 'fat_loss', 'get_stronger'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; total recipe divided into two equal portions.',
    locales: { en: { title: 'Seitan lentil chili', steps: ['Brown the seitan in the oil, then add tomatoes, lentils, and beans.', 'Season, simmer for 15 minutes, and divide into two equal servings.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-egg-white-cottage-omelette',
    title: 'Eiklar-Hüttenkäse-Omelett',
    category: 'breakfast',
    servings: 1,
    prepMinutes: 15,
    nutritionPerServing: { kcal: 360, protein: 43, carbs: 20, fat: 12, sugar: 9 },
    ingredients: [
      { amount: 200, unit: 'g', item: 'Eiklar' },
      { amount: 150, unit: 'g', item: 'Hüttenkäse' },
      { amount: 200, unit: 'g', item: 'Tomate, Spinat und Champignons' },
      { amount: 5, unit: 'g', item: 'Olivenöl' },
    ],
    steps: ['Gemüse im Öl kurz anbraten und Eiklar darübergießen.', 'Stocken lassen, Hüttenkäse zugeben und vollständig durchgaren.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['fat_loss', 'general_fitness', 'build_muscle'],
    diets: ['flexible', 'omnivore', 'vegetarian'],
    nutritionBasis: 'Per serving; calculated from weighed liquid egg white and cottage cheese.',
    locales: { en: { title: 'Egg-white cottage cheese omelette', steps: ['Briefly sauté the vegetables in the oil and pour over the egg whites.', 'Let it set, add the cottage cheese, and cook through.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-tuna-bean-wrap',
    title: 'Thunfisch-Bohnen-Wrap',
    category: 'main',
    servings: 1,
    prepMinutes: 12,
    nutritionPerServing: { kcal: 513, protein: 45, carbs: 54, fat: 13, sugar: 7 },
    ingredients: [
      { amount: 1, unit: 'Stück', item: 'Vollkorn-Wrap' },
      { amount: 130, unit: 'g', item: 'Thunfisch in Wasser, abgetropft' },
      { amount: 100, unit: 'g', item: 'Kidneybohnen, abgespült' },
      { amount: 80, unit: 'g', item: 'Salat und Tomate' },
      { amount: 50, unit: 'g', item: 'Joghurt natur' },
    ],
    steps: ['Thunfisch, Bohnen, Gemüse und Joghurt vermengen.', 'Auf dem Wrap verteilen, fest einrollen und direkt servieren.'],
    equipment: ['none'],
    icon: 'food',
    goals: ['fat_loss', 'build_muscle', 'general_fitness'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated using one 70 g wholegrain wrap and drained tuna.',
    locales: { en: { title: 'Tuna bean wrap', steps: ['Mix the tuna, beans, vegetables, and yogurt.', 'Spread over the wrap, roll tightly, and serve.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-turkey-protein-pasta',
    title: 'Protein-Pasta mit Pute',
    category: 'main',
    servings: 1,
    prepMinutes: 30,
    nutritionPerServing: { kcal: 646, protein: 55, carbs: 75, fat: 14, sugar: 12 },
    ingredients: [
      { amount: 170, unit: 'g', item: 'Putenbrust' },
      { amount: 90, unit: 'g', item: 'Protein-Pasta, trocken' },
      { amount: 250, unit: 'g', item: 'passierte Tomaten' },
      { amount: 150, unit: 'g', item: 'Zucchini' },
      { amount: 5, unit: 'g', item: 'Olivenöl' },
    ],
    steps: ['Pasta garen und die Pute im Öl vollständig durchbraten.', 'Zucchini und Tomaten zugeben, kurz köcheln lassen und mit der Pasta mischen.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['build_muscle', 'get_stronger'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated from dry pasta and raw turkey quantities.',
    locales: { en: { title: 'Turkey protein pasta', steps: ['Cook the pasta and fully cook the turkey in the oil.', 'Add zucchini and tomatoes, simmer briefly, and combine with the pasta.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-chocolate-skyr-mousse',
    title: 'Schoko-Skyr-Mousse',
    category: 'dessert',
    servings: 1,
    prepMinutes: 7,
    nutritionPerServing: { kcal: 319, protein: 35, carbs: 38, fat: 3, sugar: 24 },
    ingredients: [
      { amount: 250, unit: 'g', item: 'Skyr natur' },
      { amount: 100, unit: 'g', item: 'Banane' },
      { amount: 10, unit: 'g', item: 'Backkakao' },
      { amount: 5, unit: 'g', item: 'dunkle Schokolade, geraspelt' },
    ],
    steps: ['Skyr, Banane und Kakao cremig pürieren oder kräftig verrühren.', 'Mit Schokoladenraspeln bestreuen und kalt servieren.'],
    equipment: ['blender'],
    icon: 'food',
    goals: ['fat_loss', 'general_fitness', 'build_muscle'],
    diets: ['flexible', 'omnivore', 'vegetarian'],
    nutritionBasis: 'Per serving; sugars include naturally occurring milk and fruit sugar.',
    locales: { en: { title: 'Chocolate skyr mousse', steps: ['Blend or vigorously mix the skyr, banana, and cocoa until creamy.', 'Top with grated chocolate and serve chilled.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-chicken-quinoa-salad',
    title: 'Hähnchen-Quinoa-Salat',
    category: 'main',
    servings: 1,
    prepMinutes: 28,
    nutritionPerServing: { kcal: 568, protein: 50, carbs: 56, fat: 16, sugar: 8 },
    ingredients: [
      { amount: 160, unit: 'g', item: 'Hähnchenbrust' },
      { amount: 55, unit: 'g', item: 'Quinoa, trocken' },
      { amount: 200, unit: 'g', item: 'Gurke, Tomate und Blattsalat' },
      { amount: 8, unit: 'g', item: 'Olivenöl' },
      { amount: 1, unit: 'EL', item: 'Zitronensaft' },
    ],
    steps: ['Quinoa garen und abkühlen lassen; Hähnchen vollständig durchgaren.', 'Mit Gemüse, Öl und Zitrone vermengen und das Hähnchen darauf anrichten.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['fat_loss', 'build_muscle', 'general_fitness'],
    diets: ['flexible', 'omnivore'],
    nutritionBasis: 'Per serving; calculated from dry quinoa and raw chicken quantities.',
    locales: { en: { title: 'Chicken quinoa salad', steps: ['Cook and cool the quinoa; cook the chicken through.', 'Toss with the vegetables, oil, and lemon, then top with chicken.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-tempeh-noodle-stir-fry',
    title: 'Tempeh-Nudel-Pfanne',
    category: 'main',
    servings: 1,
    prepMinutes: 25,
    nutritionPerServing: { kcal: 644, protein: 38, carbs: 78, fat: 20, sugar: 12 },
    ingredients: [
      { amount: 150, unit: 'g', item: 'Tempeh' },
      { amount: 200, unit: 'g', item: 'Vollkornnudeln, gegart' },
      { amount: 250, unit: 'g', item: 'Wokgemüse' },
      { amount: 10, unit: 'ml', item: 'Sojasauce' },
      { amount: 5, unit: 'g', item: 'Sesamöl' },
    ],
    steps: ['Tempeh würfeln und im Sesamöl rundum anbraten.', 'Gemüse und Nudeln zugeben, heiß durchschwenken und mit Sojasauce abschmecken.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['build_muscle', 'get_stronger', 'general_fitness'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; calculated from cooked noodles and a weighed tempeh portion.',
    locales: { en: { title: 'Tempeh noodle stir-fry', steps: ['Cube the tempeh and brown it in sesame oil.', 'Add vegetables and noodles, toss over high heat, and season with soy sauce.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-vegan-protein-oats',
    title: 'Vegane Protein-Oats',
    category: 'breakfast',
    servings: 1,
    prepMinutes: 8,
    nutritionPerServing: { kcal: 508, protein: 40, carbs: 60, fat: 12, sugar: 13 },
    ingredients: [
      { amount: 60, unit: 'g', item: 'Haferflocken' },
      { amount: 30, unit: 'g', item: 'veganes Proteinpulver' },
      { amount: 250, unit: 'ml', item: 'Sojadrink, ungesüßt' },
      { amount: 100, unit: 'g', item: 'Beeren' },
      { amount: 10, unit: 'g', item: 'Chiasamen' },
    ],
    steps: ['Haferflocken, Sojadrink und Chiasamen verrühren und weich quellen lassen.', 'Proteinpulver sorgfältig einrühren und mit den Beeren servieren.'],
    equipment: ['none'],
    icon: 'food',
    goals: ['build_muscle', 'get_stronger', 'general_fitness'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; calculated from unsweetened soy drink and the listed dry quantities.',
    locales: { en: { title: 'Vegan protein oats', steps: ['Mix the oats, soy drink, and chia seeds and let them soften.', 'Stir in the protein powder thoroughly and serve with the berries.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
  {
    id: 'curated-tofu-breakfast-wrap',
    title: 'Tofu-Frühstücks-Wrap',
    category: 'breakfast',
    servings: 1,
    prepMinutes: 18,
    nutritionPerServing: { kcal: 503, protein: 33, carbs: 50, fat: 19, sugar: 8 },
    ingredients: [
      { amount: 150, unit: 'g', item: 'Naturtofu' },
      { amount: 1, unit: 'Stück', item: 'Vollkorn-Wrap' },
      { amount: 150, unit: 'g', item: 'Paprika, Spinat und Tomate' },
      { amount: 10, unit: 'g', item: 'Hefeflocken' },
      { amount: 1, unit: 'TL', item: 'Rapsöl' },
    ],
    steps: ['Tofu zerbröseln, im Öl anbraten und Gemüse sowie Hefeflocken zugeben.', 'Die Mischung auf dem Wrap verteilen, fest einrollen und warm servieren.'],
    equipment: ['stovetop'],
    icon: 'food',
    goals: ['fat_loss', 'build_muscle', 'general_fitness'],
    diets: ['flexible', 'omnivore', 'vegetarian', 'vegan'],
    nutritionBasis: 'Per serving; calculated using one 70 g wholegrain wrap and weighed tofu.',
    locales: { en: { title: 'Tofu breakfast wrap', steps: ['Crumble and brown the tofu in the oil, then add the vegetables and nutritional yeast.', 'Spread the mixture over the wrap, roll tightly, and serve warm.'] } },
    provenance: { source: 'coreline-curated-v2', reviewedAt: '2026-08-17' },
  },
];
