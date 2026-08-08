import { useEffect, useMemo, useRef, useState } from 'react';

import type { Workout } from '../lib/fitness';
import {
  PROFILE_LIMITS,
  saveUserProfile,
  userProfileFromPlanInput,
  type CookingAccess,
  type LifestyleProfile,
  type SleepQuality,
  type UserProfileV3,
} from '../lib/profile';
import {
  EQUIPMENT_OPTIONS,
  INSPIRATION_PROFILES,
  PLAN_MODE_OPTIONS,
  generateInitialPlan,
  validatePlanInput,
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
import { showScreen } from '../lib/store';
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
const STEP_TITLES: Record<OnboardingStep, string> = {
  1: 'Choose your planning path',
  2: 'Build your training dossier',
  3: 'Describe your real week',
  4: 'Review your first week',
};

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

const EMPTY_LIFESTYLE: LifestyleDraft = {
  workStudyPattern: '',
  typicalDay: '',
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

function modeCopy(mode: PlanMode): { label: string; description: string } {
  if (mode === 'guided') {
    return {
      label: 'AI Plan',
      description: 'Use a connected AI service only after consent. Local rules remain the honest fallback.',
    };
  }
  const option = PLAN_MODE_OPTIONS.find((item) => item.id === mode);
  return {
    label: option?.label ?? mode,
    description: option?.description ?? '',
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
      errors.sleepDurationHours = 'Enter a sleep duration from 0 to 16 hours, or leave it blank.';
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
    if (draft[key].length > maximum) errors[key] = `${label} must be ${maximum} characters or fewer.`;
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
  )) && Array.isArray(plan.safetyNotes) && plan.safetyNotes.length > 0;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span className="onboarding-field-error" id={id}>{message}</span>;
}

export function OfflineProfileWelcome({ onStart, onContinue }: OfflineProfileWelcomeProps = {}) {
  const hasProfile = Boolean(S.get('profile'));
  const start = () => (onStart ? onStart() : showScreen('onboard'));
  const continueLocal = () => (onContinue ? onContinue() : showScreen('dashboard'));

  return (
    <section className="screen active local-welcome" id="screen-login" aria-labelledby="local-welcome-title">
      <div className="local-welcome-card">
        <p className="local-kicker">CORELINE / LOCAL WORKSPACE</p>
        <h1 id="local-welcome-title">Your plan starts on this device.</h1>
        <p className="local-lead">No account, password, email verification, or cloud sync is used. Your profile stays in this browser until you clear or export it.</p>
        <div className="local-trust-grid" aria-label="Local workspace details">
          <div><strong>Private by default</strong><span>Your plan and logs stay in this browser.</span></div>
          <div><strong>Honest planning</strong><span>AI is used only when a real service is connected and you consent.</span></div>
          <div><strong>Portable later</strong><span>Changing devices does not move this data yet.</span></div>
        </div>
        <div className="local-welcome-actions">
          {hasProfile && <button className="local-secondary" type="button" onClick={continueLocal}>Continue local workspace</button>}
          <button className="local-primary" type="button" onClick={start}>{hasProfile ? 'Create or replace profile' : 'Set up local profile'}</button>
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
  const canonicalProfile = profile ?? userProfileFromPlanInput(input);
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
  const existingWorkouts = (S.get<Workout[]>('train_user_plans') || [])
    .filter((workout) => !String(workout.id).startsWith('starter-'));
  const starterWorkouts: Workout[] = plan.sessions.map((session) => ({
    id: `starter-${session.day}`,
    name: `${plan.sourceLabel} / Day ${session.day}`,
    kind: 'fullbody',
    focus: session.focus,
    icon: '◇',
    is_preset: false,
    source: 'generated',
    exercises: session.exercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weight: exercise.equipment === 'bodyweight' ? 'bodyweight' : 'as available',
      rest: 90,
    })),
  }));
  S.set('train_user_plans', [...existingWorkouts, ...starterWorkouts]);
  S.set('local_workspace', { schemaVersion: 1, profileSchemaVersion: canonicalProfile.schemaVersion, kind: 'offline-local', savedAt });
  if (S.get('protocol') === null) S.set('protocol', []);
}

