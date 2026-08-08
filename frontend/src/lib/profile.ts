import { S } from './storage';
import {
  validatePlanInput,
  type DietPreference,
  type EquipmentOption,
  type ExperienceLevel,
  type InspirationProfileId,
  type PlanDifficulty,
  type PlanInput,
  type PlanMode,
  type TrainingGoal,
} from './plans';

export const USER_PROFILE_SCHEMA_VERSION = 3 as const;
export const USER_PROFILE_STORAGE_KEY = 'user_profile_v3';
export const LEGACY_PROFILE_STORAGE_KEY = 'profile';
export const LEGACY_PLAN_PREFERENCES_STORAGE_KEY = 'plan_preferences';

export type ProfileGender = 'm' | 'f' | 'x';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'variable';
export type CookingAccess = 'none' | 'limited' | 'full';

/**
 * Optional context for local planning and a future consented AI request.
 * Health-adjacent and free-text values deliberately stay optional and local.
 */
export interface LifestyleProfile {
  workStudyPattern?: string;
  typicalDay?: string;
  activityContext?: string;
  sleepDurationHours?: number;
  sleepQuality?: SleepQuality;
  mealRhythm?: string;
  cookingAccess?: CookingAccess;
  allergiesExclusions?: string[];
  stressRecovery?: string;
  injuriesLimitations?: string;
  preferredTrainingWindow?: string;
}

export interface ProfileAppearance {
  avatarIndex: number;
  avatarPhoto: string | null;
}

export interface UserProfileV3 {
  schemaVersion: typeof USER_PROFILE_SCHEMA_VERSION;
  displayName: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender?: ProfileGender;
  goal: TrainingGoal;
  experience: ExperienceLevel;
  daysPerWeek: number;
  equipment: EquipmentOption[];
  diet: DietPreference;
  dietaryPreferences: string[];
  difficulty: PlanDifficulty;
  mode: PlanMode;
  inspirationProfile?: InspirationProfileId;
  lifestyle: LifestyleProfile;
  appearance?: ProfileAppearance;
}

export interface LifestyleProfilePatch {
  workStudyPattern?: string | null;
  typicalDay?: string | null;
  activityContext?: string | null;
  sleepDurationHours?: number | null;
  sleepQuality?: SleepQuality | null;
  mealRhythm?: string | null;
  cookingAccess?: CookingAccess | null;
  allergiesExclusions?: string[] | null;
  stressRecovery?: string | null;
  injuriesLimitations?: string | null;
  preferredTrainingWindow?: string | null;
}

export interface UserProfilePatch {
  displayName?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  gender?: ProfileGender | null;
  goal?: TrainingGoal;
  experience?: ExperienceLevel;
  daysPerWeek?: number;
  equipment?: EquipmentOption[];
  diet?: DietPreference;
  dietaryPreferences?: string[];
  difficulty?: PlanDifficulty;
  mode?: PlanMode;
  inspirationProfile?: InspirationProfileId | null;
  lifestyle?: LifestyleProfilePatch;
  appearance?: Partial<ProfileAppearance> | null;
}

export interface ProfileStorage {
  get<T = unknown>(key: string): T | null;
  set(key: string, value: unknown): void;
}

export const PROFILE_LIMITS = {
  displayName: 40,
  shortText: 120,
  activityContext: 400,
  typicalDay: 1_500,
  mealRhythm: 300,
  healthContext: 600,
  listItems: 16,
  listItemText: 80,
  avatarPhoto: 3_000_000,
} as const;

const DEFAULT_PROFILE = {
  age: 25,
  heightCm: 170,
  weightKg: 70,
  goal: 'general_fitness',
  experience: 'beginner',
  daysPerWeek: 3,
  equipment: ['bodyweight'],
  diet: 'flexible',
  difficulty: 'medium',
  mode: 'own',
} as const satisfies Omit<
  UserProfileV3,
  'schemaVersion' | 'displayName' | 'gender' | 'dietaryPreferences' | 'inspirationProfile' | 'lifestyle' | 'appearance'
