import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  loadUserProfile,
  patchStoredUserProfile,
  PROFILE_LIMITS,
  type CookingAccess,
  type SleepQuality,
} from '../lib/profile';
import type { DietPreference, PlanDifficulty, TrainingGoal } from '../lib/plans';
import { S } from '../lib/storage';
import { SystemIcon } from './SystemIcon';

interface ProfileEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface Draft {
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
  displayName: '', age: '', heightCm: '', weightKg: '', goal: 'general_fitness', daysPerWeek: '3',
  difficulty: 'medium', diet: 'flexible', dietaryPreferences: '', workStudyPattern: '', typicalDay: '',
  activityContext: '', sleepDurationHours: '', sleepQuality: '', mealRhythm: '', cookingAccess: '',
  stressRecovery: '', injuriesLimitations: '', preferredTrainingWindow: '',
};

function listFromText(value: string): string[] {
  return [...new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, PROFILE_LIMITS.listItems);
}

export function ProfileEditor({ open, onClose, onSaved }: ProfileEditorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    const profile = loadUserProfile();
    if (profile) {
      setDraft({
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    const age = Number(draft.age);
    const heightCm = Number(draft.heightCm);
    const weightKg = Number(draft.weightKg);
    const daysPerWeek = Number(draft.daysPerWeek);
    const sleepHours = draft.sleepDurationHours.trim() ? Number(draft.sleepDurationHours) : null;
    if (!draft.displayName.trim() || draft.displayName.trim().length > PROFILE_LIMITS.displayName) {
      setStatus(`Der Name muss 1–${PROFILE_LIMITS.displayName} Zeichen lang sein.`);
      return;
    }
    if (!Number.isInteger(age) || age < 16 || age > 85 || heightCm < 120 || heightCm > 230 || weightKg < 35 || weightKg > 250) {
      setStatus('Prüfe Alter (16–85), Größe (120–230 cm) und Gewicht (35–250 kg).');
      return;
    }
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 2 || daysPerWeek > 6) {
      setStatus('Trainingstage müssen zwischen 2 und 6 liegen.');
      return;
    }
    if (sleepHours !== null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 16)) {
      setStatus('Die Schlafdauer muss zwischen 0 und 16 Stunden liegen oder leer bleiben.');
      return;
    }

    const saved = patchStoredUserProfile({
      displayName: draft.displayName,
      age,
      heightCm,
      weightKg,
      goal: draft.goal,
      daysPerWeek,
      difficulty: draft.difficulty,
      diet: draft.diet,
      dietaryPreferences: listFromText(draft.dietaryPreferences),
      lifestyle: {
        workStudyPattern: draft.workStudyPattern,
        typicalDay: draft.typicalDay,
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
      setStatus('Das lokale Profil konnte nicht geladen werden.');
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
      lifestyle: saved.lifestyle,
    });
    setStatus('Profil gespeichert. Bestehende Pläne, Routinen und Logs wurden nicht verändert.');
    onSaved();
  };

  return (
    <div className="product-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-panel profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <header className="settings-header">
          <div>
            <h2 id="profile-editor-title">Profil-Dossier bearbeiten</h2>
            <p>Diese Änderung ist nicht-destruktiv: Dein aktueller Trainingsplan wird nicht automatisch ersetzt.</p>
          </div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Profil-Editor schließen"><SystemIcon name="close" /></button>
        </header>
        <form onSubmit={save}>
          <fieldset className="settings-section">
            <legend>Basis & Ziel</legend>
            <div className="shopping-field-grid">
              <label className="system-field wide">Anzeigename<input required maxLength={PROFILE_LIMITS.displayName} value={draft.displayName} onChange={(event) => update('displayName', event.target.value)} /></label>
              <label className="system-field">Alter<input type="number" min="16" max="85" value={draft.age} onChange={(event) => update('age', event.target.value)} /></label>
              <label className="system-field">Größe (cm)<input type="number" min="120" max="230" step="0.1" value={draft.heightCm} onChange={(event) => update('heightCm', event.target.value)} /></label>
              <label className="system-field">Gewicht (kg)<input type="number" min="35" max="250" step="0.1" value={draft.weightKg} onChange={(event) => update('weightKg', event.target.value)} /></label>
              <label className="system-field">Trainingstage<select value={draft.daysPerWeek} onChange={(event) => update('daysPerWeek', event.target.value)}>{[2,3,4,5,6].map((days) => <option value={days} key={days}>{days} pro Woche</option>)}</select></label>
              <label className="system-field">Ziel<select value={draft.goal} onChange={(event) => update('goal', event.target.value as TrainingGoal)}><option value="general_fitness">Allgemeine Fitness</option><option value="build_muscle">Muskelaufbau</option><option value="get_stronger">Kraftaufbau</option><option value="fat_loss">Fettverlust unterstützen</option></select></label>
              <label className="system-field">Intensität<select value={draft.difficulty} onChange={(event) => update('difficulty', event.target.value as PlanDifficulty)}><option value="light">Leicht</option><option value="medium">Mittel</option><option value="hard">Hart</option></select></label>
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Alltag, Schlaf & Erholung</legend>
            <div className="shopping-field-grid">
              <label className="system-field">Arbeit / Studium<input maxLength={PROFILE_LIMITS.shortText} value={draft.workStudyPattern} onChange={(event) => update('workStudyPattern', event.target.value)} /></label>
              <label className="system-field">Bevorzugte Trainingszeit<input maxLength={PROFILE_LIMITS.shortText} value={draft.preferredTrainingWindow} onChange={(event) => update('preferredTrainingWindow', event.target.value)} /></label>
              <label className="system-field wide">Typischer Tag<textarea maxLength={PROFILE_LIMITS.typicalDay} value={draft.typicalDay} onChange={(event) => update('typicalDay', event.target.value)} /></label>
              <label className="system-field wide">Bewegung außerhalb des Trainings<textarea maxLength={PROFILE_LIMITS.activityContext} value={draft.activityContext} onChange={(event) => update('activityContext', event.target.value)} /></label>
              <label className="system-field">Schlafdauer<input type="number" min="0" max="16" step="0.25" value={draft.sleepDurationHours} onChange={(event) => update('sleepDurationHours', event.target.value)} /></label>
              <label className="system-field">Schlafqualität<select value={draft.sleepQuality} onChange={(event) => update('sleepQuality', event.target.value as Draft['sleepQuality'])}><option value="">Keine Angabe</option><option value="poor">Oft schlecht</option><option value="fair">Okay</option><option value="good">Meist gut</option><option value="variable">Wechselhaft</option></select></label>
              <label className="system-field wide">Stress & Erholung<textarea maxLength={PROFILE_LIMITS.healthContext} value={draft.stressRecovery} onChange={(event) => update('stressRecovery', event.target.value)} /></label>
              <label className="system-field wide">Einschränkungen, die berücksichtigt werden sollen<textarea maxLength={PROFILE_LIMITS.healthContext} value={draft.injuriesLimitations} onChange={(event) => update('injuriesLimitations', event.target.value)} /></label>
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Ernährung</legend>
            <div className="shopping-field-grid">
              <label className="system-field">Ernährungsweise<select value={draft.diet} onChange={(event) => update('diet', event.target.value as DietPreference)}><option value="flexible">Flexibel</option><option value="omnivore">Omnivor</option><option value="vegetarian">Vegetarisch</option><option value="vegan">Vegan</option></select></label>
              <label className="system-field">Kochmöglichkeit<select value={draft.cookingAccess} onChange={(event) => update('cookingAccess', event.target.value as Draft['cookingAccess'])}><option value="">Keine Angabe</option><option value="none">Keine regelmäßige Küche</option><option value="limited">Eingeschränkt</option><option value="full">Voll ausgestattet</option></select></label>
              <label className="system-field wide">Mahlzeitenrhythmus<textarea maxLength={PROFILE_LIMITS.mealRhythm} value={draft.mealRhythm} onChange={(event) => update('mealRhythm', event.target.value)} /></label>
              <label className="system-field wide">Weitere Präferenzen (kommagetrennt)<input maxLength={640} value={draft.dietaryPreferences} onChange={(event) => update('dietaryPreferences', event.target.value)} /></label>
            </div>
          </fieldset>

          {status && <p className="shopping-budget-note" role="status">{status}</p>}
          <div className="system-action-bar">
            <button className="system-button quiet" type="button" onClick={onClose}>Abbrechen</button>
            <button className="system-primary-action" type="submit"><SystemIcon name="check" /> Profil speichern</button>
          </div>
        </form>
      </section>
    </div>
  );
}
