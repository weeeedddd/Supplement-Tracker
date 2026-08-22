// ═══════════════════════════════════════════════════════════════════
//  ◈ CHARACTER FOOD PLAN — Vorschlag beim Ausrüsten eines Pfads
//  Der Plan ist ein Angebot mit Ablauf: annehmen, ablehnen ("ich habe
//  einen eigenen") oder verfallen lassen. Es wird nichts erzwungen und
//  keine Mahlzeit automatisch geloggt.
// ═══════════════════════════════════════════════════════════════════
import type { CharacterFoodFocus, CharacterPathDefinition } from './characterPaths';
import { CHARACTER_PATHS } from './characterPaths';
import { fetchDishes, locDish, type Dish } from './fitness';
import type { DietPreference, InspirationProfileId, NutritionTargets } from './plans';
import { S } from './storage';

export const FOOD_PLAN_OFFER_STORAGE_KEY = 'character_food_plan_offer_v1';
export const FOOD_PLAN_STORAGE_KEY = 'character_food_plan_v1';
export const FOOD_PLAN_UPDATED_EVENT = 'coreline:food-plan-updated';

/** An offer stays acceptable for one day; after that it lapses silently. */
export const FOOD_PLAN_OFFER_WINDOW_MS = 24 * 60 * 60 * 1000;

export type FoodPlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodPlanDecision = 'pending' | 'accepted' | 'declined';

export const FOOD_PLAN_SLOTS: readonly FoodPlanSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Share of the daily calorie target each slot aims for. */
const SLOT_SHARE: Record<FoodPlanSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

const SLOT_CATEGORIES: Record<FoodPlanSlot, string[]> = {
  breakfast: ['breakfast'],
  lunch: ['main'],
  dinner: ['main'],
  snack: ['snack', 'dessert'],
};

export interface FoodPlanNutrition {
  kcal: number;
  prot: number;
  carb: number;
  fat: number;
  sug: number;
}

export interface FoodPlanMeal {
  slot: FoodPlanSlot;
  dishId: string;
  portions: number;
  /** Snapshot so an accepted plan still renders if the catalogue changes. */
  name: string;
  icon: string;
  prepMinutes: number;
  nutrition: FoodPlanNutrition;
}

export interface CharacterFoodPlan {
  version: 1;
  pathId: InspirationProfileId;
  createdAt: number;
  meals: FoodPlanMeal[];
  totals: FoodPlanNutrition;
  targets: FoodPlanNutrition;
}

export interface CharacterFoodPlanOffer {
  version: 1;
  pathId: InspirationProfileId;
  offeredAt: number;
  expiresAt: number;
  decision: FoodPlanDecision;
  decidedAt?: number;
  plan: CharacterFoodPlan;
}

const EMPTY_NUTRITION: FoodPlanNutrition = { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 };

function emitFoodPlanUpdate(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FOOD_PLAN_UPDATED_EVENT));
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const round = (value: number): number => Math.round(value);

function isPathId(value: unknown): value is InspirationProfileId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHARACTER_PATHS, value);
}

/** Portion sizes are half steps, so they read as "1½" rather than "1.5". */
export function formatPortions(portions: number): string {
  if (portions === 0.5) return '½';
  if (portions === 1.5) return '1½';
  if (portions === 2.5) return '2½';
  return String(portions);
}

export function formatOfferRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  return hours >= 1 ? `${hours} h ${totalMinutes % 60} min` : `${totalMinutes} min`;
}

/** Half-portion steps keep the suggestion cookable instead of arithmetically exact. */
export function portionsForSlot(dishKcal: number, slotKcal: number): number {
  if (!Number.isFinite(dishKcal) || dishKcal <= 0) return 1;
  const stepped = Math.round((slotKcal / dishKcal) * 2) / 2;
  return clamp(stepped || 0.5, 0.5, 3);
}

function proteinPer100Kcal(dish: Dish): number {
  return dish.kcal > 0 ? (dish.prot / dish.kcal) * 100 : 0;
}

/**
 * Rank a dish for one slot. Only ordering is affected — the calorie and
 * protein numbers always come from the profile targets.
 */
export function scoreDishForPath(dish: Dish, focus: CharacterFoodFocus, slotKcal: number): number {
  const goalRank = focus.preferredGoals.findIndex(goal => dish.goals?.includes(goal));
  let score = goalRank < 0 ? 0 : 90 - goalRank * 18;
  score += proteinPer100Kcal(dish) * 2.5 * focus.proteinBias;
  if (focus.energyBias === 'lean') score += Math.max(0, 14 - dish.kcal / 60);
  if (focus.energyBias === 'surplus') score += Math.min(16, dish.kcal / 45);
  const portions = portionsForSlot(dish.kcal, slotKcal);
  score -= (Math.abs(dish.kcal * portions - slotKcal) / Math.max(1, slotKcal)) * 35;
  if (dish.prep_min <= 15) score += 4;
  return score;
}