>;

const GOALS = new Set<TrainingGoal>(['general_fitness', 'build_muscle', 'get_stronger', 'fat_loss']);
const EXPERIENCE = new Set<ExperienceLevel>(['beginner', 'intermediate', 'advanced']);
const EQUIPMENT = new Set<EquipmentOption>(['bodyweight', 'dumbbells', 'resistance_bands', 'full_gym']);
const DIETS = new Set<DietPreference>(['flexible', 'omnivore', 'vegetarian', 'vegan']);
const DIFFICULTIES = new Set<PlanDifficulty>(['light', 'medium', 'hard']);
const MODES = new Set<PlanMode>(['own', 'inspiration', 'guided']);
const INSPIRATION_PROFILES = new Set<InspirationProfileId>(['toji', 'goku', 'tanjiro']);
const GENDERS = new Set<ProfileGender>(['m', 'f', 'x']);
const SLEEP_QUALITY = new Set<SleepQuality>(['poor', 'fair', 'good', 'variable']);
const COOKING_ACCESS = new Set<CookingAccess>(['none', 'limited', 'full']);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
  integer = false,
): number {
  const parsed = numberValue(value);
  if (parsed === undefined || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    return fallback;
  }
  return parsed;
}

function optionalBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback?: number,
): number | undefined {
  if (value === undefined) return fallback;
  if (value === null || value === '') return undefined;
  const parsed = numberValue(value);
  return parsed !== undefined && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function normalizedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function optionalText(value: unknown, maximum: number, fallback?: string): string | undefined {
  if (value === undefined) return fallback;
  if (value === null) return undefined;
  if (typeof value !== 'string') return fallback;
  return normalizedText(value, maximum);
}

function normalizedStringList(
  value: unknown,
  fallback: string[] = [],
  maximumItems = PROFILE_LIMITS.listItems,
): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value)) return [...fallback];
  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizedText(item, PROFILE_LIMITS.listItemText);
    if (normalized) unique.add(normalized);
    if (unique.size >= maximumItems) break;
  }
  return [...unique];
}

function enumValue<T extends string>(value: unknown, options: Set<T>, fallback: T): T {
  return typeof value === 'string' && options.has(value as T) ? value as T : fallback;
}

function optionalEnumValue<T extends string>(
  value: unknown,
  options: Set<T>,
  fallback?: T,
): T | undefined {
  if (value === undefined) return fallback;
  if (value === null || value === '') return undefined;
  return typeof value === 'string' && options.has(value as T) ? value as T : fallback;
}

function normalizeGender(value: unknown, fallback?: ProfileGender): ProfileGender | undefined {
  if (value === undefined) return fallback;
  if (value === null || value === '') return undefined;
  const aliases: Record<string, ProfileGender> = {
    male: 'm',
    female: 'f',
    other: 'x',
    nonbinary: 'x',
    'non-binary': 'x',
  };
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return GENDERS.has(normalized as ProfileGender)
    ? normalized as ProfileGender
    : aliases[normalized] ?? fallback;
}

function normalizeGoal(value: unknown, fallback: TrainingGoal): TrainingGoal {
  if (typeof value !== 'string') return fallback;
  if (GOALS.has(value as TrainingGoal)) return value as TrainingGoal;
  const legacyGoals: Record<string, TrainingGoal> = {
    bulk: 'build_muscle',
    cut: 'fat_loss',
    perf: 'get_stronger',
    long: 'general_fitness',
  };
  return legacyGoals[value] ?? fallback;
}

function normalizeEquipment(value: unknown, fallback: EquipmentOption[]): EquipmentOption[] {
  if (!Array.isArray(value)) return [...fallback];
  const result = [...new Set(value.filter(
    (item): item is EquipmentOption => typeof item === 'string' && EQUIPMENT.has(item as EquipmentOption),
  ))];
  return result.length ? result : [...fallback];
}

