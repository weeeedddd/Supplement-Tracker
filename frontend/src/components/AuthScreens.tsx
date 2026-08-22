import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { replaceStarterWorkouts } from '../lib/characterWorkouts';
import {
  CHARACTER_EQUIP_STORAGE_KEY,
  getCharacterPath,
  localizedCharacterCopy,
} from '../lib/characterPaths';
import {
  buildCharacterFoodPlan,
  saveCharacterFoodPlanChoice,
  type CharacterFoodPlanChoice,
  type CharacterMealSlot,
} from '../lib/characterFoodPlans';
import { useModalIsolation } from '../lib/modal';
import {
  calculateNutritionTargetsForProfile,
  PROFILE_LIMITS,
  saveUserProfile,
  userProfileFromPlanInput,
  type CookingAccess,
  type LifestyleProfile,
  type ProfileGender,
  type SleepQuality,
  type UserProfileV3,
} from '../lib/profile';
import {
  EQUIPMENT_OPTIONS,
  INSPIRATION_PROFILES,
  PLAN_MODE_OPTIONS,
  generateInitialPlan,
  validatePlanInput,
  type ActivityLevel,
  type DietPreference,
  type EquipmentOption,
  type ExperienceLevel,
  type InitialPlan,
  type InspirationProfileId,
  type PlanDifficulty,
  type PlanInput,
  type PlanMode,
  type TrainingGoal,
} from '../lib/plans';
import { S } from '../lib/storage';
import { lang } from '../lib/i18n';
import { showScreen } from '../lib/store';
import { SystemIcon } from './SystemIcon';
import '../onboarding.css';

export interface OfflineProfileWelcomeProps {
  onStart?: () => void;
  onContinue?: () => void;
}

export type PlanGenerationOrigin = 'local-rules' | 'remote-ai';

/**
 * Privacy-minimised request boundary for a future server-side AI integration.
 * Display name, appearance, address and logs are deliberately not part of it.
 */
export interface AiPlanRequest {
  context: Omit<UserProfileV3, 'displayName' | 'appearance'>;
  consentedAt: string;
  responseLanguage: 'de' | 'en';
}

export interface OnboardingCompletePayload {
  input: PlanInput;
  plan: InitialPlan;
  profile?: UserProfileV3;
  generationOrigin?: PlanGenerationOrigin;
}

export interface OnboardScreenProps {
  onComplete?: (result: OnboardingCompletePayload) => void;
  onAiPlanRequest?: (request: AiPlanRequest) => Promise<InitialPlan | null>;
  onAiConsentChange?: (consented: boolean) => void;
}

type OnboardingStep = 1 | 2 | 3 | 4;
type PlanErrors = ReturnType<typeof validatePlanInput>['errors'];

interface LifestyleDraft {
  workStudyPattern: string;
  typicalDay: string;
  activityLevel: ActivityLevel;
  activityContext: string;
  sleepDurationHours: string;
  sleepQuality: '' | SleepQuality;
  mealRhythm: string;
  cookingAccess: '' | CookingAccess;
  dietaryPreferences: string;
  allergiesExclusions: string;
  stressRecovery: string;
  injuriesLimitations: string;
  preferredTrainingWindow: string;
}

type LifestyleErrorKey = keyof LifestyleDraft;
type LifestyleErrors = Partial<Record<LifestyleErrorKey, string>>;

const TOTAL_STEPS = 4;
const copy = (de: string, en: string) => lang === 'de' ? de : en;
const STEP_TITLES: Record<OnboardingStep, { de: string; en: string }> = {
  1: { de: 'Wähle deinen Pfad', en: 'Choose your path' },
  2: { de: 'Lege deine Werte fest', en: 'Set your stats' },
  3: { de: 'Passe das System an', en: 'Tune the system' },
  4: { de: 'Dein System-Ergebnis', en: 'Your system result' },
};

const CHARACTER_ART: Record<InspirationProfileId, string> = {
  toji: 'toji.webp',
  goku: 'goku.webp',
  tanjiro: 'tanjiro.webp',
  kaneki: 'kaneki.webp',
  sanji: 'sanji.webp',
  baki: 'baki.webp',
  mikasa: 'mikasa.webp',
};

function characterArt(id: InspirationProfileId): string {
  const base = (import.meta as any).env?.BASE_URL || '/';
  return `${base}assets/coreline/character-paths/${CHARACTER_ART[id]}`;
}

const DIFFICULTIES: Array<{ id: PlanDifficulty; label: string; detail: string }> = [
  { id: 'light', label: 'Light', detail: 'Shorter sessions and lower volume' },
  { id: 'medium', label: 'Medium', detail: 'A balanced starting workload' },
  { id: 'hard', label: 'Hard', detail: 'More volume, still capped by experience' },
];

const EXPERIENCE: Array<{ id: ExperienceLevel; label: string }> = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

const DIETS: Array<{ id: DietPreference; label: string }> = [
  { id: 'flexible', label: 'Flexible / no preference' },
  { id: 'omnivore', label: 'Omnivore' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
];

const GOALS: Array<{ id: TrainingGoal; label: string }> = [
  { id: 'general_fitness', label: 'General fitness' },
  { id: 'build_muscle', label: 'Build muscle' },
  { id: 'get_stronger', label: 'Get stronger' },
  { id: 'fat_loss', label: 'Support fat loss habits' },
];

const SLEEP_QUALITY_OPTIONS: Array<{ id: SleepQuality; label: string }> = [
  { id: 'poor', label: 'Often poor' },
  { id: 'fair', label: 'Fair' },
  { id: 'good', label: 'Usually good' },
  { id: 'variable', label: 'Highly variable' },
];

const COOKING_OPTIONS: Array<{ id: CookingAccess; label: string }> = [
  { id: 'none', label: 'No regular cooking access' },
  { id: 'limited', label: 'Limited / quick meals only' },
  { id: 'full', label: 'Full kitchen access' },
];

const ACTIVITY_OPTIONS: Array<{ id: ActivityLevel; de: string; en: string }> = [
  { id: 'sedentary', de: 'Überwiegend sitzend', en: 'Mostly sedentary' },
  { id: 'light', de: 'Leicht aktiv', en: 'Lightly active' },
  { id: 'moderate', de: 'Moderat aktiv', en: 'Moderately active' },
  { id: 'high', de: 'Sehr aktiv', en: 'Very active' },
  { id: 'very_high', de: 'Extrem aktiv / körperlicher Beruf', en: 'Extremely active / physical job' },
];

const EMPTY_LIFESTYLE: LifestyleDraft = {
  workStudyPattern: '',
  typicalDay: '',
  activityLevel: 'moderate',
  activityContext: '',
  sleepDurationHours: '',
  sleepQuality: '',
  mealRhythm: '',
  cookingAccess: '',
  dietaryPreferences: '',
  allergiesExclusions: '',
  stressRecovery: '',
  injuriesLimitations: '',
  preferredTrainingWindow: '',
};

function stepTitle(step: OnboardingStep): string {
  return lang === 'de' ? STEP_TITLES[step].de : STEP_TITLES[step].en;
}

function difficultyCopy(id: PlanDifficulty): { label: string; detail: string } {
  const labels: Record<PlanDifficulty, { de: string; en: string; deDetail: string; enDetail: string }> = {
    light: { de: 'Leicht', en: 'Light', deDetail: 'Kürzere Einheiten und weniger Volumen', enDetail: 'Shorter sessions and lower volume' },
    medium: { de: 'Mittel', en: 'Medium', deDetail: 'Ausgewogene Belastung zum Einstieg', enDetail: 'A balanced starting workload' },
    hard: { de: 'Hart', en: 'Hard', deDetail: 'Mehr Volumen, weiterhin durch Erfahrung begrenzt', enDetail: 'More volume, still capped by experience' },
  };
  const item = labels[id];
  return { label: copy(item.de, item.en), detail: copy(item.deDetail, item.enDetail) };
}

const experienceLabel = (id: ExperienceLevel) => ({
  beginner: copy('Einsteiger', 'Beginner'),
  intermediate: copy('Fortgeschritten', 'Intermediate'),
  advanced: copy('Erfahren', 'Advanced'),
})[id];

const dietLabel = (id: DietPreference) => ({
  flexible: copy('Flexibel / keine Präferenz', 'Flexible / no preference'),
  omnivore: copy('Mischkost', 'Omnivore'),
  vegetarian: copy('Vegetarisch', 'Vegetarian'),
  vegan: copy('Vegan', 'Vegan'),
})[id];

const goalLabel = (id: TrainingGoal) => ({
  general_fitness: copy('Allgemeine Fitness', 'General fitness'),
  build_muscle: copy('Muskeln aufbauen', 'Build muscle'),
  get_stronger: copy('Stärker werden', 'Get stronger'),
  fat_loss: copy('Gewichtsabnahme-Gewohnheiten unterstützen', 'Support fat loss habits'),
})[id];

const equipmentLabel = (id: EquipmentOption) => ({
  bodyweight: copy('Körpergewicht', 'Bodyweight'),
  dumbbells: copy('Kurzhanteln', 'Dumbbells'),
  resistance_bands: copy('Widerstandsbänder', 'Resistance bands'),
  full_gym: copy('Voll ausgestattetes Studio', 'Full gym'),
})[id];

const sleepQualityLabel = (id: SleepQuality) => ({
  poor: copy('Oft schlecht', 'Often poor'),
  fair: copy('Durchwachsen', 'Fair'),
  good: copy('Meist gut', 'Usually good'),
  variable: copy('Stark wechselnd', 'Highly variable'),
})[id];

const cookingLabel = (id: CookingAccess) => ({
  none: copy('Keine regelmäßige Kochmöglichkeit', 'No regular cooking access'),
  limited: copy('Begrenzt / nur schnelle Mahlzeiten', 'Limited / quick meals only'),
  full: copy('Voll ausgestattete Küche', 'Full kitchen access'),
})[id];

const activityLabel = (id: ActivityLevel) => ACTIVITY_OPTIONS.find((item) => item.id === id)
  ? copy(
    ACTIVITY_OPTIONS.find((item) => item.id === id)!.de,
    ACTIVITY_OPTIONS.find((item) => item.id === id)!.en,
  )
  : id;

function bmiSnapshot(heightCm: number, weightKg: number): { value: number; label: string; level: 'low' | 'healthy' | 'high' | 'very-high' } | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0) return null;
  const value = weightKg / ((heightCm / 100) ** 2);
  if (value < 18.5) return { value, label: copy('Unter dem Referenzbereich', 'Below reference range'), level: 'low' };
  if (value < 25) return { value, label: copy('Im Referenzbereich', 'Within reference range'), level: 'healthy' };
  if (value < 30) return { value, label: copy('Über dem Referenzbereich', 'Above reference range'), level: 'high' };
  return { value, label: copy('Deutlich über dem Referenzbereich', 'Well above reference range'), level: 'very-high' };
}