function scaleNutritionValues(dish: Dish, portions: number): FoodPlanNutrition {
  const sugar = Number.isFinite(dish.sug) ? Number(dish.sug) : 0;
  return {
    kcal: round(dish.kcal * portions),
    prot: round(dish.prot * portions),
    carb: round(dish.carb * portions),
    fat: round(dish.fat * portions),
    sug: round(sugar * portions),
  };
}

function sumNutrition(meals: FoodPlanMeal[]): FoodPlanNutrition {
  return meals.reduce<FoodPlanNutrition>((total, meal) => ({
    kcal: total.kcal + meal.nutrition.kcal,
    prot: total.prot + meal.nutrition.prot,
    carb: total.carb + meal.nutrition.carb,
    fat: total.fat + meal.nutrition.fat,
    sug: total.sug + meal.nutrition.sug,
  }), { ...EMPTY_NUTRITION });
}

export interface BuildFoodPlanOptions {
  path: CharacterPathDefinition;
  dishes: Dish[];
  targets: Pick<NutritionTargets, 'calories' | 'protein' | 'carbs' | 'fat' | 'sugar'>;
  diet?: DietPreference;
  now?: number;
}

/**
 * Draft one day of meals from the reviewed recipe catalogue. Returns ``null``
 * when no compatible dish exists, so the offer is simply never shown.
 */
export function buildCharacterFoodPlan(options: BuildFoodPlanOptions): CharacterFoodPlan | null {
  const { path, dishes, targets, diet, now = Date.now() } = options;
  const dailyKcal = Math.max(0, Number(targets.calories) || 0);
  if (dailyKcal <= 0) return null;

  const compatible = dishes.filter(dish => (
    Number.isFinite(dish.kcal) && dish.kcal > 0
    && (!diet || !dish.diets?.length || dish.diets.includes(diet))
  ));
  if (!compatible.length) return null;

  const used = new Set<string>();
  const meals: FoodPlanMeal[] = [];

  for (const slot of FOOD_PLAN_SLOTS) {
    const slotKcal = Math.round(dailyKcal * SLOT_SHARE[slot]);
    const categories = SLOT_CATEGORIES[slot];
    const preferred = compatible.filter(dish => categories.includes(dish.category) && !used.has(String(dish.id)));
    const pool = preferred.length ? preferred : compatible.filter(dish => !used.has(String(dish.id)));
    if (!pool.length) continue;

    const best = [...pool].sort((a, b) => {
      const difference = scoreDishForPath(b, path.foodFocus, slotKcal) - scoreDishForPath(a, path.foodFocus, slotKcal);
      return difference || String(a.id).localeCompare(String(b.id));
    })[0];

    const localized = locDish(best);
    const portions = portionsForSlot(best.kcal, slotKcal);
    used.add(String(best.id));
    meals.push({
      slot,
      dishId: String(best.id),
      portions,
      name: localized.name,
      icon: localized.icon || '🍽️',
      prepMinutes: Number.isFinite(best.prep_min) ? best.prep_min : 0,
      nutrition: scaleNutritionValues(best, portions),
    });
  }

  if (!meals.length) return null;

  return {
    version: 1,
    pathId: path.id,
    createdAt: now,
    meals,
    totals: sumNutrition(meals),
    targets: {
      kcal: round(dailyKcal),
      prot: round(Number(targets.protein) || 0),
      carb: round(Number(targets.carbs) || 0),
      fat: round(Number(targets.fat) || 0),
      sug: round(Number(targets.sugar) || 0),
    },
  };
}

// ── Persistenz ───────────────────────────────────────────────────────

function sanitizeNutrition(value: unknown): FoodPlanNutrition | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<FoodPlanNutrition>;
  const read = (input: unknown): number | null => (
    Number.isFinite(input) && Number(input) >= 0 ? Math.round(Number(input)) : null
  );
  const kcal = read(source.kcal);
  const prot = read(source.prot);
  const carb = read(source.carb);
  const fat = read(source.fat);
  const sug = read(source.sug);
  if (kcal === null || prot === null || carb === null || fat === null || sug === null) return null;
  return { kcal, prot, carb, fat, sug };
}

function sanitizeMeal(value: unknown): FoodPlanMeal | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<FoodPlanMeal>;
  const nutrition = sanitizeNutrition(source.nutrition);
  if (
    !nutrition
    || typeof source.slot !== 'string'
    || !FOOD_PLAN_SLOTS.includes(source.slot as FoodPlanSlot)
    || typeof source.dishId !== 'string'
    || typeof source.name !== 'string'
    || !Number.isFinite(source.portions)
  ) return null;
  return {
    slot: source.slot as FoodPlanSlot,
    dishId: source.dishId.slice(0, 120),
    portions: clamp(Number(source.portions), 0.25, 6),
    name: source.name.slice(0, 120),
    icon: typeof source.icon === 'string' ? source.icon.slice(0, 8) : '🍽️',
    prepMinutes: Number.isFinite(source.prepMinutes) ? clamp(Number(source.prepMinutes), 0, 600) : 0,
    nutrition,
  };
}