function normalizeLifestyle(value: unknown, fallback: LifestyleProfile = {}): LifestyleProfile {
  const source = asRecord(value);
  if (!source) return { ...fallback, allergiesExclusions: fallback.allergiesExclusions ? [...fallback.allergiesExclusions] : undefined };

  const lifestyle: LifestyleProfile = {};
  const workStudyPattern = optionalText(source.workStudyPattern, PROFILE_LIMITS.shortText, fallback.workStudyPattern);
  const typicalDay = optionalText(source.typicalDay, PROFILE_LIMITS.typicalDay, fallback.typicalDay);
  const activityContext = optionalText(source.activityContext, PROFILE_LIMITS.activityContext, fallback.activityContext);
  const sleepDurationHours = optionalBoundedNumber(source.sleepDurationHours, 0, 16, fallback.sleepDurationHours);
  const sleepQuality = optionalEnumValue(source.sleepQuality, SLEEP_QUALITY, fallback.sleepQuality);
  const mealRhythm = optionalText(source.mealRhythm, PROFILE_LIMITS.mealRhythm, fallback.mealRhythm);
  const cookingAccess = optionalEnumValue(source.cookingAccess, COOKING_ACCESS, fallback.cookingAccess);
  const allergiesExclusions = normalizedStringList(
    source.allergiesExclusions,
    fallback.allergiesExclusions ?? [],
  );
  const stressRecovery = optionalText(source.stressRecovery, PROFILE_LIMITS.healthContext, fallback.stressRecovery);
  const injuriesLimitations = optionalText(source.injuriesLimitations, PROFILE_LIMITS.healthContext, fallback.injuriesLimitations);
  const preferredTrainingWindow = optionalText(
    source.preferredTrainingWindow,
    PROFILE_LIMITS.shortText,
    fallback.preferredTrainingWindow,
  );

  if (workStudyPattern !== undefined) lifestyle.workStudyPattern = workStudyPattern;
  if (typicalDay !== undefined) lifestyle.typicalDay = typicalDay;
  if (activityContext !== undefined) lifestyle.activityContext = activityContext;
  if (sleepDurationHours !== undefined) lifestyle.sleepDurationHours = sleepDurationHours;
  if (sleepQuality !== undefined) lifestyle.sleepQuality = sleepQuality;
  if (mealRhythm !== undefined) lifestyle.mealRhythm = mealRhythm;
  if (cookingAccess !== undefined) lifestyle.cookingAccess = cookingAccess;
  if (allergiesExclusions.length) lifestyle.allergiesExclusions = allergiesExclusions;
  if (stressRecovery !== undefined) lifestyle.stressRecovery = stressRecovery;
  if (injuriesLimitations !== undefined) lifestyle.injuriesLimitations = injuriesLimitations;
  if (preferredTrainingWindow !== undefined) lifestyle.preferredTrainingWindow = preferredTrainingWindow;
  return lifestyle;
}

function normalizeAppearance(value: unknown, fallback?: ProfileAppearance): ProfileAppearance | undefined {
  if (value === null) return undefined;
  const source = asRecord(value);
  if (!source) return fallback ? { ...fallback } : undefined;
  const avatarIndex = boundedNumber(source.avatarIndex, 0, 50, fallback?.avatarIndex ?? 0, true);
  let avatarPhoto = fallback?.avatarPhoto ?? null;
  if (source.avatarPhoto === null || source.avatarPhoto === '') avatarPhoto = null;
  else if (typeof source.avatarPhoto === 'string' && source.avatarPhoto.length <= PROFILE_LIMITS.avatarPhoto) {
    avatarPhoto = source.avatarPhoto;
  }
  return { avatarIndex, avatarPhoto };
}

