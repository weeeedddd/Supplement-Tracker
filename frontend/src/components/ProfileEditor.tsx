import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  CHARACTER_EQUIP_STORAGE_KEY,
  CHARACTER_PATHS,
  localizedCharacterCopy,
} from '../lib/characterPaths';
import { replaceStarterWorkouts } from '../lib/characterWorkouts';
import { clearActiveFoodPlan, createFoodPlanOffer } from '../lib/foodPlan';
import {
  calculateNutritionTargetsForProfile,
  loadUserProfile,
  patchStoredUserProfile,
  PROFILE_LIMITS,
  userProfileToPlanInput,
  type CookingAccess,
  type ProfileGender,
  type SleepQuality,
} from '../lib/profile';
import {
  INSPIRATION_PROFILES,
  generateInitialPlan,
  resolveActivityLevel,
  type ActivityLevel,
  type DietPreference,
  type InitialPlan,
  type InspirationProfileId,
  type PlanDifficulty,
  type PlanMode,
  type TrainingGoal,
} from '../lib/plans';
import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { S } from '../lib/storage';
import { SystemIcon } from './SystemIcon';

interface ProfileEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface Draft {
  mode: PlanMode;
  inspirationProfile?: InspirationProfileId;
  gender: ProfileGender;
  displayName: string;
  age: string;
  heightCm: string;
  weightKg: string;
  goal: TrainingGoal;
  daysPerWeek: string;
  difficulty: PlanDifficulty;
  diet: DietPreference;
  dietaryPreferences: string;
  workStudyPattern: string;
  typicalDay: string;
  activityLevel: ActivityLevel;
  activityContext: string;
  sleepDurationHours: string;
  sleepQuality: '' | SleepQuality;
  mealRhythm: string;
  cookingAccess: '' | CookingAccess;
  stressRecovery: string;
  injuriesLimitations: string;
  preferredTrainingWindow: string;
}

const EMPTY_DRAFT: Draft = {
  mode: 'own', inspirationProfile: undefined, gender: 'm', displayName: '', age: '', heightCm: '', weightKg: '', goal: 'general_fitness', daysPerWeek: '3',
  difficulty: 'medium', diet: 'flexible', dietaryPreferences: '', workStudyPattern: '', typicalDay: '',
  activityLevel: 'moderate', activityContext: '', sleepDurationHours: '', sleepQuality: '', mealRhythm: '', cookingAccess: '',
  stressRecovery: '', injuriesLimitations: '', preferredTrainingWindow: '',
};

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const ACTIVITY_OPTIONS: Array<{ id: ActivityLevel; de: string; en: string }> = [
  { id: 'sedentary', de: 'Überwiegend sitzend', en: 'Mostly sedentary' },
  { id: 'light', de: 'Leicht aktiv', en: 'Lightly active' },
  { id: 'moderate', de: 'Moderat aktiv', en: 'Moderately active' },
  { id: 'high', de: 'Sehr aktiv', en: 'Very active' },
  { id: 'very_high', de: 'Extrem aktiv / körperlicher Beruf', en: 'Extremely active / physical job' },
];

function listFromText(value: string): string[] {
  return [...new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, PROFILE_LIMITS.listItems);
}