export function sanitizeFoodPlan(value: unknown): CharacterFoodPlan | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CharacterFoodPlan>;
  if (!isPathId(source.pathId) || !Array.isArray(source.meals)) return null;
  const meals = source.meals.flatMap(meal => {
    const sanitized = sanitizeMeal(meal);
    return sanitized ? [sanitized] : [];
  });
  if (!meals.length) return null;
  const targets = sanitizeNutrition(source.targets) ?? { ...EMPTY_NUTRITION };
  return {
    version: 1,
    pathId: source.pathId,
    createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now(),
    meals,
    totals: sanitizeNutrition(source.totals) ?? sumNutrition(meals),
    targets,
  };
}

function sanitizeOffer(value: unknown): CharacterFoodPlanOffer | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CharacterFoodPlanOffer>;
  const plan = sanitizeFoodPlan(source.plan);
  if (!plan || !isPathId(source.pathId)) return null;
  const offeredAt = Number.isFinite(source.offeredAt) ? Number(source.offeredAt) : plan.createdAt;
  const decision: FoodPlanDecision = source.decision === 'accepted' || source.decision === 'declined'
    ? source.decision
    : 'pending';
  return {
    version: 1,
    pathId: source.pathId,
    offeredAt,
    expiresAt: Number.isFinite(source.expiresAt) ? Number(source.expiresAt) : offeredAt + FOOD_PLAN_OFFER_WINDOW_MS,
    decision,
    decidedAt: Number.isFinite(source.decidedAt) ? Number(source.decidedAt) : undefined,
    plan,
  };
}

export function loadFoodPlanOffer(): CharacterFoodPlanOffer | null {
  return sanitizeOffer(S.get<unknown>(FOOD_PLAN_OFFER_STORAGE_KEY));
}

export function loadActiveFoodPlan(): CharacterFoodPlan | null {
  return sanitizeFoodPlan(S.get<unknown>(FOOD_PLAN_STORAGE_KEY));
}

export function clearActiveFoodPlan(): void {
  S.del(FOOD_PLAN_STORAGE_KEY);
  emitFoodPlanUpdate();
}

/** The offer the user can still act on right now. */
export function pendingFoodPlanOffer(now = Date.now()): CharacterFoodPlanOffer | null {
  const offer = loadFoodPlanOffer();
  if (!offer || offer.decision !== 'pending' || offer.expiresAt <= now) return null;
  return offer;
}

export function foodPlanOfferRemainingMs(offer: CharacterFoodPlanOffer, now = Date.now()): number {
  return Math.max(0, offer.expiresAt - now);
}

export function storeFoodPlanOffer(plan: CharacterFoodPlan, now = Date.now()): CharacterFoodPlanOffer {
  const offer: CharacterFoodPlanOffer = {
    version: 1,
    pathId: plan.pathId,
    offeredAt: now,
    expiresAt: now + FOOD_PLAN_OFFER_WINDOW_MS,
    decision: 'pending',
    plan,
  };
  S.set(FOOD_PLAN_OFFER_STORAGE_KEY, offer);
  emitFoodPlanUpdate();
  return offer;
}

export function acceptFoodPlanOffer(now = Date.now()): CharacterFoodPlan | null {
  const offer = loadFoodPlanOffer();
  if (!offer) return null;
  S.set(FOOD_PLAN_OFFER_STORAGE_KEY, { ...offer, decision: 'accepted', decidedAt: now });
  S.set(FOOD_PLAN_STORAGE_KEY, offer.plan);
  emitFoodPlanUpdate();
  return offer.plan;
}

/** "No thanks, I have my own" — the suggestion is dropped, nothing is kept. */
export function declineFoodPlanOffer(now = Date.now()): void {
  const offer = loadFoodPlanOffer();
  if (offer) S.set(FOOD_PLAN_OFFER_STORAGE_KEY, { ...offer, decision: 'declined', decidedAt: now });
  clearActiveFoodPlan();
  emitFoodPlanUpdate();
}

export interface CreateFoodPlanOfferOptions {
  pathId: InspirationProfileId;
  targets: Pick<NutritionTargets, 'calories' | 'protein' | 'carbs' | 'fat' | 'sugar'> | null | undefined;
  diet?: DietPreference;
  now?: number;
}

/**
 * Build a fresh day plan for a newly equipped path and store it as a pending
 * offer. Any earlier accepted plan is dropped first: it belonged to the path
 * the user just left.
 */
export async function createFoodPlanOffer(
  options: CreateFoodPlanOfferOptions,
): Promise<CharacterFoodPlanOffer | null> {
  const path = CHARACTER_PATHS[options.pathId];
  if (!path || !options.targets) return null;
  const dishes = await fetchDishes();
  const plan = buildCharacterFoodPlan({
    path,
    dishes,
    targets: options.targets,
    diet: options.diet,
    now: options.now,
  });
  if (!plan) return null;
  clearActiveFoodPlan();
  return storeFoodPlanOffer(plan, options.now ?? Date.now());
}