function normalizeCandidate(value: unknown, fallback?: UserProfileV3): UserProfileV3 | null {
  const source = asRecord(value);
  if (!source) return fallback ? structuredCloneProfile(fallback) : null;

  const displayName = normalizedText(
    firstDefined(source.displayName, source.firstName),
    PROFILE_LIMITS.displayName,
  ) ?? fallback?.displayName;
  if (!displayName) return null;

  const inspirationProfile = optionalEnumValue(
    source.inspirationProfile,
    INSPIRATION_PROFILES,
    fallback?.inspirationProfile,
  );
  let mode = enumValue(source.mode, MODES, fallback?.mode ?? DEFAULT_PROFILE.mode);
  if (mode === 'inspiration' && !inspirationProfile) mode = fallback?.mode === 'inspiration' ? 'own' : fallback?.mode ?? 'own';

  const gender = normalizeGender(source.gender, fallback?.gender);
  const appearance = normalizeAppearance(source.appearance, fallback?.appearance);
  const profile: UserProfileV3 = {
    schemaVersion: USER_PROFILE_SCHEMA_VERSION,
    displayName,
    age: boundedNumber(source.age, 16, 85, fallback?.age ?? DEFAULT_PROFILE.age, true),
    heightCm: boundedNumber(source.heightCm, 120, 230, fallback?.heightCm ?? DEFAULT_PROFILE.heightCm),
    weightKg: boundedNumber(source.weightKg, 35, 250, fallback?.weightKg ?? DEFAULT_PROFILE.weightKg),
    goal: normalizeGoal(source.goal, fallback?.goal ?? DEFAULT_PROFILE.goal),
    experience: enumValue(source.experience, EXPERIENCE, fallback?.experience ?? DEFAULT_PROFILE.experience),
    daysPerWeek: boundedNumber(source.daysPerWeek, 2, 6, fallback?.daysPerWeek ?? DEFAULT_PROFILE.daysPerWeek, true),
    equipment: normalizeEquipment(source.equipment, fallback?.equipment ?? [...DEFAULT_PROFILE.equipment]),
    diet: enumValue(source.diet, DIETS, fallback?.diet ?? DEFAULT_PROFILE.diet),
    dietaryPreferences: normalizedStringList(source.dietaryPreferences, fallback?.dietaryPreferences ?? []),
    difficulty: enumValue(source.difficulty, DIFFICULTIES, fallback?.difficulty ?? DEFAULT_PROFILE.difficulty),
    mode,
    lifestyle: normalizeLifestyle(source.lifestyle, fallback?.lifestyle),
  };
  if (gender !== undefined) profile.gender = gender;
  if (inspirationProfile !== undefined) profile.inspirationProfile = inspirationProfile;
  if (appearance !== undefined) profile.appearance = appearance;
  return profile;
}

function structuredCloneProfile(profile: UserProfileV3): UserProfileV3 {
  return {
    ...profile,
    equipment: [...profile.equipment],
    dietaryPreferences: [...profile.dietaryPreferences],
    lifestyle: {
      ...profile.lifestyle,
      allergiesExclusions: profile.lifestyle.allergiesExclusions
        ? [...profile.lifestyle.allergiesExclusions]
        : undefined,
    },
    appearance: profile.appearance ? { ...profile.appearance } : undefined,
  };
}