export function ProfileEditor({ open, onClose, onSaved }: ProfileEditorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [status, setStatus] = useState('');

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  useEffect(() => {
    if (!open) return;
    const profile = loadUserProfile();
    if (profile) {
      setDraft({
        mode: profile.mode,
        inspirationProfile: profile.inspirationProfile,
        gender: profile.gender ?? 'm',
        displayName: profile.displayName,
        age: String(profile.age),
        heightCm: String(profile.heightCm),
        weightKg: String(profile.weightKg),
        goal: profile.goal,
        daysPerWeek: String(profile.daysPerWeek),
        difficulty: profile.difficulty,
        diet: profile.diet,
        dietaryPreferences: profile.dietaryPreferences.join(', '),
        workStudyPattern: profile.lifestyle.workStudyPattern ?? '',
        typicalDay: profile.lifestyle.typicalDay ?? '',
        activityLevel: resolveActivityLevel(
          profile.lifestyle.activityLevel,
          `${profile.lifestyle.activityContext ?? ''} ${profile.lifestyle.workStudyPattern ?? ''}`,
          profile.daysPerWeek,
        ),
        activityContext: profile.lifestyle.activityContext ?? '',
        sleepDurationHours: profile.lifestyle.sleepDurationHours === undefined ? '' : String(profile.lifestyle.sleepDurationHours),
        sleepQuality: profile.lifestyle.sleepQuality ?? '',
        mealRhythm: profile.lifestyle.mealRhythm ?? '',
        cookingAccess: profile.lifestyle.cookingAccess ?? '',
        stressRecovery: profile.lifestyle.stressRecovery ?? '',
        injuriesLimitations: profile.lifestyle.injuriesLimitations ?? '',
        preferredTrainingWindow: profile.lifestyle.preferredTrainingWindow ?? '',
      });
    }
    setStatus('');
    closeRef.current?.focus();
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    const previousProfile = loadUserProfile();
    const age = Number(draft.age);
    const heightCm = Number(draft.heightCm);
    const weightKg = Number(draft.weightKg);
    const daysPerWeek = Number(draft.daysPerWeek);
    const sleepHours = draft.sleepDurationHours.trim() ? Number(draft.sleepDurationHours) : null;
    if (!draft.displayName.trim() || draft.displayName.trim().length > PROFILE_LIMITS.displayName) {
      setStatus(copy(`Der Name muss 1–${PROFILE_LIMITS.displayName} Zeichen lang sein.`, `Name must be 1–${PROFILE_LIMITS.displayName} characters long.`));
      return;
    }
    if (draft.mode === 'inspiration' && !draft.inspirationProfile) {
      setStatus(copy('Wähle einen Charakter-Pfad oder den eigenen Pfad.', 'Choose a character path or Own Path.'));
      return;
    }
    if (!Number.isInteger(age) || age < 16 || age > 85 || heightCm < 120 || heightCm > 230 || weightKg < 35 || weightKg > 250) {
      setStatus(copy('Prüfe Alter (16–85), Größe (120–230 cm) und Gewicht (35–250 kg).', 'Check age (16–85), height (120–230 cm), and weight (35–250 kg).'));
      return;
    }
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 2 || daysPerWeek > 6) {
      setStatus(copy('Trainingstage müssen zwischen 2 und 6 liegen.', 'Training days must be between 2 and 6.'));
      return;
    }
    if (sleepHours !== null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 16)) {
      setStatus(copy('Die Schlafdauer muss zwischen 0 und 16 Stunden liegen oder leer bleiben.', 'Sleep duration must be between 0 and 16 hours or left blank.'));
      return;
    }

    const saved = patchStoredUserProfile({
      displayName: draft.displayName,
      age,
      heightCm,
      weightKg,
      gender: draft.gender,
      goal: draft.goal,
      daysPerWeek,
      difficulty: draft.difficulty,
      diet: draft.diet,
      dietaryPreferences: listFromText(draft.dietaryPreferences),
      mode: draft.mode,
      inspirationProfile: draft.mode === 'inspiration' ? draft.inspirationProfile : null,
      lifestyle: {
        workStudyPattern: draft.workStudyPattern,
        typicalDay: draft.typicalDay,
        activityLevel: draft.activityLevel,
        activityContext: draft.activityContext,
        sleepDurationHours: sleepHours,
        sleepQuality: draft.sleepQuality || null,
        mealRhythm: draft.mealRhythm,
        cookingAccess: draft.cookingAccess || null,
        stressRecovery: draft.stressRecovery,
        injuriesLimitations: draft.injuriesLimitations,
        preferredTrainingWindow: draft.preferredTrainingWindow,
      },
    });
    if (!saved) {
      setStatus(copy('Das lokale Profil konnte nicht geladen werden.', 'The local profile could not be loaded.'));
      return;
    }

    const legacy = S.get<Record<string, unknown>>('profile') ?? {};
    S.set('profile', {
      ...legacy,
      firstName: saved.displayName,
      age: saved.age,
      height: saved.heightCm,
      weight: saved.weightKg,
      trainingGoal: saved.goal,
      daysPerWeek: saved.daysPerWeek,
      difficulty: saved.difficulty,
      diet: saved.diet,
      dietaryPreferences: saved.dietaryPreferences,
      mode: saved.mode,
      inspirationProfile: saved.inspirationProfile,
      gender: saved.gender,
      lifestyle: saved.lifestyle,
    });
    const language = lang === 'de' ? 'de' : 'en';
    const planInput = userProfileToPlanInput(saved);
    const nutritionTargets = calculateNutritionTargetsForProfile(saved, language);
    S.set('macros', {
      kcal: nutritionTargets.calories,
      prot: nutritionTargets.protein,
      carb: nutritionTargets.carbs,
      fat: nutritionTargets.fat,
      sug: nutritionTargets.sugar,
    });
    S.set('nutrition_targets_v2', nutritionTargets);
    S.set('plan_preferences', {
      ...planInput,
      dietaryPreferences: saved.dietaryPreferences,
      lifestyle: saved.lifestyle,
    });
    const pathChanged = Boolean(previousProfile) && (
      previousProfile?.mode !== saved.mode
      || previousProfile?.inspirationProfile !== saved.inspirationProfile
    );
    if (pathChanged) {
      const regenerated = generateInitialPlan(planInput, language, {
        gender: saved.gender,
        activityLevel: saved.lifestyle.activityLevel,
        activityContext: saved.lifestyle.activityContext,
      });
      const datedPlan: InitialPlan = { ...regenerated, createdAt: new Date().toISOString() };
      S.set('initial_plan', datedPlan);
      replaceStarterWorkouts(datedPlan, saved.inspirationProfile, language);
      if (saved.mode === 'inspiration' && saved.inspirationProfile) {
        S.set(CHARACTER_EQUIP_STORAGE_KEY, saved.inspirationProfile);
        // A new path draws a new food suggestion; the previous one is dropped.
        void createFoodPlanOffer({
          pathId: saved.inspirationProfile,
          targets: nutritionTargets,
          diet: saved.diet,
        }).catch(() => { /* the profile save must not depend on a suggestion */ });
      } else {
        S.del(CHARACTER_EQUIP_STORAGE_KEY);
        clearActiveFoodPlan();
      }
      setStatus(copy('Neuer Pfad ausgerüstet. Starter-Workouts und Muskelprofile wurden ersetzt; Logs und eigene Pläne bleiben erhalten.', 'New path equipped. Starter workouts and muscle profiles were replaced; logs and personal plans remain intact.'));
    } else {
      const initialPlan = S.get<InitialPlan>('initial_plan');
      if (initialPlan) S.set('initial_plan', { ...initialPlan, nutritionTargets });
      setStatus(copy('Profil und Ernährungsziele gespeichert. Bestehende Trainingspläne, Routinen und Logs wurden nicht verändert.', 'Profile and nutrition targets saved. Existing training plans, routines, and logs were not changed.'));
    }
    onSaved();
  };

  return (
    <div className="product-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-panel profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <header className="settings-header">
          <div>
            <h2 id="profile-editor-title">{copy('Profil-Dossier bearbeiten', 'Edit profile dossier')}</h2>
            <p>{copy('Diese Änderung ist nicht-destruktiv: Dein aktueller Trainingsplan wird nicht automatisch ersetzt.', 'This edit is non-destructive: your current training plan is not replaced automatically.')}</p>
          </div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label={copy('Profil-Editor schließen', 'Close profile editor')}><SystemIcon name="close" /></button>
        </header>
        <form onSubmit={save}>
          <fieldset className="settings-section profile-character-loadout">
            <legend>{copy('Character Loadout & Körpermodell', 'Character loadout & body model')}</legend>
            <p>{copy(
              'Ein neuer Charakter ersetzt nur automatisch erzeugte Starter-Workouts. Eigene Pläne, abgeschlossene Einheiten und Heatmap-Verlauf bleiben erhalten.',
              'A new character replaces only generated starter workouts. Personal plans, completed sessions, and heatmap history remain intact.',
            )}</p>
            <div className="profile-path-grid">
              <button type="button" className={draft.mode !== 'inspiration' ? 'selected own-path' : 'own-path'} aria-pressed={draft.mode !== 'inspiration'} onClick={() => setDraft(current => ({ ...current, mode: 'own', inspirationProfile: undefined }))}>
                <SystemIcon name="profile" />
                <span><strong>{copy('Eigener Pfad', 'Own Path')}</strong><small>{copy('Standardpläne und persönliche Bibliothek', 'Standard plans and personal library')}</small></span>
              </button>
              {INSPIRATION_PROFILES.map(profile => {
                const character = CHARACTER_PATHS[profile.id];
                const selected = draft.mode === 'inspiration' && draft.inspirationProfile === profile.id;
                return <button type="button" key={profile.id} className={selected ? 'selected' : ''} aria-pressed={selected} onClick={() => setDraft(current => ({ ...current, mode: 'inspiration', inspirationProfile: profile.id }))}>
                  <span className="profile-path-rank">{selected ? copy('AUSGERÜSTET', 'EQUIPPED') : 'PATH'}</span>
                  <span><strong>{character.name}</strong><small>{localizedCharacterCopy(character.title, lang)}</small></span>
                  <em>{character.tags.slice(0, 2).map(tag => localizedCharacterCopy(tag, lang)).join(' · ')}</em>
                </button>;
              })}
            </div>
            <div className="profile-model-picker" role="group" aria-label={copy('Körpermodell', 'Body model')}>
              {([
                ['m', copy('Männliche Figur', 'Male figure')],
                ['f', copy('Weibliche Figur', 'Female figure')],
                ['x', copy('Neutrale Figur', 'Neutral figure')],
              ] as Array<[ProfileGender, string]>).map(([value, label]) => <button type="button" key={value} className={draft.gender === value ? 'selected' : ''} aria-pressed={draft.gender === value} onClick={() => update('gender', value)}><SystemIcon name="profile" />{label}</button>)}
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>{copy('Basis & Ziel', 'Basics & goal')}</legend>
            <div className="shopping-field-grid">
              <label className="system-field wide">{copy('Anzeigename', 'Display name')}<input required maxLength={PROFILE_LIMITS.displayName} value={draft.displayName} onChange={(event) => update('displayName', event.target.value)} /></label>
              <label className="system-field">{copy('Alter', 'Age')}<input type="number" min="16" max="85" value={draft.age} onChange={(event) => update('age', event.target.value)} /></label>
              <label className="system-field">{copy('Größe (cm)', 'Height (cm)')}<input type="number" min="120" max="230" step="0.1" value={draft.heightCm} onChange={(event) => update('heightCm', event.target.value)} /></label>
              <label className="system-field">{copy('Gewicht (kg)', 'Weight (kg)')}<input type="number" min="35" max="250" step="0.1" value={draft.weightKg} onChange={(event) => update('weightKg', event.target.value)} /></label>
              <label className="system-field">{copy('Trainingstage', 'Training days')}<select value={draft.daysPerWeek} onChange={(event) => update('daysPerWeek', event.target.value)}>{[2,3,4,5,6].map((days) => <option value={days} key={days}>{copy(`${days} pro Woche`, `${days} per week`)}</option>)}</select></label>
              <label className="system-field">{copy('Ziel', 'Goal')}<select value={draft.goal} onChange={(event) => update('goal', event.target.value as TrainingGoal)}><option value="general_fitness">{copy('Allgemeine Fitness', 'General fitness')}</option><option value="build_muscle">{copy('Muskelaufbau', 'Build muscle')}</option><option value="get_stronger">{copy('Kraftaufbau', 'Build strength')}</option><option value="fat_loss">{copy('Gewichtsabnahme unterstützen', 'Support fat loss')}</option></select></label>
              <label className="system-field">{copy('Intensität', 'Intensity')}<select value={draft.difficulty} onChange={(event) => update('difficulty', event.target.value as PlanDifficulty)}><option value="light">{copy('Leicht', 'Light')}</option><option value="medium">{copy('Mittel', 'Medium')}</option><option value="hard">{copy('Hart', 'Hard')}</option></select></label>
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>{copy('Alltag, Schlaf & Erholung', 'Routine, sleep & recovery')}</legend>
            <div className="shopping-field-grid">
              <label className="system-field">{copy('Arbeit / Studium', 'Work / study')}<input maxLength={PROFILE_LIMITS.shortText} value={draft.workStudyPattern} onChange={(event) => update('workStudyPattern', event.target.value)} /></label>
              <label className="system-field">{copy('Bevorzugte Trainingszeit', 'Preferred training time')}<input maxLength={PROFILE_LIMITS.shortText} value={draft.preferredTrainingWindow} onChange={(event) => update('preferredTrainingWindow', event.target.value)} /></label>
              <label className="system-field wide">{copy('Typischer Tag', 'Typical day')}<textarea maxLength={PROFILE_LIMITS.typicalDay} value={draft.typicalDay} onChange={(event) => update('typicalDay', event.target.value)} /></label>
              <label className="system-field wide">{copy('Aktivitätsstufe außerhalb des Trainings', 'Activity level outside training')}<select value={draft.activityLevel} onChange={(event) => update('activityLevel', event.target.value as ActivityLevel)}>{ACTIVITY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{copy(item.de, item.en)}</option>)}</select></label>
              <label className="system-field wide">{copy('Bewegung außerhalb des Trainings', 'Movement outside training')}<textarea maxLength={PROFILE_LIMITS.activityContext} value={draft.activityContext} onChange={(event) => update('activityContext', event.target.value)} /></label>
              <label className="system-field">{copy('Schlafdauer', 'Sleep duration')}<input type="number" min="0" max="16" step="0.25" value={draft.sleepDurationHours} onChange={(event) => update('sleepDurationHours', event.target.value)} /></label>
              <label className="system-field">{copy('Schlafqualität', 'Sleep quality')}<select value={draft.sleepQuality} onChange={(event) => update('sleepQuality', event.target.value as Draft['sleepQuality'])}><option value="">{copy('Keine Angabe', 'Not specified')}</option><option value="poor">{copy('Oft schlecht', 'Often poor')}</option><option value="fair">{copy('Okay', 'Fair')}</option><option value="good">{copy('Meist gut', 'Usually good')}</option><option value="variable">{copy('Wechselhaft', 'Variable')}</option></select></label>
              <label className="system-field wide">{copy('Stress & Erholung', 'Stress & recovery')}<textarea maxLength={PROFILE_LIMITS.healthContext} value={draft.stressRecovery} onChange={(event) => update('stressRecovery', event.target.value)} /></label>
              <label className="system-field wide">{copy('Einschränkungen, die berücksichtigt werden sollen', 'Limitations to consider')}<textarea maxLength={PROFILE_LIMITS.healthContext} value={draft.injuriesLimitations} onChange={(event) => update('injuriesLimitations', event.target.value)} /></label>
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>{copy('Ernährung', 'Nutrition')}</legend>
            <div className="shopping-field-grid">
              <label className="system-field">{copy('Ernährungsweise', 'Diet')}<select value={draft.diet} onChange={(event) => update('diet', event.target.value as DietPreference)}><option value="flexible">{copy('Flexibel', 'Flexible')}</option><option value="omnivore">{copy('Mischkost', 'Omnivore')}</option><option value="vegetarian">{copy('Vegetarisch', 'Vegetarian')}</option><option value="vegan">Vegan</option></select></label>
              <label className="system-field">{copy('Kochmöglichkeit', 'Cooking access')}<select value={draft.cookingAccess} onChange={(event) => update('cookingAccess', event.target.value as Draft['cookingAccess'])}><option value="">{copy('Keine Angabe', 'Not specified')}</option><option value="none">{copy('Keine regelmäßige Küche', 'No regular kitchen')}</option><option value="limited">{copy('Eingeschränkt', 'Limited')}</option><option value="full">{copy('Voll ausgestattet', 'Full kitchen')}</option></select></label>
              <label className="system-field wide">{copy('Mahlzeitenrhythmus', 'Meal rhythm')}<textarea maxLength={PROFILE_LIMITS.mealRhythm} value={draft.mealRhythm} onChange={(event) => update('mealRhythm', event.target.value)} /></label>
              <label className="system-field wide">{copy('Weitere Präferenzen (kommagetrennt)', 'Other preferences (comma-separated)')}<input maxLength={640} value={draft.dietaryPreferences} onChange={(event) => update('dietaryPreferences', event.target.value)} /></label>
            </div>
          </fieldset>

          {status && <p className="shopping-budget-note" role="status">{status}</p>}
          <div className="system-action-bar">
            <button className="system-button quiet" type="button" onClick={onClose}>{copy('Abbrechen', 'Cancel')}</button>
            <button className="system-primary-action" type="submit"><SystemIcon name="check" /> {copy('Profil speichern', 'Save profile')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
