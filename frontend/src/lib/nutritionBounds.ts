export const NUTRITION_LIMITS = {
  kcal: 10_000,
  prot: 1_000,
  carb: 1_500,
  fat: 1_000,
  sug: 1_500,
} as const;

export type NutritionField = keyof typeof NUTRITION_LIMITS;

export function clampNutritionNumber(field: NutritionField, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(NUTRITION_LIMITS[field], Math.max(0, value));
}