function lifestyleFromLegacy(profile: UnknownRecord, preferences: UnknownRecord): UnknownRecord {
  const oldLifestyle = asRecord(profile.lifestyle) ?? {};
  const preferenceLifestyle = asRecord(preferences.lifestyle) ?? {};
  return {
    workStudyPattern: firstDefined(
      preferenceLifestyle.workStudyPattern,
      preferences.workStudyPattern,
      preferences.workPattern,
      oldLifestyle.workStudyPattern,
      profile.workStudyPattern,
      profile.workPattern,
    ),
    typicalDay: firstDefined(preferenceLifestyle.typicalDay, preferences.typicalDay, oldLifestyle.typicalDay, profile.typicalDay),
    activityContext: firstDefined(
      preferenceLifestyle.activityContext,
      preferences.activityContext,
      oldLifestyle.activityContext,
      profile.activityContext,
    ),
    sleepDurationHours: firstDefined(
      preferenceLifestyle.sleepDurationHours,
      preferences.sleepDurationHours,
      preferences.sleepHours,
      oldLifestyle.sleepDurationHours,
      profile.sleepDurationHours,
      profile.sleepHours,
    ),
    sleepQuality: firstDefined(
      preferenceLifestyle.sleepQuality,
      preferences.sleepQuality,
      oldLifestyle.sleepQuality,
      profile.sleepQuality,
    ),
    mealRhythm: firstDefined(preferenceLifestyle.mealRhythm, preferences.mealRhythm, oldLifestyle.mealRhythm, profile.mealRhythm),
    cookingAccess: firstDefined(
      preferenceLifestyle.cookingAccess,
      preferences.cookingAccess,
      oldLifestyle.cookingAccess,
      profile.cookingAccess,
    ),
    allergiesExclusions: firstDefined(
      preferenceLifestyle.allergiesExclusions,
      preferences.allergiesExclusions,
      preferences.allergies,
      oldLifestyle.allergiesExclusions,
      profile.allergiesExclusions,
      profile.allergies,
    ),
    stressRecovery: firstDefined(
      preferenceLifestyle.stressRecovery,
      preferences.stressRecovery,
      oldLifestyle.stressRecovery,
      profile.stressRecovery,
    ),
    injuriesLimitations: firstDefined(
      preferenceLifestyle.injuriesLimitations,
      preferences.injuriesLimitations,
      preferences.injuries,
      oldLifestyle.injuriesLimitations,
      profile.injuriesLimitations,
      profile.injuries,
    ),
    preferredTrainingWindow: firstDefined(
      preferenceLifestyle.preferredTrainingWindow,
      preferences.preferredTrainingWindow,
      preferences.trainingWindow,
      oldLifestyle.preferredTrainingWindow,
      profile.preferredTrainingWindow,
      profile.trainingWindow,
    ),
  };
}

/** Converts the two historic local shapes into one deterministic V3 profile. */
export function migrateLegacyUserProfile(
  legacyProfile: unknown,
  legacyPlanPreferences: unknown,
): UserProfileV3 | null {
  const profile = asRecord(legacyProfile) ?? {};
  const preferences = asRecord(legacyPlanPreferences) ?? {};
  if (!Object.keys(profile).length && !Object.keys(preferences).length) return null;

  const identity = normalizedText(preferences.displayName, PROFILE_LIMITS.displayName)
    ?? normalizedText(profile.displayName, PROFILE_LIMITS.displayName)
    ?? normalizedText(profile.firstName, PROFILE_LIMITS.displayName);
  if (!identity) return null;

  const hasLegacyAppearance = profile.appearance !== undefined
    || profile.avatarIdx !== undefined
    || profile.avatarPhoto !== undefined;
  const profileBase = normalizeCandidate({
    displayName: identity,
    age: profile.age,
    heightCm: firstDefined(profile.heightCm, profile.height),
    weightKg: firstDefined(profile.weightKg, profile.weight),
    gender: profile.gender,
    goal: firstDefined(profile.trainingGoal, profile.goal),
    experience: profile.experience,
    daysPerWeek: profile.daysPerWeek,
    equipment: profile.equipment,
    diet: profile.diet,
    dietaryPreferences: profile.dietaryPreferences,
    difficulty: profile.difficulty,
    mode: profile.mode,
    inspirationProfile: profile.inspirationProfile,
    lifestyle: lifestyleFromLegacy(profile, {}),
    appearance: hasLegacyAppearance
      ? firstDefined(profile.appearance, {
        avatarIndex: profile.avatarIdx,
        avatarPhoto: profile.avatarPhoto,
      })
      : undefined,
  });
  if (!profileBase) return null;

  return normalizeCandidate({
    displayName: preferences.displayName,
    age: preferences.age,
    heightCm: preferences.heightCm,
    weightKg: preferences.weightKg,
    gender: preferences.gender,
    goal: preferences.goal,
    experience: preferences.experience,
    daysPerWeek: preferences.daysPerWeek,
    equipment: preferences.equipment,
    diet: preferences.diet,
    dietaryPreferences: preferences.dietaryPreferences,
    difficulty: preferences.difficulty,
    mode: preferences.mode,
    inspirationProfile: preferences.inspirationProfile,
    lifestyle: lifestyleFromLegacy({}, preferences),
    appearance: preferences.appearance,
  }, profileBase);
}

