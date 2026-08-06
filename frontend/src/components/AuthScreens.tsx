import { useEffect, useMemo, useRef, useState } from 'react';

import { S } from '../lib/storage';
import { showScreen } from '../lib/store';
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
import '../onboarding.css';
import type { Workout } from '../lib/fitness';

export interface OfflineProfileWelcomeProps {
  onStart?: () => void;
  onContinue?: () => void;
}

export interface OnboardingCompletePayload {
  input: PlanInput;
  plan: InitialPlan;
}

export interface OnboardScreenProps {
  onComplete?: (result: OnboardingCompletePayload) => void;
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

export function OfflineProfileWelcome({ onStart, onContinue }: OfflineProfileWelcomeProps = {}) {
  const hasProfile = Boolean(S.get('profile'));
  const start = () => (onStart ? onStart() : showScreen('onboard'));
  const continueLocal = () => (onContinue ? onContinue() : showScreen('dashboard'));

  return (
    <main className="screen active local-welcome" id="screen-login">
      <section className="local-welcome-card" aria-labelledby="local-welcome-title">
        <p className="local-kicker">CORELINE · LOCAL WORKSPACE</p>
        <h1 id="local-welcome-title">Your plan starts on this device.</h1>
        <p className="local-lead">No account, password, email verification, or cloud sync is used. Your profile stays in this browser until you clear or export it.</p>
        <div className="local-trust-grid" aria-label="Local workspace details">
          <div><strong>Private by default</strong><span>Plan generation runs with transparent local rules.</span></div>
          <div><strong>No fake AI</strong><span>Guided mode is clearly marked as an on-device fallback.</span></div>
          <div><strong>Portable later</strong><span>Changing devices does not move this data yet.</span></div>
        </div>
        <div className="local-welcome-actions">
          {hasProfile && <button className="local-secondary" type="button" onClick={continueLocal}>Continue local workspace</button>}
          <button className="local-primary" type="button" onClick={start}>{hasProfile ? 'Create or replace profile' : 'Set up local profile'}</button>
        </div>
      </section>
    </main>
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

function persistLocalResult({ input, plan }: OnboardingCompletePayload): void {
  const savedAt = new Date().toISOString();
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
    firstName: input.displayName.trim(),
    age: input.age,
    height: input.heightCm,
    weight: input.weightKg,
    goal: legacyGoal(input.goal),
    trainingGoal: input.goal,
    experience: input.experience,
    daysPerWeek: input.daysPerWeek,
    equipment: input.equipment,
    diet: input.diet,
    avatarIdx: 0,
    avatarPhoto: null,
  });
  S.set('plan_preferences', input);
  S.set('initial_plan', { ...plan, createdAt: savedAt });
  const existingWorkouts = (S.get<Workout[]>('train_user_plans') || [])
    .filter((workout) => !String(workout.id).startsWith('starter-'));
  const starterWorkouts: Workout[] = plan.sessions.map((session) => ({
    id: `starter-${session.day}`,
    name: `${plan.sourceLabel} · Day ${session.day}`,
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
  S.set('local_workspace', { schemaVersion: 1, kind: 'offline-local', savedAt });
  S.set('protocol', []);
}

export function OnboardScreen({ onComplete }: OnboardScreenProps = {}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const [errors, setErrors] = useState<ReturnType<typeof validatePlanInput>['errors']>({});
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

  const chooseMode = (next: PlanMode) => {
    setMode(next);
    setErrors({});
    if (next !== 'inspiration') setInspirationProfile(undefined);
  };

  const nextFromMode = () => {
    if (mode === 'inspiration' && !inspirationProfile) {
      setErrors({ inspirationProfile: 'Choose one text-only inspiration profile.' });
      return;
    }
    setErrors({});
    setStep(2);
  };

  const preview = () => {
    const result = validatePlanInput(input);
    setErrors(result.errors);
    if (!result.valid) return;
    setPlan(generateInitialPlan(input));
    setStep(3);
  };

  const finish = () => {
    if (!plan) return;
    const payload = { input, plan };
    if (onComplete) onComplete(payload);
    else {
      persistLocalResult(payload);
      showScreen('dashboard');
    }
  };

  const toggleEquipment = (item: EquipmentOption) => {
    setEquipment((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };

  const firstError = Object.values(errors)[0];

  return (
    <main className="screen active onboarding-screen" id="screen-onboard">
      <section className="onboarding-shell" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <div>
            <p className="local-kicker">CORELINE · STARTER PLAN</p>
            <h1 id="onboarding-title" ref={headingRef} tabIndex={-1}>{step === 1 ? 'Choose your planning path' : step === 2 ? 'Set practical constraints' : 'Review your first week'}</h1>
          </div>
          <span className="onboarding-step">{step} / 3</span>
        </header>
        <div className="onboarding-progress" aria-hidden="true"><span style={{ width: `${step / 3 * 100}%` }} /></div>
        {firstError && <p className="onboarding-error" role="alert">{firstError}</p>}

        {step === 1 && <>
          <fieldset className="onboarding-fieldset">
            <legend>Plan mode</legend>
            <div className="onboarding-choice-grid">
              {PLAN_MODE_OPTIONS.map((option) => <button type="button" key={option.id} className={mode === option.id ? 'selected' : ''} aria-pressed={mode === option.id} onClick={() => chooseMode(option.id)}><strong>{option.label}</strong><span>{option.description}</span></button>)}
            </div>
          </fieldset>
          {mode === 'inspiration' && <fieldset className="onboarding-fieldset">
            <legend>Text-only inspiration</legend>
            <p className="onboarding-hint">These are training themes, not character artwork, canon routines, or promised outcomes.</p>
            <div className="onboarding-profile-grid">
              {INSPIRATION_PROFILES.map((profile) => <button type="button" key={profile.id} className={inspirationProfile === profile.id ? 'selected' : ''} aria-pressed={inspirationProfile === profile.id} onClick={() => setInspirationProfile(profile.id)}><strong>{profile.name}</strong><em>{profile.tagline}</em><span>{profile.description}</span></button>)}
            </div>
          </fieldset>}
          <fieldset className="onboarding-fieldset">
            <legend>Starting difficulty</legend>
            <div className="onboarding-difficulty">
              {DIFFICULTIES.map((item) => <button type="button" key={item.id} className={difficulty === item.id ? 'selected' : ''} aria-pressed={difficulty === item.id} onClick={() => setDifficulty(item.id)}><strong>{item.label}</strong><span>{item.detail}</span></button>)}
            </div>
          </fieldset>
          <div className="onboarding-actions"><button className="local-primary" type="button" onClick={nextFromMode}>Continue</button></div>
        </>}

        {step === 2 && <>
          <div className="onboarding-form-grid">
            <label>Name<input value={displayName} maxLength={40} autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} aria-invalid={Boolean(errors.displayName)} /></label>
            <label>Age<input type="number" min="16" max="85" value={age} onChange={(event) => setAge(event.target.value)} aria-invalid={Boolean(errors.age)} /></label>
            <label>Height (cm)<input type="number" min="120" max="230" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} aria-invalid={Boolean(errors.heightCm)} /></label>
            <label>Weight (kg)<input type="number" min="35" max="250" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} aria-invalid={Boolean(errors.weightKg)} /></label>
            <label>Experience<select value={experience} onChange={(event) => setExperience(event.target.value as ExperienceLevel)}>{EXPERIENCE.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Days per week<select value={daysPerWeek} onChange={(event) => setDaysPerWeek(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
            <label>Diet preference<select value={diet} onChange={(event) => setDiet(event.target.value as DietPreference)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Goal<select value={goal} onChange={(event) => setGoal(event.target.value as TrainingGoal)}>{GOALS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </div>
          <fieldset className="onboarding-fieldset">
            <legend>Available equipment</legend>
            <div className="onboarding-check-grid">{EQUIPMENT_OPTIONS.map((item) => <label key={item.id}><input type="checkbox" checked={equipment.includes(item.id)} onChange={() => toggleEquipment(item.id)} />{item.label}</label>)}</div>
          </fieldset>
          <p className="onboarding-hint">These details are stored locally and used only after you choose to save the plan. No account is created.</p>
          <div className="onboarding-actions"><button className="local-secondary" type="button" onClick={() => setStep(1)}>Back</button><button className="local-primary" type="button" onClick={preview}>Build local preview</button></div>
        </>}

        {step === 3 && plan && <>
          <div className="onboarding-summary"><span>{plan.sourceLabel}</span><strong>{plan.emphasis}</strong><p>{plan.daysPerWeek} sessions · {plan.difficulty} start · {plan.experience}</p></div>
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
          <div className="onboarding-plan-list">{plan.sessions.map((session) => <article key={session.day}><header><span>DAY {session.day}</span><strong>{session.focus}</strong><small>About {session.durationMinutes} min</small></header><ul>{session.exercises.map((exercise) => <li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets} sets · {exercise.reps} · {exercise.effort}</span></li>)}</ul></article>)}</div>
          <div className="onboarding-safety"><strong>Safety boundary</strong><ul>{plan.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>
          <p className="onboarding-hint">No supplement protocol or dose is created. Optional supplement setup can remain a separate, explicit choice.</p>
          <div className="onboarding-actions"><button className="local-secondary" type="button" onClick={() => setStep(2)}>Edit details</button><button className="local-primary" type="button" onClick={finish}>Save local plan</button></div>
        </>}
      </section>
    </main>
  );
}