function systemAdvice(goal: TrainingGoal): string {
  const advice: Record<TrainingGoal, [string, string]> = {
    general_fitness: ['Steigere Umfang und Belastung nur schrittweise. Ausgewogene Ganzkörpereinheiten und verlässliche Erholung bleiben die Priorität.', 'Increase volume and load gradually. Balanced full-body sessions and reliable recovery stay the priority.'],
    build_muscle: ['Priorisiere progressive Überlastung, ausreichend Protein und einen kontrollierten Energieüberschuss. Der Plan passt Volumen an deine Trainingstage an.', 'Prioritize progressive overload, sufficient protein, and a controlled energy surplus. The plan adjusts volume to your available training days.'],
    get_stronger: ['Halte die Hauptübungen technisch sauber, protokolliere Last und Wiederholungen und erhöhe erst, wenn die Zielwiederholungen stabil sind.', 'Keep main lifts technically clean, log load and reps, and increase only when target reps are stable.'],
    fat_loss: ['Das System nutzt ein moderates Defizit und hält Protein hoch, damit Gewohnheiten, Leistung und Muskelerhalt zusammenpassen.', 'The system uses a moderate deficit and keeps protein high so habits, performance, and muscle retention work together.'],
  };
  return copy(...advice[goal]);
}

function mealSlotLabel(slot: CharacterMealSlot): string {
  return ({
    breakfast: copy('Frühstück', 'Breakfast'),
    lunch: copy('Mittag', 'Lunch'),
    snack: copy('Snack', 'Snack'),
    dinner: copy('Abendessen', 'Dinner'),
  })[slot];
}

function portionLabel(portions: number): string {
  const value = Number.isInteger(portions) ? String(portions) : portions.toFixed(1).replace('.', ',');
  return `${value}×`;
}

function inspirationCopy(id: InspirationProfileId): { tagline: string; description: string } {
  const labels: Record<InspirationProfileId, { de: string; en: string; deDescription: string; enDescription: string }> = {
    toji: { de: 'Direkte Kraft', en: 'Direct strength', deDescription: 'Dichte funktionelle Kraft mit einfachen Grundbewegungen und großzügiger Erholung.', enDescription: 'Dense functional strength built around simple compound movements and generous recovery.' },
    goku: { de: 'Athletische Vielfalt', en: 'Athletic variety', deDescription: 'Ganzkörper-Hypertrophie, Kondition und kontrolliert steigendes Trainingsvolumen.', enDescription: 'Full-body hypertrophy, conditioning, and progressively increasing training volume.' },
    tanjiro: { de: 'Stabile Balance', en: 'Steady balance', deDescription: 'Ausgewogene Kraft, Mobilität, Atemkontrolle und wiederholbare Belastung.', enDescription: 'Balanced strength, mobility, breath control, and repeatable effort.' },
    kaneki: { de: 'Adaptive Kontrolle', en: 'Adaptive control', deDescription: 'Zugkraft, Griffarbeit, Rumpfspannung und kontrollierte Kondition für einen anpassungsfähigen Athleten.', enDescription: 'Pulling strength, grip work, trunk tension, and controlled conditioning for an adaptive athlete.' },
    sanji: { de: 'Beinpräzision', en: 'Leg precision', deDescription: 'Ein Unterkörper-Pfad mit einbeiniger Kraft, Balance, Fußarbeit, Wadenkapazität und Kondition.', enDescription: 'A lower-body path with unilateral strength, balance, footwork, calf capacity, and conditioning.' },
    baki: { de: 'Ganzkörper-Kampfkraft', en: 'Total-body combat strength', deDescription: 'Kontrollierte Ganzkörperkraft, Carries, Beweglichkeit und kurze Konditionsblöcke.', enDescription: 'Controlled full-body strength, carries, mobility, and short conditioning blocks.' },
    mikasa: { de: 'Taktische Ausdauer', en: 'Tactical endurance', deDescription: 'Zugkraft, Carries, Rumpfstabilität und effiziente wiederholbare Bewegung.', enDescription: 'Pulling strength, carries, core stability, and efficient repeatable movement.' },
  };
  const item = labels[id];
  return { tagline: copy(item.de, item.en), description: copy(item.deDescription, item.enDescription) };
}

function modeCopy(mode: PlanMode): { label: string; description: string } {
  if (mode === 'guided') {
    return {
      label: 'AI Plan',
      description: copy(
        'Nutze einen verbundenen KI-Dienst nur nach Einwilligung. Transparente lokale Regeln bleiben der ehrliche Fallback.',
        'Use a connected AI service only after consent. Local rules remain the honest fallback.',
      ),
    };
  }
  if (mode === 'own') return {
    label: copy('Eigener Weg', 'Own Path'),
    description: copy('Nutze nur die Ziele und Grenzen, die du selbst auswählst.', 'Use only the goals and constraints you choose.'),
  };
  return {
    label: copy('Inspirationsprofile', 'Inspiration Profiles'),
    description: copy('Aktiviere einen exklusiven Charakterpfad mit passendem Trainingsfokus.', 'Activate an exclusive character path with a matching training focus.'),
  };
}

function trimmed(value: string): string | undefined {
  const result = value.trim();
  return result || undefined;
}

function stringList(value: string): string[] {
  return [...new Set(value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean))]
    .slice(0, PROFILE_LIMITS.listItems);
}

function lifestyleFromDraft(draft: LifestyleDraft): LifestyleProfile {
  const sleepDurationHours = draft.sleepDurationHours.trim() === ''
    ? undefined
    : Number(draft.sleepDurationHours);
  return {
    workStudyPattern: trimmed(draft.workStudyPattern),
    typicalDay: trimmed(draft.typicalDay),
    activityLevel: draft.activityLevel,
    activityContext: trimmed(draft.activityContext),
    sleepDurationHours,
    sleepQuality: draft.sleepQuality || undefined,
    mealRhythm: trimmed(draft.mealRhythm),
    cookingAccess: draft.cookingAccess || undefined,
    allergiesExclusions: stringList(draft.allergiesExclusions),
    stressRecovery: trimmed(draft.stressRecovery),
    injuriesLimitations: trimmed(draft.injuriesLimitations),
    preferredTrainingWindow: trimmed(draft.preferredTrainingWindow),
  };
}