/** Normalizes an imported/current object without reading or writing storage. */
export function normalizeUserProfile(value: unknown): UserProfileV3 | null {
  return normalizeCandidate(value);
}

/**
 * Loads V3 first, then falls back to a read-only migration of historic keys.
 * Loading never writes, so simply opening the app cannot mutate local data.
 */
export function loadUserProfile(storage: ProfileStorage = S): UserProfileV3 | null {
  try {
    const current = normalizeUserProfile(storage.get(USER_PROFILE_STORAGE_KEY));
    if (current) return current;
    return migrateLegacyUserProfile(
      storage.get(LEGACY_PROFILE_STORAGE_KEY),
      storage.get(LEGACY_PLAN_PREFERENCES_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

/** Writes only the canonical profile key; protocols, plans, workouts, and logs are untouched. */
export function saveUserProfile(profile: UserProfileV3, storage: ProfileStorage = S): UserProfileV3 {
  const normalized = normalizeUserProfile(profile);
  if (!normalized) throw new Error('Cannot save an invalid local profile.');
  storage.set(USER_PROFILE_STORAGE_KEY, normalized);
  return structuredCloneProfile(normalized);
}

/** Applies a non-destructive, normalized patch without storage or date dependencies. */
export function patchUserProfile(profile: UserProfileV3, patch: UserProfilePatch): UserProfileV3 {
  const current = normalizeUserProfile(profile);
  if (!current) throw new Error('Cannot patch an invalid local profile.');
  const lifestylePatch = asRecord(patch.lifestyle);
  const appearancePatch = patch.appearance === null
    ? null
    : patch.appearance
      ? { ...current.appearance, ...patch.appearance }
      : current.appearance;
  const merged: UnknownRecord = {
    ...current,
    ...patch,
    schemaVersion: USER_PROFILE_SCHEMA_VERSION,
    lifestyle: lifestylePatch ? { ...current.lifestyle, ...lifestylePatch } : current.lifestyle,
    appearance: appearancePatch,
  };
  const normalized = normalizeCandidate(merged, current);
  if (!normalized) throw new Error('Profile patch did not produce a valid local profile.');
  return normalized;
}

/** Loads, patches, and saves the profile while touching no unrelated storage keys. */
export function patchStoredUserProfile(
  patch: UserProfilePatch,
  storage: ProfileStorage = S,
): UserProfileV3 | null {
  const current = loadUserProfile(storage);
  if (!current) return null;
  return saveUserProfile(patchUserProfile(current, patch), storage);
}

export function userProfileFromPlanInput(
  input: PlanInput,
  options: {
    gender?: ProfileGender;
    dietaryPreferences?: string[];
    lifestyle?: LifestyleProfile;
    appearance?: ProfileAppearance;
  } = {},
): UserProfileV3 {
  const validation = validatePlanInput(input);
  if (!validation.valid) throw new Error(`Invalid profile input: ${Object.keys(validation.errors).join(', ')}`);
  const profile = normalizeUserProfile({
    ...input,
    ...options,
    schemaVersion: USER_PROFILE_SCHEMA_VERSION,
  });
  if (!profile) throw new Error('Plan input did not produce a valid local profile.');
  return profile;
}

/** Backward-compatible input for the deterministic local plan generator. */
export function userProfileToPlanInput(profile: UserProfileV3): PlanInput {
  const normalized = normalizeUserProfile(profile);
  if (!normalized) throw new Error('Cannot create plan input from an invalid local profile.');
  return {
    mode: normalized.mode,
    inspirationProfile: normalized.inspirationProfile,
    displayName: normalized.displayName,
    age: normalized.age,
    heightCm: normalized.heightCm,
    weightKg: normalized.weightKg,
    experience: normalized.experience,
    daysPerWeek: normalized.daysPerWeek,
    equipment: [...normalized.equipment],
    diet: normalized.diet,
    goal: normalized.goal,
    difficulty: normalized.difficulty,
  };
}