export function OnboardScreen({ onComplete, onAiPlanRequest, onAiConsentChange }: OnboardScreenProps = {}) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<PlanMode>('guided');
  const [inspirationProfile, setInspirationProfile] = useState<InspirationProfileId | undefined>();
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

  useEffect(() => { headingRef.current?.focus(); }, [step]);

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

  const updateLifestyle = <K extends keyof LifestyleDraft>(key: K, value: LifestyleDraft[K]) => {
    setLifestyleDraft((current) => ({ ...current, [key]: value }));
    setLifestyleErrors((current) => ({ ...current, [key]: undefined }));
  };

  const chooseMode = (next: PlanMode) => {
    setMode(next);
    setErrors({});
    setGenerationNote('');
    if (next !== 'inspiration') setInspirationProfile(undefined);
    if (next !== 'guided' && aiConsent) {
      setAiConsent(false);
      onAiConsentChange?.(false);
    }
  };

  const nextFromMode = () => {
    if (mode === 'inspiration' && !inspirationProfile) {
      setErrors({ inspirationProfile: 'Choose one text-only inspiration profile.' });
      return;
    }
    setErrors({});
    setStep(2);
  };

  const nextFromBasics = () => {
    const result = validatePlanInput(input);
    setErrors(result.errors);
    if (!result.valid) return;
    setStep(3);
  };

  const preview = async () => {
    const inputResult = validatePlanInput(input);
    const nextLifestyleErrors = validateLifestyle(lifestyleDraft);
    setErrors(inputResult.errors);
    setLifestyleErrors(nextLifestyleErrors);
    if (!inputResult.valid || Object.keys(nextLifestyleErrors).length > 0) return;

    const profile = userProfileFromPlanInput(input, {
      dietaryPreferences: stringList(lifestyleDraft.dietaryPreferences),
      lifestyle: lifestyleFromDraft(lifestyleDraft),
    });
    let nextPlan: InitialPlan | null = null;
    let nextOrigin: PlanGenerationOrigin = 'local-rules';
    let nextNote = 'This preview was built on this device with transparent local rules.';

    setIsGenerating(true);
    setGenerationNote('');
    if (mode === 'guided' && onAiPlanRequest && aiConsent && input.age >= 18) {
      const { displayName: _displayName, appearance: _appearance, ...context } = profile;
      try {
        const remotePlan = await onAiPlanRequest({ context, consentedAt: new Date().toISOString() });
        if (isUsablePlan(remotePlan)) {
          nextPlan = remotePlan;
          nextOrigin = 'remote-ai';
          nextNote = 'This preview was returned by the connected AI service after your one-time consent.';
        } else {
          nextNote = 'The AI service returned no usable plan. This preview was built with local rules instead.';
        }
      } catch {
        nextNote = 'The AI service was unavailable. This preview was built with local rules; no remote result is presented as AI.';
      }
    } else if (mode === 'guided' && input.age < 18) {
      nextNote = 'AI planning is limited to adults in this build. This preview was built locally.';
    } else if (mode === 'guided' && !onAiPlanRequest) {
      nextNote = 'No AI service is connected in this build. This preview was built locally.';
    } else if (mode === 'guided' && !aiConsent) {
      nextNote = 'You did not consent to a remote request. This preview was built locally.';
    }

    if (!nextPlan) nextPlan = generateInitialPlan(input);
    setPlan(nextPlan);
    setGenerationOrigin(nextOrigin);
    setGenerationNote(nextNote);
    setIsGenerating(false);
    setStep(4);
  };

  const finish = () => {
    if (!plan) return;
    const profile = userProfileFromPlanInput(input, {
      dietaryPreferences: stringList(lifestyleDraft.dietaryPreferences),
      lifestyle: lifestyleFromDraft(lifestyleDraft),
    });
    const payload: OnboardingCompletePayload = { input, plan, profile, generationOrigin };
    if (onComplete) onComplete(payload);
    else {
      persistLocalResult(payload);
      showScreen('dashboard');
    }
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

  return (
    <section className="screen active onboarding-screen" id="screen-onboard" aria-labelledby="onboarding-title">
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <p className="local-kicker">CORELINE / STARTER PLAN</p>
            <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>{STEP_TITLES[step]}</h1>
          </div>
          <span className="onboarding-step">{step} / {TOTAL_STEPS}</span>
        </header>
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
        >
          <span style={{ transform: `scaleX(${step / TOTAL_STEPS})` }} />
        </div>
        {firstError && <p className="onboarding-error" role="alert">Check the highlighted field: {firstError}</p>}

        {step === 1 && <>
          <fieldset className="onboarding-fieldset">
            <legend>Plan mode</legend>
            <div className="onboarding-choice-grid">
              {PLAN_MODE_OPTIONS.map((option) => {
                const copy = modeCopy(option.id);
                return (
                  <button type="button" key={option.id} className={mode === option.id ? 'selected' : ''} aria-pressed={mode === option.id} onClick={() => chooseMode(option.id)}>
                    <strong>{copy.label}</strong>
                    <span>{copy.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {mode === 'inspiration' && <fieldset className="onboarding-fieldset">
            <legend>Text-only inspiration</legend>
            <p className="onboarding-hint">These are training themes, not character artwork, canon routines, or promised outcomes.</p>
            <div className="onboarding-profile-grid">
              {INSPIRATION_PROFILES.map((profile) => (
                <button type="button" key={profile.id} className={inspirationProfile === profile.id ? 'selected' : ''} aria-pressed={inspirationProfile === profile.id} onClick={() => setInspirationProfile(profile.id)}>
                  <strong>{profile.name}</strong>
                  <em>{profile.tagline}</em>
                  <span>{profile.description}</span>
                </button>
              ))}
            </div>
            <FieldError id="inspiration-error" message={errors.inspirationProfile} />
          </fieldset>}
          <fieldset className="onboarding-fieldset">
            <legend>Starting intensity</legend>
            <div className="onboarding-difficulty">
              {DIFFICULTIES.map((item) => <button type="button" key={item.id} className={difficulty === item.id ? 'selected' : ''} aria-pressed={difficulty === item.id} onClick={() => setDifficulty(item.id)}><strong>{item.label}</strong><span>{item.detail}</span></button>)}
            </div>
          </fieldset>
          <div className="onboarding-actions"><button className="local-primary" type="button" onClick={nextFromMode}>Continue</button></div>
        </>}

        {step === 2 && <>
          <p className="onboarding-section-intro">These boundaries keep the first week realistic. They are stored locally only when you save.</p>
          <div className="onboarding-form-grid">
            <label>
              Name
              <input value={displayName} maxLength={PROFILE_LIMITS.displayName} autoComplete="name" required onChange={(event) => { setDisplayName(event.target.value); setErrors((current) => ({ ...current, displayName: undefined })); }} aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'name-error' : undefined} />
              <FieldError id="name-error" message={errors.displayName} />
            </label>
            <label>
              Age
              <input type="number" inputMode="numeric" min="16" max="85" value={age} required onChange={(event) => { setAge(event.target.value); setErrors((current) => ({ ...current, age: undefined })); }} aria-invalid={Boolean(errors.age)} aria-describedby={errors.age ? 'age-error' : undefined} />
              <FieldError id="age-error" message={errors.age} />
            </label>
            <label>
              Height (cm)
              <input type="number" inputMode="decimal" min="120" max="230" step="0.1" value={heightCm} required onChange={(event) => { setHeightCm(event.target.value); setErrors((current) => ({ ...current, heightCm: undefined })); }} aria-invalid={Boolean(errors.heightCm)} aria-describedby={errors.heightCm ? 'height-error' : undefined} />
              <FieldError id="height-error" message={errors.heightCm} />
            </label>
            <label>
              Weight (kg)
              <input type="number" inputMode="decimal" min="35" max="250" step="0.1" value={weightKg} required onChange={(event) => { setWeightKg(event.target.value); setErrors((current) => ({ ...current, weightKg: undefined })); }} aria-invalid={Boolean(errors.weightKg)} aria-describedby={errors.weightKg ? 'weight-error' : undefined} />
              <FieldError id="weight-error" message={errors.weightKg} />
            </label>
            <label>Training experience<select value={experience} onChange={(event) => setExperience(event.target.value as ExperienceLevel)}>{EXPERIENCE.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Available days<select value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((days) => <option key={days} value={days}>{days} days per week</option>)}</select></label>
            <label>Primary goal<select value={goal} onChange={(event) => setGoal(event.target.value as TrainingGoal)}>{GOALS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </div>
          <fieldset className="onboarding-fieldset">
            <legend>Available equipment</legend>
            <div className="onboarding-check-grid">{EQUIPMENT_OPTIONS.map((item) => <label key={item.id}><input type="checkbox" checked={equipment.includes(item.id)} onChange={() => toggleEquipment(item.id)} />{item.label}</label>)}</div>
            <FieldError id="equipment-error" message={errors.equipment} />
          </fieldset>
          <div className="onboarding-actions"><button className="local-secondary" type="button" onClick={() => setStep(1)}>Back</button><button className="local-primary" type="button" onClick={nextFromBasics}>Continue</button></div>
        </>}

        {step === 3 && <>
          <p className="onboarding-section-intro">Share only what you are comfortable using for planning. Free-text context stays local unless you explicitly approve the AI request below.</p>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>Schedule and daily movement</legend>
            <div className="onboarding-form-grid">
              <label>Work or study pattern<input value={lifestyleDraft.workStudyPattern} maxLength={PROFILE_LIMITS.shortText} placeholder="e.g. desk job, rotating shifts, student" onChange={(event) => updateLifestyle('workStudyPattern', event.target.value)} /></label>
              <label>Preferred training window<input value={lifestyleDraft.preferredTrainingWindow} maxLength={PROFILE_LIMITS.shortText} placeholder="e.g. weekdays after 18:00" onChange={(event) => updateLifestyle('preferredTrainingWindow', event.target.value)} /></label>
              <label className="onboarding-span-2">
                A typical day
                <textarea value={lifestyleDraft.typicalDay} maxLength={PROFILE_LIMITS.typicalDay} rows={5} placeholder="Describe work or study hours, commute, responsibilities, movement and when you usually have energy." onChange={(event) => updateLifestyle('typicalDay', event.target.value)} aria-describedby="typical-day-help" />
                <span className="onboarding-field-help" id="typical-day-help">Up to {PROFILE_LIMITS.typicalDay} characters. Avoid names, addresses or employer details.</span>
              </label>
              <label className="onboarding-span-2">
                Activity outside training
                <textarea value={lifestyleDraft.activityContext} maxLength={PROFILE_LIMITS.activityContext} rows={3} placeholder="e.g. mostly seated, 8k steps, physical work, cycling commute" onChange={(event) => updateLifestyle('activityContext', event.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>Sleep and recovery</legend>
            <div className="onboarding-form-grid">
              <label>
                Typical sleep duration
                <input type="number" inputMode="decimal" min="0" max="16" step="0.25" value={lifestyleDraft.sleepDurationHours} placeholder="hours" onChange={(event) => updateLifestyle('sleepDurationHours', event.target.value)} aria-invalid={Boolean(lifestyleErrors.sleepDurationHours)} aria-describedby={lifestyleErrors.sleepDurationHours ? 'sleep-error' : undefined} />
                <FieldError id="sleep-error" message={lifestyleErrors.sleepDurationHours} />
              </label>
              <label>Sleep quality<select value={lifestyleDraft.sleepQuality} onChange={(event) => updateLifestyle('sleepQuality', event.target.value as LifestyleDraft['sleepQuality'])}><option value="">Prefer not to say</option>{SLEEP_QUALITY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="onboarding-span-2">
                Stress and recovery context
                <textarea value={lifestyleDraft.stressRecovery} maxLength={PROFILE_LIMITS.healthContext} rows={3} placeholder="e.g. high work stress this month, weekends are more restful" onChange={(event) => updateLifestyle('stressRecovery', event.target.value)} />
              </label>
              <label className="onboarding-span-2">
                Limitations, access needs or injuries you want considered
                <textarea value={lifestyleDraft.injuriesLimitations} maxLength={PROFILE_LIMITS.healthContext} rows={3} placeholder="User-provided context only — this does not diagnose or treat an injury." onChange={(event) => updateLifestyle('injuriesLimitations', event.target.value)} />
                <span className="onboarding-field-help">For pain, injury or medical concerns, use qualified professional guidance before changing training.</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="onboarding-fieldset onboarding-dossier-group">
            <legend>Food routine</legend>
            <div className="onboarding-form-grid">
              <label>Diet preference<select value={diet} onChange={(event) => setDiet(event.target.value as DietPreference)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>Cooking access<select value={lifestyleDraft.cookingAccess} onChange={(event) => updateLifestyle('cookingAccess', event.target.value as LifestyleDraft['cookingAccess'])}><option value="">Prefer not to say</option>{COOKING_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className="onboarding-span-2">
                Meal rhythm
                <textarea value={lifestyleDraft.mealRhythm} maxLength={PROFILE_LIMITS.mealRhythm} rows={3} placeholder="e.g. quick breakfast, canteen lunch, dinner at home; irregular on night shifts" onChange={(event) => updateLifestyle('mealRhythm', event.target.value)} />
              </label>
              <label>Other dietary preferences<input value={lifestyleDraft.dietaryPreferences} maxLength={640} placeholder="comma-separated" onChange={(event) => updateLifestyle('dietaryPreferences', event.target.value)} /></label>
              <label>Allergies or exclusions<input value={lifestyleDraft.allergiesExclusions} maxLength={640} placeholder="comma-separated" onChange={(event) => updateLifestyle('allergiesExclusions', event.target.value)} /></label>
            </div>
          </fieldset>

          {mode === 'guided' && <section className="onboarding-ai-panel" aria-labelledby="ai-consent-title">
            <div className="onboarding-ai-heading">
              <div>
                <span>{onAiPlanRequest ? 'AI bridge available' : 'Local fallback active'}</span>
                <h2 id="ai-consent-title">AI Plan consent</h2>
              </div>
              <strong>{onAiPlanRequest && aiEligible ? 'OPTIONAL' : 'LOCAL ONLY'}</strong>
            </div>
            {!onAiPlanRequest && <p>No AI service is connected in this build. You can still create a complete plan with the transparent local generator.</p>}
            {onAiPlanRequest && !aiEligible && <p>The remote AI route is limited to adults in this build. Your plan will be generated locally.</p>}
            {onAiPlanRequest && aiEligible && <>
              <p>If enabled, one request contains age, height, weight, goal, intensity, experience, available days, equipment, diet and the lifestyle text entered above. It excludes your name, address, workout logs, food logs and supplement logs.</p>
              <label className="onboarding-consent">
                <input type="checkbox" checked={aiConsent} onChange={(event) => handleConsent(event.target.checked)} />
                <span>I agree to send this listed context once to the configured AI service to create my preview. I can continue without consenting by using local rules.</span>
              </label>
            </>}
            <p className="onboarding-ai-safety">The result is general fitness and food-planning support, not medical advice. It will not create supplement doses or diagnose conditions.</p>
          </section>}

          <div className="onboarding-actions">
            <button className="local-secondary" type="button" onClick={() => setStep(2)} disabled={isGenerating}>Back</button>
            <button className="local-primary" type="button" onClick={() => void preview()} disabled={isGenerating}>{isGenerating ? 'Building preview…' : mode === 'guided' && onAiPlanRequest && aiConsent && aiEligible ? 'Generate AI preview' : 'Build local preview'}</button>
          </div>
          <p className="onboarding-generation-status" aria-live="polite">{isGenerating ? 'Generating your plan. Keep this page open.' : ''}</p>
        </>}

        {step === 4 && plan && <>
          <div className="onboarding-summary">
            <span>{generationOrigin === 'remote-ai' ? 'CONNECTED AI RESPONSE' : 'LOCAL RULES PREVIEW'}</span>
            <strong>{plan.emphasis}</strong>
            <p>{plan.daysPerWeek} sessions / {plan.difficulty} start / {plan.experience}</p>
          </div>
          <p className="onboarding-generation-note" role="status">{generationNote}</p>
          <section className="onboarding-nutrition" aria-labelledby="nutrition-target-title">
            <div><span>STARTING NUTRITION TARGET</span><strong id="nutrition-target-title">{plan.nutritionTargets.calories} kcal</strong></div>
            <dl>
              <div><dt>Protein</dt><dd>{plan.nutritionTargets.protein}g</dd></div>
              <div><dt>Carbs</dt><dd>{plan.nutritionTargets.carbs}g</dd></div>
              <div><dt>Fat</dt><dd>{plan.nutritionTargets.fat}g</dd></div>
              <div><dt>Sugar log</dt><dd>{plan.nutritionTargets.sugar}g ref.</dd></div>
            </dl>
            <p>{plan.nutritionTargets.note}</p>
          </section>
          <div className="onboarding-plan-list">{plan.sessions.map((session) => <article key={session.day}><header><span>DAY {session.day}</span><strong>{session.focus}</strong><small>About {session.durationMinutes} min</small></header><ul>{session.exercises.map((exercise) => <li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets} sets / {exercise.reps} / {exercise.effort}</span></li>)}</ul></article>)}</div>
          <div className="onboarding-safety"><strong>Safety boundary</strong><ul>{plan.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>
          <p className="onboarding-hint">No supplement protocol or dose is created. Supplement tracking remains a separate, explicit choice.</p>
          <div className="onboarding-actions"><button className="local-secondary" type="button" onClick={() => setStep(3)}>Edit details</button><button className="local-primary" type="button" onClick={finish}>Save local plan</button></div>
        </>}
      </div>
    </section>
  );
}