function validateLifestyle(draft: LifestyleDraft): LifestyleErrors {
  const errors: LifestyleErrors = {};
  const sleep = draft.sleepDurationHours.trim();
  if (sleep) {
    const parsed = Number(sleep);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 16) {
      errors.sleepDurationHours = copy('Gib eine Schlafdauer von 0 bis 16 Stunden ein oder lasse das Feld leer.', 'Enter a sleep duration from 0 to 16 hours, or leave it blank.');
    }
  }

  const limits: Array<[LifestyleErrorKey, number, string]> = [
    ['workStudyPattern', PROFILE_LIMITS.shortText, 'Work or study pattern'],
    ['typicalDay', PROFILE_LIMITS.typicalDay, 'Typical day'],
    ['activityContext', PROFILE_LIMITS.activityContext, 'Activity context'],
    ['mealRhythm', PROFILE_LIMITS.mealRhythm, 'Meal rhythm'],
    ['stressRecovery', PROFILE_LIMITS.healthContext, 'Stress and recovery context'],
    ['injuriesLimitations', PROFILE_LIMITS.healthContext, 'Limitations context'],
    ['preferredTrainingWindow', PROFILE_LIMITS.shortText, 'Training window'],
  ];
  for (const [key, maximum, label] of limits) {
    if (draft[key].length > maximum) errors[key] = lang === 'de'
      ? `Dieses Feld darf höchstens ${maximum} Zeichen enthalten.`
      : `${label} must be ${maximum} characters or fewer.`;
  }
  return errors;
}

function isUsablePlan(plan: InitialPlan | null): plan is InitialPlan {
  if (!plan || !Array.isArray(plan.sessions) || plan.sessions.length < 1 || plan.sessions.length > 6) return false;
  if (plan.sessions.some((session) => (
    !Array.isArray(session.exercises)
    || session.exercises.length < 1
    || session.exercises.length > 10
    || !Number.isFinite(session.durationMinutes)
    || session.durationMinutes < 10
    || session.durationMinutes > 120
  ))) return false;
  const targets = plan.nutritionTargets;
  if (!targets) return false;
  const boundedTargets = [
    [targets.calories, 1_200, 4_500],
    [targets.protein, 0, 250],
    [targets.carbs, 0, 700],
    [targets.fat, 0, 140],
    [targets.sugar, 0, 250],
  ] as const;
  return boundedTargets.every(([value, minimum, maximum]) => (
    Number.isFinite(value) && value >= minimum && value <= maximum
  )) && targets.sugar <= targets.carbs && plan.sessions.every(session => (
    typeof session.title === 'string'
    && session.title.trim().length > 0
    && session.title.length <= 120
    && session.exercises.every(exercise => (
      typeof exercise.name === 'string'
      && exercise.name.trim().length > 0
      && exercise.name.length <= 120
      && Number.isInteger(exercise.sets)
      && exercise.sets >= 1
      && exercise.sets <= 6
      && typeof exercise.reps === 'string'
      && exercise.reps.length <= 100
      && typeof exercise.effort === 'string'
      && exercise.effort.length <= 240
    ))
  )) && Array.isArray(plan.safetyNotes) && plan.safetyNotes.length > 0;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span className="onboarding-field-error" id={id}>{message}</span>;
}

function localizedPlanErrors(errors: PlanErrors): PlanErrors {
  if (lang !== 'de') return errors;
  const messages: Partial<Record<keyof PlanInput, string>> = {
    mode: 'Wähle einen Planungsmodus.',
    inspirationProfile: 'Wähle ein textbasiertes Inspirationsprofil.',
    displayName: 'Gib einen Namen mit 1 bis 40 Zeichen ein.',
    age: 'Das Alter muss zwischen 16 und 85 liegen.',
    heightCm: 'Die Größe muss zwischen 120 und 230 cm liegen.',
    weightKg: 'Das Gewicht muss zwischen 35 und 250 kg liegen.',
    experience: 'Wähle deine Trainingserfahrung.',
    daysPerWeek: 'Wähle 2 bis 6 Trainingstage.',
    equipment: 'Wähle mindestens eine verfügbare Ausstattung.',
    diet: 'Wähle eine Ernährungsform.',
    goal: 'Wähle ein Trainingsziel.',
    difficulty: 'Wähle eine Startintensität.',
  };
  return Object.fromEntries(Object.keys(errors).map(key => [key, messages[key as keyof PlanInput] ?? errors[key as keyof PlanInput]])) as PlanErrors;
}

export function OfflineProfileWelcome({ onStart, onContinue }: OfflineProfileWelcomeProps = {}) {
  const hasProfile = Boolean(S.get('profile'));
  const start = () => (onStart ? onStart() : showScreen('onboard'));
  const continueLocal = () => (onContinue ? onContinue() : showScreen('dashboard'));

  return (
    <section className="screen active local-welcome" id="screen-login" aria-labelledby="local-welcome-title">
      <div className="local-welcome-card">
        <p className="local-kicker">CORELINE / {copy('LOKALER BEREICH', 'LOCAL WORKSPACE')}</p>
        <h1 id="local-welcome-title">{copy('Dein Plan startet auf diesem Gerät.', 'Your plan starts on this device.')}</h1>
        <p className="local-lead">{copy(
          'Es gibt kein Konto, Passwort, keine E-Mail-Bestätigung und keine Cloud-Synchronisierung. Dein Profil bleibt in diesem Browser, bis du es löschst oder exportierst.',
          'No account, password, email verification, or cloud sync is used. Your profile stays in this browser until you clear or export it.',
        )}</p>
        <div className="local-trust-grid" aria-label={copy('Details zum lokalen Bereich', 'Local workspace details')}>
          <div><strong>{copy('Standardmäßig privat', 'Private by default')}</strong><span>{copy('Plan und Protokolle bleiben in diesem Browser.', 'Your plan and logs stay in this browser.')}</span></div>
          <div><strong>{copy('Ehrliche Planung', 'Honest planning')}</strong><span>{copy('KI wird nur mit verbundenem Dienst und deiner Einwilligung genutzt.', 'AI is used only when a real service is connected and you consent.')}</span></div>
          <div><strong>{copy('Später übertragbar', 'Portable later')}</strong><span>{copy('Ein Gerätewechsel überträgt diese Daten noch nicht.', 'Changing devices does not move this data yet.')}</span></div>
        </div>
        <div className="local-welcome-actions">
          {hasProfile && <button className="local-secondary" type="button" onClick={continueLocal}>{copy('Lokalen Bereich fortsetzen', 'Continue local workspace')}</button>}
          <button className="local-primary" type="button" onClick={start}>{hasProfile ? copy('Profil neu erstellen oder ersetzen', 'Create or replace profile') : copy('Lokales Profil einrichten', 'Set up local profile')}</button>
        </div>
      </div>
    </section>
  );
}

/** Compatibility export while the app shell removes the legacy route name. */
export function LoginScreen(props: OfflineProfileWelcomeProps = {}) {
  return <OfflineProfileWelcome {...props} />;
}

/** Compatibility export: verification is intentionally no longer simulated. */
export function VerifyScreen(props: OfflineProfileWelcomeProps = {}) {
  return <OfflineProfileWelcome {...props} />;
}

function legacyGoal(goal: TrainingGoal): 'bulk' | 'cut' | 'perf' {
  if (goal === 'build_muscle') return 'bulk';
  if (goal === 'fat_loss') return 'cut';
  return 'perf';
}

function persistLocalResult({ input, plan, profile }: OnboardingCompletePayload): void {
  const savedAt = new Date().toISOString();
  const canonicalProfile = profile ?? userProfileFromPlanInput(input, { gender: 'm' });
  saveUserProfile(canonicalProfile);
  S.del('auth');
  S.del('session');
  S.del('_pending');
  S.set('macros', {
    kcal: plan.nutritionTargets.calories,
    prot: plan.nutritionTargets.protein,
    carb: plan.nutritionTargets.carbs,
    fat: plan.nutritionTargets.fat,
    sug: plan.nutritionTargets.sugar,
  });
  S.set('nutrition_targets_v2', plan.nutritionTargets);
  S.set('profile', {
    firstName: canonicalProfile.displayName,
    age: canonicalProfile.age,
    height: canonicalProfile.heightCm,
    weight: canonicalProfile.weightKg,
    goal: legacyGoal(canonicalProfile.goal),
    trainingGoal: canonicalProfile.goal,
    experience: canonicalProfile.experience,
    daysPerWeek: canonicalProfile.daysPerWeek,
    equipment: canonicalProfile.equipment,
    diet: canonicalProfile.diet,
    dietaryPreferences: canonicalProfile.dietaryPreferences,
    difficulty: canonicalProfile.difficulty,
    mode: canonicalProfile.mode,
    inspirationProfile: canonicalProfile.inspirationProfile,
    gender: canonicalProfile.gender,
    lifestyle: canonicalProfile.lifestyle,
    avatarIdx: canonicalProfile.appearance?.avatarIndex ?? 0,
    avatarPhoto: canonicalProfile.appearance?.avatarPhoto ?? null,
  });
  S.set('plan_preferences', {
    ...input,
    dietaryPreferences: canonicalProfile.dietaryPreferences,
    lifestyle: canonicalProfile.lifestyle,
  });
  S.set('initial_plan', { ...plan, createdAt: savedAt });
  replaceStarterWorkouts(plan, canonicalProfile.inspirationProfile, lang === 'de' ? 'de' : 'en');
  S.set('local_workspace', { schemaVersion: 1, profileSchemaVersion: canonicalProfile.schemaVersion, kind: 'offline-local', savedAt });
  if (S.get('protocol') === null) S.set('protocol', []);
}

export function OnboardScreen({ onComplete, onAiPlanRequest, onAiConsentChange }: OnboardScreenProps = {}) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<PlanMode>('inspiration');
  const [inspirationProfile, setInspirationProfile] = useState<InspirationProfileId | undefined>();
  const [systemProfile, setSystemProfile] = useState<InspirationProfileId | null>(null);
  const [equippedCharacter, setEquippedCharacter] = useState<InspirationProfileId | null>(() => {
    const stored = S.get<InspirationProfileId>(CHARACTER_EQUIP_STORAGE_KEY);
    return getCharacterPath(stored ?? undefined) ? stored : null;
  });
  const [gender, setGender] = useState<ProfileGender>('m');
  const [difficulty, setDifficulty] = useState<PlanDifficulty>('medium');
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [experience, setExperience] = useState<ExperienceLevel>('beginner');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [equipment, setEquipment] = useState<EquipmentOption[]>(['bodyweight']);
  const [diet, setDiet] = useState<DietPreference>('flexible');
  const [goal, setGoal] = useState<TrainingGoal>('general_fitness');
  const [lifestyleDraft, setLifestyleDraft] = useState<LifestyleDraft>(EMPTY_LIFESTYLE);
  const [errors, setErrors] = useState<PlanErrors>({});
  const [lifestyleErrors, setLifestyleErrors] = useState<LifestyleErrors>({});
  const [aiConsent, setAiConsent] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationNote, setGenerationNote] = useState('');
  const [generationOrigin, setGenerationOrigin] = useState<PlanGenerationOrigin>('local-rules');
  const [plan, setPlan] = useState<InitialPlan | null>(null);
  const [foodPlanChoice, setFoodPlanChoice] = useState<CharacterFoodPlanChoice | null>(null);
  const [foodPlanError, setFoodPlanError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { headingRef.current?.focus(); }, [step]);

  useModalIsolation(Boolean(systemProfile), {
    backgroundSelectors: ['.onboarding-shell'],
    onEscape: () => setSystemProfile(null),
  });

  const input = useMemo<PlanInput>(() => ({
    mode,
    inspirationProfile: mode === 'inspiration' ? inspirationProfile : undefined,
    displayName,
    age: Number(age),
    heightCm: Number(heightCm),
    weightKg: Number(weightKg),
    experience,
    daysPerWeek,
    equipment,
    diet,
    goal,
    difficulty,
  }), [mode, inspirationProfile, displayName, age, heightCm, weightKg, experience, daysPerWeek, equipment, diet, goal, difficulty]);

  const previewProfile = useMemo(() => userProfileFromPlanInput(input, {
    gender,
    dietaryPreferences: stringList(lifestyleDraft.dietaryPreferences),
    lifestyle: lifestyleFromDraft(lifestyleDraft),
  }), [gender, input, lifestyleDraft]);

  const characterFoodPlan = useMemo(() => (
    plan && mode === 'inspiration' && inspirationProfile
      ? buildCharacterFoodPlan(inspirationProfile, previewProfile, plan.nutritionTargets, lang === 'de' ? 'de' : 'en')
      : null
  ), [inspirationProfile, mode, plan, previewProfile]);

  useEffect(() => {
    setFoodPlanChoice(null);
    setFoodPlanError('');
  }, [inspirationProfile]);

  const updateLifestyle = <K extends keyof LifestyleDraft>(key: K, value: LifestyleDraft[K]) => {
    setLifestyleDraft((current) => ({ ...current, [key]: value }));
    setLifestyleErrors((current) => ({ ...current, [key]: undefined }));
  };

  const chooseMode = (next: PlanMode) => {
    setMode(next);
    setErrors({});
    setGenerationNote('');
    if (next !== 'inspiration') setInspirationProfile(undefined);
    if (next === 'own' && aiConsent) {
      setAiConsent(false);
      onAiConsentChange?.(false);
    }
  };

  const nextFromMode = () => {
    if (mode === 'inspiration' && !inspirationProfile) {
      setErrors({ inspirationProfile: copy('Wähle einen Charakterpfad.', 'Choose a character path.') });
      return;
    }
    if (mode === 'inspiration' && inspirationProfile !== equippedCharacter) {
      setSystemProfile(inspirationProfile || null);
      return;
    }
    setErrors({});
    setStep(2);
  };

  const nextFromBasics = () => {
    const result = validatePlanInput(input);
    setErrors(localizedPlanErrors(result.errors));
    if (!result.valid) return;
    setStep(3);
  };

  const preview = async () => {
    const inputResult = validatePlanInput(input);
    const nextLifestyleErrors = validateLifestyle(lifestyleDraft);
    setErrors(localizedPlanErrors(inputResult.errors));
    setLifestyleErrors(nextLifestyleErrors);
    if (!inputResult.valid || Object.keys(nextLifestyleErrors).length > 0) return;

    const profile = userProfileFromPlanInput(input, {
      gender,
      dietaryPreferences: stringList(lifestyleDraft.dietaryPreferences),
      lifestyle: lifestyleFromDraft(lifestyleDraft),
    });
    const nutritionTargets = calculateNutritionTargetsForProfile(profile, lang === 'de' ? 'de' : 'en');
    let nextPlan: InitialPlan | null = null;
    let nextOrigin: PlanGenerationOrigin = 'local-rules';
    let nextNote = copy('Diese Vorschau wurde auf diesem Gerät mit transparenten lokalen Regeln erstellt.', 'This preview was built on this device with transparent local rules.');

    setIsGenerating(true);
    setGenerationNote('');
    if (mode !== 'own' && onAiPlanRequest && aiConsent && input.age >= 18) {
      const { displayName: _displayName, appearance: _appearance, ...context } = profile;
      try {
        const remotePlan = await onAiPlanRequest({
          context,
          consentedAt: new Date().toISOString(),
          responseLanguage: lang === 'de' ? 'de' : 'en',
        });
        if (isUsablePlan(remotePlan)) {
          nextPlan = { ...remotePlan, nutritionTargets };
          nextOrigin = 'remote-ai';
          nextNote = copy('Diese Vorschau kam nach deiner einmaligen Einwilligung vom verbundenen KI-Dienst zurück.', 'This preview was returned by the connected AI service after your one-time consent.');
        } else {
          nextNote = copy('Der KI-Dienst lieferte keinen verwendbaren Plan. Diese Vorschau wurde stattdessen mit lokalen Regeln erstellt.', 'The AI service returned no usable plan. This preview was built with local rules instead.');
        }
      } catch {
        nextNote = copy('Der KI-Dienst war nicht verfügbar. Diese Vorschau wurde mit lokalen Regeln erstellt; kein lokales Ergebnis wird als KI ausgegeben.', 'The AI service was unavailable. This preview was built with local rules; no remote result is presented as AI.');
      }
    } else if (mode !== 'own' && input.age < 18) {
      nextNote = copy('Die KI-Planung ist in dieser Version auf Erwachsene beschränkt. Diese Vorschau wurde lokal erstellt.', 'AI planning is limited to adults in this build. This preview was built locally.');
    } else if (mode !== 'own' && !onAiPlanRequest) {
      nextNote = copy('In dieser Version ist kein KI-Dienst verbunden. Diese Vorschau wurde lokal erstellt.', 'No AI service is connected in this build. This preview was built locally.');
    } else if (mode !== 'own' && !aiConsent) {
      nextNote = copy('Du hast keiner entfernten Anfrage zugestimmt. Diese Vorschau wurde lokal erstellt.', 'You did not consent to a remote request. This preview was built locally.');
    }

    if (!nextPlan) nextPlan = generateInitialPlan(input, lang === 'de' ? 'de' : 'en', {
      gender: profile.gender,
      activityLevel: profile.lifestyle.activityLevel,
      activityContext: profile.lifestyle.activityContext,
    });
    setPlan(nextPlan);
    setFoodPlanChoice(null);
    setFoodPlanError('');
    setGenerationOrigin(nextOrigin);
    setGenerationNote(nextNote);
    setIsGenerating(false);
    setStep(4);
  };

  const finish = async () => {
    if (!plan) return;
    if (characterFoodPlan && !foodPlanChoice) {
      setFoodPlanError(copy(
        'Wähle zuerst den empfohlenen Food-Plan oder bestätige, dass du deinen eigenen nutzt.',
        'Choose the recommended food plan or confirm that you use your own first.',
      ));
      return;
    }
    const profile = userProfileFromPlanInput(input, {
      gender,
      dietaryPreferences: stringList(lifestyleDraft.dietaryPreferences),
      lifestyle: lifestyleFromDraft(lifestyleDraft),
    });
    const payload: OnboardingCompletePayload = { input, plan, profile, generationOrigin };
    setIsSaving(true);
    if (characterFoodPlan && foodPlanChoice) saveCharacterFoodPlanChoice(characterFoodPlan, foodPlanChoice);
    if (onComplete) onComplete(payload);
    else {
      persistLocalResult(payload);
      showScreen('dashboard');
    }
    setIsSaving(false);
  };

  const toggleEquipment = (item: EquipmentOption) => {
    setEquipment((current) => current.includes(item)
      ? current.filter((value) => value !== item)
      : [...current, item]);
    setErrors((current) => ({ ...current, equipment: undefined }));
  };

  const handleConsent = (checked: boolean) => {
    setAiConsent(checked);
    onAiConsentChange?.(checked);
  };

  const firstError = Object.values(errors)[0] ?? Object.values(lifestyleErrors)[0];
  const aiEligible = input.age >= 18;
  const bmi = bmiSnapshot(input.heightCm, input.weightKg);
  const averageWorkoutMinutes = plan?.sessions.length
    ? Math.round(plan.sessions.reduce((sum, session) => sum + session.durationMinutes, 0) / plan.sessions.length)
    : 0;
  const restSeconds = difficulty === 'light' ? 60 : difficulty === 'hard' ? 120 : 90;
  const hydrationLiters = input.weightKg > 0 ? Math.round(input.weightKg * 0.033 * 10) / 10 : 0;

  return (
    <section className="screen active onboarding-screen" id="screen-onboard" aria-labelledby="onboarding-title">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <p className="local-kicker">CORELINE / {copy('STARTPLAN', 'STARTER PLAN')}</p>
            <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>{stepTitle(step)}</h1>
          </div>
          <span className="onboarding-step">{step} / {TOTAL_STEPS}</span>
        </header>
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label={copy('Fortschritt der Ersteinrichtung', 'Onboarding progress')}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
        >
          <span style={{ transform: `scaleX(${step / TOTAL_STEPS})` }} />
        </div>
        {firstError && <p className="onboarding-error" role="alert">{copy('Prüfe das markierte Feld:', 'Check the highlighted field:')} {firstError}</p>}

        {step === 1 && <>
          <section className="onboarding-system-intro">
            <span><SystemIcon name="spark" />{copy('ERSTE AKTIVIERUNG', 'FIRST ACTIVATION')}</span>
            <h2>{copy('Wie soll CORELINE dich aufbauen?', 'How should CORELINE build your plan?')}</h2>
            <p>{copy('Du entscheidest zuerst den Trainingsweg. Ein Charakterpfad ersetzt Standardpläne vollständig und wird in der Einrichtung nur einmal als System-Vertrag bestätigt.', 'Choose your training route first. A character path completely replaces standard plans and appears once during setup as a System Contract.')}</p>
          </section>
          <fieldset className="onboarding-fieldset">
            <legend>{copy('Dein Systemmodus', 'Your system mode')}</legend>
            <div className="onboarding-choice-grid">
              {PLAN_MODE_OPTIONS.map((option) => {
                const optionCopy = modeCopy(option.id);
                return (
                  <button type="button" key={option.id} className={mode === option.id ? 'selected' : ''} aria-pressed={mode === option.id} onClick={() => chooseMode(option.id)}>
                    <SystemIcon name={option.id === 'inspiration' ? 'spark' : option.id === 'guided' ? 'assistant' : 'target'} />
                    <strong>{optionCopy.label}</strong>
                    <span>{optionCopy.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {mode === 'inspiration' && <fieldset className="onboarding-fieldset character-path-fieldset">
            <legend>{copy('Exklusiven Charakterpfad wählen', 'Choose an exclusive character path')}</legend>
            <p className="onboarding-hint">{copy('Originale CORELINE-Illustrationen visualisieren den jeweiligen Trainings-Archetyp. Die Pläne sind sichere Fitnessinterpretationen, keine offiziellen oder kanonischen Routinen.', 'Original CORELINE illustrations visualize each training archetype. Plans are safe fitness interpretations, not official or canon routines.')}</p>
            <div className="onboarding-profile-grid character-path-grid">
              {INSPIRATION_PROFILES.map((profile) => {
                const localized = inspirationCopy(profile.id);
                return (
                  <button type="button" key={profile.id} className={inspirationProfile === profile.id ? 'selected' : ''} aria-pressed={inspirationProfile === profile.id} onClick={() => {
                    setInspirationProfile(profile.id);
                    setErrors(current => ({ ...current, inspirationProfile: undefined }));
                  }}>
                    <img src={characterArt(profile.id)} alt="" loading="lazy" />
                    <span className="character-path-shade" aria-hidden="true" />
                    <span className="character-path-copy">
                      <small>{copy('CHARAKTERPFAD', 'CHARACTER PATH')}</small>
                      <strong>{profile.name}</strong>
                      <em>{localized.tagline}</em>
                      <span>{localized.description}</span>
                    </span>
                    {inspirationProfile === profile.id && <span className="character-path-selected"><SystemIcon name="check" />{copy('GEWÄHLT', 'SELECTED')}</span>}
                  </button>
                );
              })}
            </div>
            <FieldError id="inspiration-error" message={errors.inspirationProfile} />
          </fieldset>}
          <div className="onboarding-actions"><button className="local-primary" type="button" onClick={nextFromMode}>{mode === 'inspiration' ? copy('System-Vertrag öffnen', 'Open System Contract') : copy('Weiter', 'Continue')}</button></div>
        </>}

        {step === 2 && <>
          <p className="onboarding-section-intro">{copy('Diese Grenzen halten die erste Woche realistisch. Sie werden erst beim Speichern lokal übernommen.', 'These boundaries keep the first week realistic. They are stored locally only when you save.')}</p>
          <div className="onboarding-form-grid">
            <fieldset className="onboarding-gender-field onboarding-span-2">
              <legend>{copy('Körpermodell', 'Body model')}</legend>
              <div className="onboarding-gender-options">
                {([
                  ['m', copy('Männliche Figur', 'Male figure')],
                  ['f', copy('Weibliche Figur', 'Female figure')],
                  ['x', copy('Neutrale Figur', 'Neutral figure')],
                ] as Array<[ProfileGender, string]>).map(([value, label]) => (
                  <button key={value} type="button" className={gender === value ? 'selected' : ''} aria-pressed={gender === value} onClick={() => setGender(value)}>
                    <SystemIcon name="profile" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <small>{copy('Diese Auswahl steuert direkt das Modell in der Muskelkarte.', 'This choice directly controls the model in the muscle map.')}</small>
            </fieldset>
            <label>
              Name
              <input value={displayName} maxLength={PROFILE_LIMITS.displayName} autoComplete="name" required onChange={(event) => { setDisplayName(event.target.value); setErrors((current) => ({ ...current, displayName: undefined })); }} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'name-error' : undefined} />
              <FieldError id="name-error" message={errors.displayName} />
            </label>
            <label>
              {copy('Alter', 'Age')}
              <input type="number" inputMode="numeric" min="16" max="85" value={age} required onChange={(event) => { setAge(event.target.value); setErrors((current) => ({ ...current, age: undefined })); }} aria-invalid={Boolean(errors.age)} aria-describedby={errors.age ? 'age-error' : undefined} />
              <FieldError id="age-error" message={errors.age} />
            </label>
            <label>
              {copy('Größe (cm)', 'Height (cm)')}
              <input type="number" inputMode="decimal" min="120" max="230" step="0.1" value={heightCm} required onChange={(event) => { setHeightCm(event.target.value); setErrors((current) => ({ ...current, heightCm: undefined })); }} aria-invalid={Boolean(errors.heightCm)} aria-describedby={errors.heightCm ? 'height-error' : undefined} />
              <FieldError id="height-error" message={errors.heightCm} />
            </label>
            <label>
              {copy('Gewicht (kg)', 'Weight (kg)')}
              <input type="number" inputMode="decimal" min="35" max="250" step="0.1" value={weightKg} required onChange={(event) => { setWeightKg(event.target.value); setErrors((current) => ({ ...current, weightKg: undefined })); }} aria-invalid={Boolean(errors.weightKg)} aria-describedby={errors.weightKg ? 'weight-error' : undefined} />
              <FieldError id="weight-error" message={errors.weightKg} />
            </label>
            <label>{copy('Trainingserfahrung', 'Training experience')}<select value={experience} onChange={(event) => setExperience(event.target.value as ExperienceLevel)}>{EXPERIENCE.map((item) => <option key={item.id} value={item.id}>{experienceLabel(item.id)}</option>)}</select></label>
            <label>{copy('Verfügbare Tage', 'Available days')}<select value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((days) => <option key={days} value={days}>{copy(`${days} Tage pro Woche`, `${days} days per week`)}</option>)}</select></label>
            <label>{copy('Hauptziel', 'Primary goal')}<select value={goal} onChange={(event) => setGoal(event.target.value as TrainingGoal)}>{GOALS.map((item) => <option key={item.id} value={item.id}>{goalLabel(item.id)}</option>)}</select></label>
          </div>
          <fieldset className="onboarding-fieldset">
            <legend>{copy('Verfügbare Ausstattung', 'Available equipment')}</legend>
            <div className="onboarding-check-grid">{EQUIPMENT_OPTIONS.map((item) => <label key={item.id}><input type="checkbox" checked={equipment.includes(item.id)} onChange={() => toggleEquipment(item.id)} />{equipmentLabel(item.id)}</label>)}</div>
            <FieldError id="equipment-error" message={errors.equipment} />
          </fieldset>
          <fieldset className="onboarding-fieldset">
            <legend>{copy('Startintensität', 'Starting intensity')}</legend>
            <div className="onboarding-difficulty">
              {DIFFICULTIES.map((item) => {
                const localized = difficultyCopy(item.id);
                return <button type="button" key={item.id} className={difficulty === item.id ? 'selected' : ''} aria-pressed={difficulty === item.id} onClick={() => setDifficulty(item.id)}><strong>{localized.label}</strong><span>{localized.detail}</span></button>;
              })}
            </div>
          </fieldset>
          <div className="onboarding-actions"><button className="local-secondary" type="button" onClick={() => setStep(1)}>{copy('Zurück', 'Back')}</button><button className="local-primary" type="button" onClick={nextFromBasics}>{copy('Weiter', 'Continue')}</button></div>
        </>}

        {step === 3 && <>
          <p className="onboarding-section-intro">{copy('Teile nur Angaben, die du für die Planung verwenden möchtest. Freitext bleibt lokal, solange du der KI-Anfrage unten nicht ausdrücklich zustimmst.', 'Share only what you are comfortable using for planning. Free-text context stays local unless you explicitly approve the AI request below.')}</p>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>{copy('Tagesablauf und Bewegung', 'Schedule and daily movement')}</legend>
            <div className="onboarding-form-grid">
              <label className="onboarding-span-2">
                {copy('Aktivitätsstufe', 'Activity level')}
                <select value={lifestyleDraft.activityLevel} onChange={(event) => updateLifestyle('activityLevel', event.target.value as ActivityLevel)}>
                  {ACTIVITY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{copy(item.de, item.en)}</option>)}
                </select>
                <span className="onboarding-field-help">{copy('Wähle Bewegung außerhalb des geplanten Trainings. Trainingstage werden zusätzlich berücksichtigt.', 'Choose movement outside planned training. Training days are factored in separately.')}</span>
              </label>
              <details className="onboarding-optional-context onboarding-span-2">
                <summary><span><SystemIcon name="lifestyle" />{copy('Alltagsdetails hinzufügen', 'Add schedule details')}</span><SystemIcon name="chevron" /></summary>
                <div className="onboarding-form-grid">
                  <label>{copy('Arbeits- oder Lernrhythmus', 'Work or study pattern')}<input value={lifestyleDraft.workStudyPattern} maxLength={PROFILE_LIMITS.shortText} placeholder={copy('z. B. Büro, Schichtarbeit, Studium', 'e.g. desk job, rotating shifts, student')} onChange={(event) => updateLifestyle('workStudyPattern', event.target.value)} /></label>
                  <label>{copy('Bevorzugtes Trainingsfenster', 'Preferred training window')}<input value={lifestyleDraft.preferredTrainingWindow} maxLength={PROFILE_LIMITS.shortText} placeholder={copy('z. B. werktags nach 18:00', 'e.g. weekdays after 18:00')} onChange={(event) => updateLifestyle('preferredTrainingWindow', event.target.value)} /></label>
                  <label className="onboarding-span-2">{copy('Aktivität außerhalb des Trainings', 'Activity outside training')}<textarea value={lifestyleDraft.activityContext} maxLength={PROFILE_LIMITS.activityContext} rows={3} placeholder={copy('z. B. 8.000 Schritte, körperliche Arbeit, Fahrradweg', 'e.g. 8k steps, physical work, cycling commute')} onChange={(event) => updateLifestyle('activityContext', event.target.value)} /></label>
                  <label className="onboarding-span-2">{copy('Ein typischer Tag', 'A typical day')}<textarea value={lifestyleDraft.typicalDay} maxLength={PROFILE_LIMITS.typicalDay} rows={4} placeholder={copy('Optional: Arbeitszeiten, Wege, Verpflichtungen und Energieverlauf.', 'Optional: work hours, commute, responsibilities, and energy patterns.')} onChange={(event) => updateLifestyle('typicalDay', event.target.value)} /></label>
                </div>
              </details>
            </div>
          </fieldset>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>{copy('Schlaf und Erholung', 'Sleep and recovery')}</legend>
            <div className="onboarding-form-grid">
              <label>
                {copy('Typische Schlafdauer', 'Typical sleep duration')}
                <input type="number" inputMode="decimal" min="0" max="16" step="0.25" value={lifestyleDraft.sleepDurationHours} placeholder={copy('Stunden', 'hours')} onChange={(event) => updateLifestyle('sleepDurationHours', event.target.value)} aria-invalid={Boolean(lifestyleErrors.sleepDurationHours)} aria-describedby={lifestyleErrors.sleepDurationHours ? 'sleep-error' : undefined} />
                <FieldError id="sleep-error" message={lifestyleErrors.sleepDurationHours} />
              </label>
              <label>{copy('Schlafqualität', 'Sleep quality')}<select value={lifestyleDraft.sleepQuality} onChange={(event) => updateLifestyle('sleepQuality', event.target.value as LifestyleDraft['sleepQuality'])}><option value="">{copy('Keine Angabe', 'Prefer not to say')}</option>{SLEEP_QUALITY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{sleepQualityLabel(item.id)}</option>)}</select></label>
              <details className="onboarding-optional-context onboarding-span-2">
                <summary><span><SystemIcon name="shield" />{copy('Erholung oder Einschränkungen ergänzen', 'Add recovery or limitations')}</span><SystemIcon name="chevron" /></summary>
                <div className="onboarding-form-grid">
                  <label className="onboarding-span-2">{copy('Stress- und Erholungskontext', 'Stress and recovery context')}<textarea value={lifestyleDraft.stressRecovery} maxLength={PROFILE_LIMITS.healthContext} rows={3} placeholder={copy('z. B. aktuell hoher Arbeitsstress, ruhigere Wochenenden', 'e.g. high work stress this month, weekends are more restful')} onChange={(event) => updateLifestyle('stressRecovery', event.target.value)} /></label>
                  <label className="onboarding-span-2">{copy('Grenzen, Zugangsbedürfnisse oder Verletzungen', 'Limitations, access needs or injuries')}<textarea value={lifestyleDraft.injuriesLimitations} maxLength={PROFILE_LIMITS.healthContext} rows={3} placeholder={copy('Nur dein eigener Kontext – keine Diagnose oder Behandlung.', 'Your context only — no diagnosis or treatment.')} onChange={(event) => updateLifestyle('injuriesLimitations', event.target.value)} /><span className="onboarding-field-help">{copy('Bei Schmerzen oder Verletzungen hole qualifizierte Beratung ein.', 'For pain or injuries, seek qualified guidance.')}</span></label>
                </div>
              </details>
            </div>
          </fieldset>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>{copy('Essensroutine', 'Food routine')}</legend>
            <div className="onboarding-form-grid">
              <label>{copy('Ernährungsform', 'Diet preference')}<select value={diet} onChange={(event) => setDiet(event.target.value as DietPreference)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{dietLabel(item.id)}</option>)}</select></label>
              <label>{copy('Kochmöglichkeiten', 'Cooking access')}<select value={lifestyleDraft.cookingAccess} onChange={(event) => updateLifestyle('cookingAccess', event.target.value as LifestyleDraft['cookingAccess'])}><option value="">{copy('Keine Angabe', 'Prefer not to say')}</option>{COOKING_OPTIONS.map((item) => <option key={item.id} value={item.id}>{cookingLabel(item.id)}</option>)}</select></label>
              <details className="onboarding-optional-context onboarding-span-2">
                <summary><span><SystemIcon name="food" />{copy('Essensdetails ergänzen', 'Add food details')}</span><SystemIcon name="chevron" /></summary>
                <div className="onboarding-form-grid">
                  <label className="onboarding-span-2">{copy('Mahlzeitenrhythmus', 'Meal rhythm')}<textarea value={lifestyleDraft.mealRhythm} maxLength={PROFILE_LIMITS.mealRhythm} rows={3} placeholder={copy('z. B. schnelles Frühstück, Kantinenessen, Abendessen zu Hause', 'e.g. quick breakfast, canteen lunch, dinner at home')} onChange={(event) => updateLifestyle('mealRhythm', event.target.value)} /></label>
                  <label>{copy('Weitere Präferenzen', 'Other preferences')}<input value={lifestyleDraft.dietaryPreferences} maxLength={640} placeholder={copy('durch Kommas getrennt', 'comma-separated')} onChange={(event) => updateLifestyle('dietaryPreferences', event.target.value)} /></label>
                  <label>{copy('Allergien oder Ausschlüsse', 'Allergies or exclusions')}<input value={lifestyleDraft.allergiesExclusions} maxLength={640} placeholder={copy('durch Kommas getrennt', 'comma-separated')} onChange={(event) => updateLifestyle('allergiesExclusions', event.target.value)} /></label>
                </div>
              </details>
            </div>
          </fieldset>

          {mode !== 'own' && <section className="onboarding-ai-panel" aria-labelledby="ai-consent-title">
            <div className="onboarding-ai-heading">
              <div>
                <span>{onAiPlanRequest ? copy('KI-Verbindung verfügbar', 'AI bridge available') : copy('Lokaler Fallback aktiv', 'Local fallback active')}</span>
                <h2 id="ai-consent-title">{copy('Einwilligung für den KI-Plan', 'AI Plan consent')}</h2>
              </div>
              <strong>{onAiPlanRequest && aiEligible ? copy('OPTIONAL', 'OPTIONAL') : copy('NUR LOKAL', 'LOCAL ONLY')}</strong>
            </div>
            {!onAiPlanRequest && <p>{copy('In dieser Version ist kein KI-Dienst verbunden. Mit dem transparenten lokalen Generator kannst du trotzdem einen vollständigen Plan erstellen.', 'No AI service is connected in this build. You can still create a complete plan with the transparent local generator.')}</p>}
            {onAiPlanRequest && !aiEligible && <p>{copy('Die entfernte KI-Funktion ist in dieser Version auf Erwachsene beschränkt. Dein Plan wird lokal erzeugt.', 'The remote AI route is limited to adults in this build. Your plan will be generated locally.')}</p>}
            {onAiPlanRequest && aiEligible && <>
              <p>{copy('Wenn aktiviert, enthält eine Anfrage Alter, Größe, Gewicht, Ziel, Intensität, Erfahrung, verfügbare Tage, Ausstattung, Ernährungsform und den oben eingegebenen Alltagstext. Name, Adresse sowie Trainings-, Essens- und Supplement-Protokolle bleiben ausgeschlossen.', 'If enabled, one request contains age, height, weight, goal, intensity, experience, available days, equipment, diet and the lifestyle text entered above. It excludes your name, address, workout logs, food logs and supplement logs.')}</p>
              <label className="onboarding-consent">
                <input type="checkbox" checked={aiConsent} onChange={(event) => handleConsent(event.target.checked)} />
                <span>{copy('Ich stimme zu, diesen aufgeführten Kontext einmalig an den konfigurierten KI-Dienst zu senden, um meine Vorschau zu erstellen. Ohne Einwilligung kann ich mit lokalen Regeln fortfahren.', 'I agree to send this listed context once to the configured AI service to create my preview. I can continue without consenting by using local rules.')}</span>
              </label>
            </>}
            <p className="onboarding-ai-safety">{copy('Das Ergebnis ist allgemeine Fitness- und Ernährungsplanung, keine medizinische Beratung. Es erstellt keine Supplement-Dosierungen und diagnostiziert keine Erkrankungen.', 'The result is general fitness and food-planning support, not medical advice. It will not create supplement doses or diagnose conditions.')}</p>
          </section>}

          <div className="onboarding-actions">
            <button className="local-secondary" type="button" onClick={() => setStep(2)} disabled={isGenerating}>{copy('Zurück', 'Back')}</button>
            <button className="local-primary" type="button" onClick={() => void preview()} disabled={isGenerating}>{isGenerating ? copy('Vorschau wird erstellt …', 'Building preview…') : mode !== 'own' && onAiPlanRequest && aiConsent && aiEligible ? copy('KI-Vorschau erzeugen', 'Generate AI preview') : copy('Lokale Vorschau erstellen', 'Build local preview')}</button>
          </div>
          <p className="onboarding-generation-status" aria-live="polite">{isGenerating ? copy('Dein Plan wird erstellt. Lasse diese Seite geöffnet.', 'Generating your plan. Keep this page open.') : ''}</p>
        </>}

        {step === 4 && plan && <>
          <div className="onboarding-result-hero">
            {mode === 'inspiration' && inspirationProfile && <img src={characterArt(inspirationProfile)} alt="" />}
            <span aria-hidden="true" />
            <div>
              <small>{generationOrigin === 'remote-ai' ? copy('ECHTE KI · BERECHNET', 'REAL AI · CALCULATED') : copy('LOKALES SYSTEM · BERECHNET', 'LOCAL SYSTEM · CALCULATED')}</small>
              <h2>{mode === 'inspiration' && inspirationProfile ? `${getCharacterPath(inspirationProfile)?.name} Path` : plan.emphasis}</h2>
              <p>{plan.daysPerWeek} {copy('Einheiten pro Woche', 'sessions per week')} · {difficultyCopy(plan.difficulty).label} · {experienceLabel(plan.experience)}</p>
            </div>
          </div>
          <p className="onboarding-generation-note" role="status">{generationNote}</p>

          <section className="onboarding-result-stats" aria-label={copy('Körper- und Aktivitätswerte', 'Body and activity stats')}>
            <article><small>{copy('KÖRPERDATEN', 'BODY DATA')}</small><strong>{input.weightKg.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')} kg</strong><span>{input.heightCm.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')} cm · {input.age} {copy('Jahre', 'years')}</span></article>
            <article className={`bmi-${bmi?.level || 'healthy'}`}><small>BMI {copy('REFERENZ', 'REFERENCE')}</small><strong>{bmi?.value.toFixed(1) || '—'}</strong><span>{bmi?.label || copy('Nicht verfügbar', 'Unavailable')}</span></article>
            <article><small>{copy('FITNESSSTUFE', 'FITNESS LEVEL')}</small><strong>{experienceLabel(experience)}</strong><span>{activityLabel(lifestyleDraft.activityLevel)}</span></article>
            <article><small>{copy('HAUPTZIEL', 'PRIMARY GOAL')}</small><strong>{goalLabel(goal)}</strong><span>{gender === 'f' ? copy('Weibliches Muskelmodell', 'Female muscle model') : gender === 'm' ? copy('Männliches Muskelmodell', 'Male muscle model') : copy('Neutrales Muskelmodell', 'Neutral muscle model')}</span></article>
          </section>
          <p className="onboarding-bmi-note">{copy('BMI ist nur ein grober Screening-Referenzwert und unterscheidet nicht zwischen Muskel- und Fettmasse.', 'BMI is only a rough screening reference and does not distinguish muscle from fat mass.')}</p>

          <section className="onboarding-nutrition" aria-labelledby="nutrition-target-title">
            <div><span>{copy('TÄGLICHES ENERGIEZIEL', 'DAILY ENERGY TARGET')}</span><strong id="nutrition-target-title">{plan.nutritionTargets.calories} kcal</strong></div>
            <dl>
              <div><dt>Protein</dt><dd>{plan.nutritionTargets.protein}g</dd></div>
              <div><dt>{copy('Kohlenhydrate', 'Carbs')}</dt><dd>{plan.nutritionTargets.carbs}g</dd></div>
              <div><dt>{copy('Fett', 'Fat')}</dt><dd>{plan.nutritionTargets.fat}g</dd></div>
              <div><dt>{copy('Zielanpassung', 'Goal adjustment')}</dt><dd>{typeof plan.nutritionTargets.goalAdjustmentCalories === 'number' ? `${plan.nutritionTargets.goalAdjustmentCalories > 0 ? '+' : ''}${plan.nutritionTargets.goalAdjustmentCalories}` : '—'} kcal</dd></div>
            </dl>
            <p>{plan.nutritionTargets.note}</p>
          </section>

          {characterFoodPlan && <section className="onboarding-food-protocol" aria-labelledby="character-food-plan-title">
            <header>
              <span><SystemIcon name="food" />{copy('FUEL-PROTOKOLL FREIGESCHALTET', 'FUEL PROTOCOL UNLOCKED')}</span>
              <small>{characterFoodPlan.characterName} Path</small>
            </header>
            <div className="onboarding-food-protocol-copy">
              <h3 id="character-food-plan-title">{characterFoodPlan.title}</h3>
              <p>{characterFoodPlan.focus}</p>
            </div>
            <div className="onboarding-food-plan-meals">
              {characterFoodPlan.meals.map(meal => <article key={meal.slot}>
                <span>{mealSlotLabel(meal.slot)}</span>
                <strong>{meal.title}</strong>
                <small>{portionLabel(meal.portions)} · {meal.nutrition.kcal} kcal · {Math.round(meal.nutrition.prot)} g Protein</small>
              </article>)}
            </div>
            <div className="onboarding-food-plan-total">
              <span><small>{copy('PLAN-SUMME', 'PLAN TOTAL')}</small><strong>{characterFoodPlan.plannedNutrition.kcal} kcal</strong></span>
              <span><small>{copy('DEIN ZIEL', 'YOUR TARGET')}</small><strong>{characterFoodPlan.targetCalories} kcal</strong></span>
              <span><small>Protein</small><strong>{Math.round(characterFoodPlan.plannedNutrition.prot)} / {characterFoodPlan.targetProtein} g</strong></span>
            </div>
            <p className="onboarding-food-plan-note">{copy(
              'Die Portionsvorschläge sind ein anpassbarer Tagesrahmen aus geprüften Rezepten – keine bereits gegessenen Mahlzeiten. Allergien und Ausschlüsse haben immer Vorrang.',
              'Portion suggestions are an adjustable daily template from reviewed recipes — not meals already logged as eaten. Allergies and exclusions always take priority.',
            )}</p>
            <div className="onboarding-food-plan-choice" role="group" aria-label={copy('Food-Plan auswählen', 'Choose food plan')}>
              <button
                type="button"
                className={foodPlanChoice === 'accepted' ? 'selected' : ''}
                aria-pressed={foodPlanChoice === 'accepted'}
                onClick={() => { setFoodPlanChoice('accepted'); setFoodPlanError(''); }}
              ><SystemIcon name="check" /><span><strong>{copy('Plan annehmen', 'Accept food plan')}</strong><small>{copy('Im Ernährungsbereich ausrüsten', 'Equip it in Nutrition')}</small></span></button>
              <button
                type="button"
                className={foodPlanChoice === 'own-plan' ? 'selected' : ''}
                aria-pressed={foodPlanChoice === 'own-plan'}
                onClick={() => { setFoodPlanChoice('own-plan'); setFoodPlanError(''); }}
              ><SystemIcon name="edit" /><span><strong>{copy('Nein, eigener Plan', 'No, I use my own')}</strong><small>{copy('Nur Ziele und Rezepte behalten', 'Keep targets and recipes only')}</small></span></button>
            </div>
            {foodPlanError && <p className="onboarding-field-error onboarding-food-plan-error" role="alert">{foodPlanError}</p>}
          </section>}

          <section className="onboarding-result-goals" aria-label={copy('Tägliche Empfehlungen', 'Daily recommendations')}>
            <article><SystemIcon name="water" /><strong>{hydrationLiters} L</strong><span>{copy('Hydration-Startwert', 'hydration starting point')}</span></article>
            <article><SystemIcon name="clock" /><strong>{averageWorkoutMinutes} min</strong><span>{copy('Ø Training', 'average workout')}</span></article>
            <article><SystemIcon name="history" /><strong>{restSeconds} sec</strong><span>{copy('Satzpause-Startwert', 'starting rest time')}</span></article>
            <article><SystemIcon name="calendar" /><strong>{plan.daysPerWeek}×</strong><span>{copy('pro Woche', 'per week')}</span></article>
          </section>
          <p className="onboarding-bmi-note">{copy('Hydration und Satzpausen sind anpassbare Startwerte. Wetter, Schweißrate, Übung und persönliche Bedürfnisse können sie verändern.', 'Hydration and rest times are adjustable starting points. Weather, sweat rate, exercise, and personal needs can change them.')}</p>

          <section className="onboarding-system-advice">
            <span><SystemIcon name="spark" />{copy('SYSTEM-RATSCHLAG', 'SYSTEM ADVICE')}</span>
            <h3>{copy('Dein nächster sinnvoller Schritt', 'Your next sensible step')}</h3>
            <p>{systemAdvice(goal)}</p>
          </section>

          <details className="onboarding-plan-disclosure">
            <summary><span><SystemIcon name="plan" /><strong>{copy('Erste Trainingswoche ansehen', 'View first training week')}</strong></span><SystemIcon name="chevron" /></summary>
            <div className="onboarding-plan-list">{plan.sessions.map((session) => <article key={session.day}><header><span>{copy('TAG', 'DAY')} {session.day}</span><strong>{session.focus}</strong><small>{copy('Etwa', 'About')} {session.durationMinutes} min</small></header><ul>{session.exercises.map((exercise) => <li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets} {copy('Sätze', 'sets')} / {exercise.reps} / {exercise.effort}</span></li>)}</ul></article>)}</div>
          </details>
          <details className="onboarding-plan-disclosure onboarding-safety-disclosure">
            <summary><span><SystemIcon name="shield" /><strong>{copy('Sicherheit & Grenzen', 'Safety & boundaries')}</strong></span><SystemIcon name="chevron" /></summary>
            <div className="onboarding-safety"><ul>{plan.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul><p>{copy('Es wird kein Supplement-Protokoll und keine Dosierung erstellt.', 'No supplement protocol or dose is created.')}</p></div>
          </details>
          <div className="onboarding-actions">
            <button className="local-secondary" type="button" onClick={() => setStep(3)} disabled={isSaving}>{copy('Angaben bearbeiten', 'Edit details')}</button>
            <button className="local-primary" type="button" onClick={() => void finish()} disabled={isSaving}>{isSaving ? copy('System wird aktiviert …', 'Activating system…') : copy('System aktivieren', 'Activate system')}</button>
          </div>
        </>}
      </div>
      {systemProfile && (() => {
        const character = getCharacterPath(systemProfile);
        if (!character) return null;
        return createPortal(
          <div className="character-system-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSystemProfile(null); }}>
            <section className="character-system-window" role="dialog" aria-modal="true" aria-labelledby="character-system-title" onMouseDown={event => event.stopPropagation()}>
              <header>
                <span><SystemIcon name="spark" />{copy('SYSTEM-VERTRAG', 'SYSTEM CONTRACT')}</span>
                <button type="button" onClick={() => setSystemProfile(null)} aria-label={copy('Nachricht schließen', 'Close message')}><SystemIcon name="close" /></button>
              </header>
              <div className="character-system-scroll">
              <div className="character-system-hero">
                <img src={characterArt(systemProfile)} alt="" />
                <span aria-hidden="true" />
                <small>{copy('EXKLUSIVER PFAD', 'EXCLUSIVE PATH')}</small>
              </div>
              <div className="character-system-copy">
                <small>{copy('INSPIRATION GEWÄHLT', 'INSPIRATION SELECTED')}</small>
                <h2 id="character-system-title">{character.name} — {localizedCharacterCopy(character.title, lang)}</h2>
                <p>{localizedCharacterCopy(character.focus, lang)}</p>
                <p>{localizedCharacterCopy(character.systemMessage, lang)}</p>
              </div>
              <div className="character-system-tags">
                {character.tags.map(tag => <span key={tag.en}>{localizedCharacterCopy(tag, lang)}</span>)}
              </div>
              <section className="character-system-unlocks" aria-label={copy('Freigeschaltete Empfehlungen', 'Unlocked recommendations')}>
                <h3>{copy('Freigeschaltete Empfehlungen', 'Unlocked recommendations')}</h3>
                {character.recommendations.slice(0, 3).map(item => (
                  <article key={item.id}>
                    <SystemIcon name="check" />
                    <span><strong>{localizedCharacterCopy(item.label, lang)}</strong><small>{localizedCharacterCopy(item.reason, lang)}</small></span>
                  </article>
                ))}
              </section>
              <p className="character-system-safety"><SystemIcon name="shield" />{copy(
                'Empfehlungen werden nur hervorgehoben. Es wird nichts gekauft und keine Dosierung erstellt.',
                'Recommendations are highlighted only. Nothing is purchased and no dose is created.',
              )}</p>
              </div>
              <button className="character-system-equip" type="button" onClick={() => {
                S.set(CHARACTER_EQUIP_STORAGE_KEY, systemProfile);
                setEquippedCharacter(systemProfile);
                setSystemProfile(null);
                setErrors({});
                setStep(2);
              }}><SystemIcon name="check" />{copy('Akzeptieren & ausrüsten', 'Accept & equip')}</button>
            </section>
          </div>,
          document.body,
        );
      })()}
    </section>
  );
}
