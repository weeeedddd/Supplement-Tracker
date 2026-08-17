import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  completeWorkoutSession,
  createDailyWorkout,
  createWorkout,
  fetchWorkouts,
  generatePlan,
  getWorkoutSessions,
  loadWorkoutDraft,
  saveWorkoutProgress,
  type Exercise,
  type PlanFocus,
  type PlanGoal,
  type PlanLevel,
  type Workout,
  type WorkoutCompletion,
  type WorkoutDraft,
  type WorkoutExercisePerformance,
  type WorkoutPerformanceMap,
  type WorkoutSession,
} from '../lib/fitness';
import {
  inferExerciseMuscleTargets,
  loadSessionMuscleLoads,
  parsePlannedDurationSeconds,
  parsePlannedReps,
  parsePlannedWeightKg,
  syncWorkoutSetMuscleLoad,
} from '../lib/exerciseMuscles';
import {
  filterCharacterWorkouts,
  getCharacterPath,
  localizedCharacterCopy,
} from '../lib/characterPaths';
import { loadUserProfile } from '../lib/profile';
import { MUSCLE_IDS, calculateMuscleLoads, muscleLoadColor, type ExerciseMuscleTarget, type MuscleId } from '../lib/muscleLoad';
import { lang, t } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { scheduleRecoveryReminder } from '../lib/notifications';
import { S } from '../lib/storage';
import { refresh } from '../lib/store';
import { PerformanceHero } from './PerformanceHero';
import { MuscleConditionMonitor } from './MuscleConditionMonitor';
import { SystemIcon } from './SystemIcon';
import '../training.css';

const copy = (de: string, en: string) => lang === 'de' ? de : en;
const ACTIVE_DAILY_WORKOUT_KEY = 'train_active_daily_workout';

function loadActiveDailyWorkout(): Workout | null {
  const workout = S.get<Workout>(ACTIVE_DAILY_WORKOUT_KEY);
  if (!workout || workout.source !== 'daily' || !Array.isArray(workout.exercises) || !workout.exercises.length) return null;
  const valid = workout.exercises.every(exercise => (
    typeof exercise.name === 'string'
    && exercise.name.trim().length > 0
    && Number.isInteger(exercise.sets)
    && exercise.sets >= 1
    && exercise.sets <= 10
  ));
  if (!valid) {
    S.del(ACTIVE_DAILY_WORKOUT_KEY);
    return null;
  }
  return workout;
}

const MUSCLE_LABELS: Record<MuscleId, { de: string; en: string }> = {
  shoulders: { de: 'Schultern', en: 'Shoulders' },
  chest: { de: 'Brust', en: 'Chest' },
  biceps: { de: 'Bizeps', en: 'Biceps' },
  core: { de: 'Rumpf', en: 'Core' },
  quads: { de: 'Quadrizeps', en: 'Quads' },
  back: { de: 'Rücken', en: 'Back' },
  triceps: { de: 'Trizeps', en: 'Triceps' },
  glutes: { de: 'Gesäß', en: 'Glutes' },
  hamstrings: { de: 'Beinbeuger', en: 'Hamstrings' },
  calves: { de: 'Waden', en: 'Calves' },
};

function muscleLabel(id: MuscleId): string {
  return lang === 'de' ? MUSCLE_LABELS[id].de : MUSCLE_LABELS[id].en;
}

function initialExercisePerformance(exercise: Exercise): WorkoutExercisePerformance {
  return {
    reps: parsePlannedReps(exercise.reps),
    weightKg: parsePlannedWeightKg(exercise.weight),
    durationSeconds: parsePlannedDurationSeconds(exercise.reps),
  };
}

export function TrainingScreen() {
  const profile = useMemo(() => loadUserProfile(), []);
  const character = profile?.mode === 'inspiration' ? getCharacterPath(profile.inspirationProfile) : null;
  const [plans, setPlans] = useState<Workout[]>([]);
  const [active, setActive] = useState<Workout | null>(null);
  const [creating, setCreating] = useState(false);
  const [manualDaily, setManualDaily] = useState(false);
  const [building, setBuilding] = useState(false);
  const [dailyWorkout, setDailyWorkout] = useState<Workout | null>(() => loadActiveDailyWorkout());
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => getWorkoutSessions());
  const [toast, setToast] = useState('');

  useModalIsolation(Boolean(active || creating || manualDaily || building), {
    backgroundSelectors: ['.training-page', '.system-topbar', '.system-bottom-nav'],
    onEscape: () => { setActive(null); setCreating(false); setManualDaily(false); setBuilding(false); },
  });

  const modalIdentity = active
    ? `tracker:${String(active.id)}`
    : creating ? 'creator:plan' : manualDaily ? 'creator:daily' : building ? 'builder:local' : '';
  useEffect(() => {
    if (!modalIdentity) return;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
    dialogs[dialogs.length - 1]?.querySelector<HTMLElement>('.modal-close, button')?.focus();
  }, [modalIdentity]);

  const load = () => {
    void fetchWorkouts().then(workouts => setPlans(
      character ? filterCharacterWorkouts(workouts, character.id) : workouts,
    ));
  };
  useEffect(load, []);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const finishWorkout = async (workout: Workout, draft: WorkoutDraft): Promise<WorkoutCompletion> => {
    const result = await completeWorkoutSession(workout, draft);
    if (result.status === 'completed') {
      if (result.session) scheduleRecoveryReminder(workout.name, result.session.completedAt);
      if (workout.source === 'daily') {
        S.del(ACTIVE_DAILY_WORKOUT_KEY);
        setDailyWorkout(null);
      }
      setActive(null);
      setSessions(getWorkoutSessions());
      refresh();
      flash(copy(`${workout.name} mit ${result.session?.completedSets ?? 0} Sätzen gespeichert.`, `${workout.name} saved with ${result.session?.completedSets ?? 0} completed sets.`));
    } else if (result.status === 'already-completed') {
      if (workout.source === 'daily') {
        S.del(ACTIVE_DAILY_WORKOUT_KEY);
        setDailyWorkout(null);
      }
      setActive(null);
      flash(copy('Diese Einheit wurde bereits gespeichert.', 'This session was already saved.'));
    } else {
      flash(copy('Schließe zuerst alle Sätze ab.', 'Complete every set first.'));
    }
    return result;
  };

  const useGeneratedPlan = (workout: Workout) => {
    setBuilding(false);
    load();
    setActive(workout);
    flash(copy('Der lokale Plan ist bereit.', 'The local plan is ready.'));
  };

  return (
    <section className="screen active system-screen" id="screen-training">
      <div className="system-page training-page">
        <PerformanceHero
          variant="training"
          icon="training"
          title={copy('Training', 'Training')}
          description={copy(
            character
              ? `${character.name}: ${localizedCharacterCopy(character.focus, 'de')}`
              : 'Baue die heutige Einheit selbst oder nutze einen transparent erzeugten lokalen Plan. Gespeichert werden nur vollständig abgehakte Sätze.',
            character
              ? `${character.name}: ${localizedCharacterCopy(character.focus, 'en')}`
              : 'Build today’s session yourself or use a transparently generated local plan. Only fully checked sets are saved.',
          )}
          status={(
            <>
              <span><small>{copy('Pläne', 'Plans')}</small><strong>{plans.length}</strong></span>
              <span><small>{copy('Einheiten', 'Sessions')}</small><strong>{sessions.length}</strong></span>
              <span><small>{copy('Letzte Einheit', 'Latest')}</small><strong>{sessions[0] ? new Date(sessions[0].completedAt).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB') : '–'}</strong></span>
            </>
          )}
        />

        <MuscleConditionMonitor />

        {character && <section className="character-path-banner" aria-labelledby="character-path-title">
          <span className="character-path-rank">{copy('AUSGERÜSTETER PFAD', 'EQUIPPED PATH')}</span>
          <div>
            <SystemIcon name="spark" />
            <span><strong id="character-path-title">{character.name} — {localizedCharacterCopy(character.title, lang)}</strong><small>{localizedCharacterCopy(character.systemMessage, lang)}</small></span>
          </div>
          <div className="character-path-tags">{character.tags.map(tag => <span key={tag.en}>{localizedCharacterCopy(tag, lang)}</span>)}</div>
        </section>}

        {!character && <section className="training-mode-grid" aria-label={copy('Training auswählen', 'Choose training mode')}>
          <button type="button" className="training-mode primary" onClick={() => dailyWorkout ? setActive(dailyWorkout) : setManualDaily(true)}>
            <SystemIcon name="edit" />
            <span>
              <strong>{dailyWorkout ? copy('Tagestraining fortsetzen', 'Resume daily workout') : copy('Tagestraining bauen', 'Build today’s workout')}</strong>
              <small>{dailyWorkout ? copy('Deine abgehakten Sätze sind lokal gespeichert', 'Your completed sets are saved locally') : copy('Übungen und Sätze selbst festlegen', 'Choose exercises and sets yourself')}</small>
            </span>
            <SystemIcon name="chevron" />
          </button>
          <button type="button" className="training-mode" onClick={() => setBuilding(true)}>
            <SystemIcon name="spark" />
            <span><strong>{copy('Lokalen Plan erzeugen', 'Generate local plan')}</strong><small>{copy('Regelbasiert, nachvollziehbar und offline', 'Rule-based, transparent, and offline')}</small></span>
            <SystemIcon name="chevron" />
          </button>
          <button type="button" className="training-mode" onClick={() => setCreating(true)}>
            <SystemIcon name="plus" />
            <span><strong>{copy('Wiederverwendbaren Plan anlegen', 'Create reusable plan')}</strong><small>{copy('Für deine persönliche Bibliothek', 'For your personal library')}</small></span>
            <SystemIcon name="chevron" />
          </button>
        </section>}

        <section className="system-ledger training-plan-ledger" aria-labelledby="training-plan-title">
          <header className="ledger-heading">
            <span aria-hidden="true"><SystemIcon name="plan" /></span>
            <h2 id="training-plan-title">{character
              ? copy(`${character.name} Charakter-Workouts`, `${character.name} character workouts`)
              : copy('Gespeicherte Pläne', 'Saved plans')}</h2>
            <small>{plans.length}</small>
          </header>
          <div className="plan-list">
            {plans.map(workout => (
              <button className="plan-card" type="button" key={String(workout.id)} onClick={() => setActive(workout)}>
                <span className="plan-ic" aria-hidden="true"><SystemIcon name="training" /></span>
                <span className="plan-body"><strong className="plan-name">{workout.name}</strong><span className="plan-focus">{workout.focus || copy('Kein Fokus angegeben', 'No focus specified')}</span></span>
                <span className="plan-count"><b>{workout.exercises.length}</b><small>{copy('Übungen', 'exercises')}</small></span>
                <SystemIcon name="chevron" />
              </button>
            ))}
            {!plans.length && (
              <div className="system-empty compact"><SystemIcon name="training" /><div><strong>{copy('Noch keine Pläne', 'No plans yet')}</strong><p>{character
                ? copy('Speichere dein Inspirationsprofil erneut, um den exklusiven Charakter-Pfad zu erzeugen.', 'Save your inspiration profile again to generate the exclusive character path.')
                : copy('Erstelle einen eigenen oder lokalen Plan.', 'Create your own or generate a local plan.')}</p></div></div>
            )}
          </div>
        </section>

        <section className="system-ledger training-history" aria-labelledby="training-history-title">
          <header className="ledger-heading"><span aria-hidden="true"><SystemIcon name="history" /></span><h2 id="training-history-title">{copy('Letzte Einheiten', 'Recent sessions')}</h2></header>
          {sessions.length ? sessions.slice(0, 5).map(session => (
            <article className="training-history-row" key={session.id}>
              <span><strong>{session.name}</strong><small>{new Date(session.completedAt).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}</small></span>
              <span>{session.completedSets} / {session.totalSets} {copy('Sätze', 'sets')}</span>
            </article>
          )) : <div className="system-empty compact"><SystemIcon name="history" /><div><strong>{copy('Noch keine abgeschlossene Einheit', 'No completed session yet')}</strong><p>{copy('Erst vollständig abgehakte Sätze werden hier gespeichert.', 'Only fully checked sets are saved here.')}</p></div></div>}
        </section>
      </div>

      {active && <LiveTracker plan={active} onClose={() => setActive(null)} onFinish={draft => finishWorkout(active, draft)} />}
      {creating && <WorkoutCreator mode="plan" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {manualDaily && <WorkoutCreator mode="daily" onClose={() => setManualDaily(false)} onStarted={workout => {
        S.set(ACTIVE_DAILY_WORKOUT_KEY, workout);
        setDailyWorkout(workout);
        setManualDaily(false);
        setActive(workout);
      }} />}
      {building && <LocalPlanBuilder onClose={() => setBuilding(false)} onGenerated={useGeneratedPlan} />}
      {toast && <div className="system-toast" role="status" aria-live="polite"><SystemIcon name="check" /><span>{toast}</span></div>}
    </section>
  );
}

function LiveTracker({
  plan,
  onClose,
  onFinish,
}: {
  plan: Workout;
  onClose: () => void;
  onFinish: (draft: WorkoutDraft) => Promise<WorkoutCompletion>;
}) {
  const [draft, setDraft] = useState<WorkoutDraft>(() => loadWorkoutDraft(plan));
  const [done, setDone] = useState(() => draft.completedSets);
  const [performance, setPerformance] = useState<WorkoutPerformanceMap>(() => Object.fromEntries(
    plan.exercises.map((exercise, index) => [
      index,
      draft.performance?.[index] || initialExercisePerformance(exercise),
    ]),
  ));
  const [sessionLoads, setSessionLoads] = useState<Record<MuscleId, number>>(() => loadSessionMuscleLoads(draft.sessionId));
  const [feedback, setFeedback] = useState<{ exerciseName: string; targets: ExerciseMuscleTarget[] } | null>(null);
  const [finishing, setFinishing] = useState(false);

  const toggle = (exerciseIndex: number, setIndex: number) => {
    if (finishing) return;
    const next = { ...done, [exerciseIndex]: [...(done[exerciseIndex] || [])] };
    const completed = !next[exerciseIndex][setIndex];
    next[exerciseIndex][setIndex] = completed;
    const exercise = plan.exercises[exerciseIndex];
    const result = syncWorkoutSetMuscleLoad({
      exercise,
      sessionId: draft.sessionId,
      exerciseIndex,
      setIndex,
      completed,
      performance: performance[exerciseIndex] || initialExercisePerformance(exercise),
    });
    setDone(next);
    setSessionLoads(calculateMuscleLoads(result.entries.filter(entry => entry.sessionId === draft.sessionId)));
    setFeedback({ exerciseName: exercise.name, targets: result.targets });
    setDraft(saveWorkoutProgress(plan, draft.sessionId, next, draft.startedAt, performance));
  };

  const updatePerformance = (exerciseIndex: number, patch: Partial<WorkoutExercisePerformance>) => {
    const current = performance[exerciseIndex] || initialExercisePerformance(plan.exercises[exerciseIndex]);
    const nextValue: WorkoutExercisePerformance = {
      reps: Math.max(0, Math.min(200, Math.floor(Number(patch.reps ?? current.reps) || 0))),
      weightKg: Math.max(0, Math.min(500, Number(patch.weightKg ?? current.weightKg) || 0)),
      durationSeconds: Math.max(0, Math.min(21_600, Math.floor(Number(patch.durationSeconds ?? current.durationSeconds) || 0))),
    };
    const next = { ...performance, [exerciseIndex]: nextValue };
    setPerformance(next);
    setDraft(saveWorkoutProgress(plan, draft.sessionId, done, draft.startedAt, next));
  };

  const total = plan.exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.sets), 0);
  const checked = Object.values(done).reduce((sum, sets) => sum + sets.filter(Boolean).length, 0);
  const canFinish = total > 0 && checked === total && !finishing;
  const activeSessionMuscles = MUSCLE_IDS
    .map(id => ({ id, load: sessionLoads[id] }))
    .filter(item => item.load > 0)
    .sort((a, b) => b.load - a.load);
  const sessionPeak = activeSessionMuscles[0]?.load || 0;

  const finish = async () => {
    if (!canFinish) return;
    setFinishing(true);
    const result = await onFinish({ ...draft, completedSets: done, performance, updatedAt: Date.now() });
    if (result.status !== 'completed' && result.status !== 'already-completed') setFinishing(false);
  };

  return createPortal(
    <div className="hub-modal open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hub-box hub-box-lg" role="dialog" aria-modal="true" aria-labelledby="tracker-title" onMouseDown={event => event.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title" id="tracker-title"><SystemIcon name="training" />{plan.name}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label={copy('Training schließen', 'Close workout')}><SystemIcon name="close" /></button>
        </div>
        <div className="tracker-prog">
          <div className="tracker-prog-bar" role="progressbar" aria-label={copy('Abgeschlossene Sätze', 'Completed sets')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={checked}>
            <div style={{ transform: `scaleX(${total ? checked / total : 0})` }} />
          </div>
          <span>{checked} / {total} {copy('Sätze', 'sets')}</span>
        </div>
        <div className="hub-box-body">
          <section className="tracker-strain-panel" aria-live="polite" aria-label={copy('Live Muskelbelastung der Einheit', 'Live session muscle strain')}>
            <header>
              <span><SystemIcon name="target" /><strong>{copy('Live-Session-Ermüdung', 'Live session fatigue')}</strong></span>
              <b style={{ color: muscleLoadColor(sessionPeak) }}>{sessionPeak}%</b>
            </header>
            {feedback ? <>
              <p><strong>{feedback.exerciseName}</strong>{copy(' wurde direkt auf die Muskelkarte übertragen.', ' was applied directly to the muscle map.')}</p>
              <div className="tracker-target-grid">
                {feedback.targets.map(targetItem => <span key={targetItem.muscleId}>
                  <small>{targetItem.role === 'primary' ? copy('PRIMÄR', 'PRIMARY') : 'SUPPORT'} {Math.round(targetItem.share * 100)}%</small>
                  <strong>{muscleLabel(targetItem.muscleId)}</strong>
                  <i><em style={{ width: `${sessionLoads[targetItem.muscleId]}%`, background: muscleLoadColor(sessionLoads[targetItem.muscleId]) }} /></i>
                  <b>{sessionLoads[targetItem.muscleId]}%</b>
                </span>)}
              </div>
            </> : <p>{copy('Schließe einen Satz ab. Primär- und Stützmuskeln erscheinen sofort mit ihrer Belastungsverteilung.', 'Complete a set. Primary and support muscles appear immediately with their load distribution.')}</p>}
            {activeSessionMuscles.length > 0 && <div className="tracker-session-ribbon">
              {activeSessionMuscles.slice(0, 5).map(item => <span key={item.id}><small>{muscleLabel(item.id)}</small><strong style={{ color: muscleLoadColor(item.load) }}>{item.load}%</strong></span>)}
            </div>}
          </section>

          {plan.exercises.map((exercise: Exercise, exerciseIndex) => {
            const targets = inferExerciseMuscleTargets(exercise);
            const metrics = performance[exerciseIndex] || initialExercisePerformance(exercise);
            return <section className="tx-exercise" key={`${exercise.name}-${exerciseIndex}`}>
              <div className="tx-head">
                <span className="tx-name">{exercise.name}</span>
                <span className="tx-spec">{exercise.reps} × {exercise.weight || '–'} · <SystemIcon name="clock" />{exercise.rest}s</span>
              </div>
              <div className="tx-muscle-targets" aria-label={copy('Zielmuskeln', 'Target muscles')}>
                {targets.map(targetItem => <span className={targetItem.role} key={targetItem.muscleId}>
                  <small>{targetItem.role === 'primary' ? copy('Primär', 'Primary') : copy('Support', 'Support')}</small>
                  <strong>{muscleLabel(targetItem.muscleId)}</strong>
                  <b>{Math.round(targetItem.share * 100)}%</b>
                </span>)}
              </div>
              <div className="tx-live-inputs">
                <label><span>{copy('Wdh.', 'Reps')}</span><input type="number" inputMode="numeric" min="0" max="200" value={metrics.reps} onChange={event => updatePerformance(exerciseIndex, { reps: Number(event.target.value) })} /></label>
                <label><span>{copy('Gewicht', 'Weight')}</span><span className="tx-unit-input"><input type="number" inputMode="decimal" min="0" max="500" step="0.5" value={metrics.weightKg} onChange={event => updatePerformance(exerciseIndex, { weightKg: Number(event.target.value) })} /><small>KG</small></span></label>
                <label><span>{copy('Zeit', 'Time')}</span><span className="tx-unit-input"><input type="number" inputMode="numeric" min="0" max="21600" value={metrics.durationSeconds} onChange={event => updatePerformance(exerciseIndex, { durationSeconds: Number(event.target.value) })} /><small>SEC</small></span></label>
              </div>
              <div className="tx-sets">
                {(done[exerciseIndex] || []).map((isDone, setIndex) => (
                  <button
                    type="button"
                    key={setIndex}
                    className={`tx-set${isDone ? ' done' : ''}`}
                    onClick={() => toggle(exerciseIndex, setIndex)}
                    aria-pressed={isDone}
                    aria-label={`${exercise.name}, ${copy('Satz', 'set')} ${setIndex + 1}`}
                  >
                    {isDone ? <SystemIcon name="check" /> : setIndex + 1}
                  </button>
                ))}
              </div>
            </section>;
          })}
          {!canFinish && !finishing && <p className="tracker-hint" role="status">{copy('Schließe alle Sätze ab, um das Training zu speichern.', 'Complete every set to save the workout.')}</p>}
          <button className="system-primary-action hub-log-btn" type="button" onClick={() => void finish()} disabled={!canFinish}>
            <SystemIcon name="check" />{finishing ? copy('Speichern…', 'Saving…') : copy('Training speichern', 'Save workout')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WorkoutCreator({
  mode,
  onClose,
  onSaved,
  onStarted,
}: {
  mode: 'plan' | 'daily';
  onClose: () => void;
  onSaved?: () => void;
  onStarted?: (workout: Workout) => void;
}) {
  const [name, setName] = useState(mode === 'daily' ? copy('Heutiges Training', 'Today’s workout') : '');
  const [kind, setKind] = useState('split');
  const [focus, setFocus] = useState(mode === 'daily' ? copy('Heute', 'Today') : '');
  const [rows, setRows] = useState<Exercise[]>([{ name: '', sets: 3, reps: '10', weight: '', rest: 60 }]);
  const [error, setError] = useState('');

  const setRow = (index: number, patch: Partial<Exercise>) => setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const addRow = () => setRows(current => [...current, { name: '', sets: 3, reps: '10', weight: '', rest: 60 }]);
  const deleteRow = (index: number) => setRows(current => current.filter((_, rowIndex) => rowIndex !== index));

  const save = async () => {
    setError('');
    const exercises = rows.filter(row => row.name.trim()).map(row => ({ ...row, name: row.name.trim() }));
    if (!name.trim() || !exercises.length) {
      setError(copy('Gib dem Training einen Namen und füge mindestens eine Übung hinzu.', 'Name the workout and add at least one exercise.'));
      return;
    }
    const input = { name: name.trim(), kind, focus: focus.trim(), exercises, icon: '', source: 'manual' as const };
    if (mode === 'daily') {
      onStarted?.(createDailyWorkout(input));
      return;
    }
    await createWorkout(input);
    onSaved?.();
  };

  return createPortal(
    <div className="hub-modal open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hub-box hub-box-lg" role="dialog" aria-modal="true" aria-labelledby="workout-creator-title" onMouseDown={event => event.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title" id="workout-creator-title"><SystemIcon name="edit" />{mode === 'daily' ? copy('Tagestraining bauen', 'Build today’s workout') : copy('Plan anlegen', 'Create plan')}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label={copy('Training-Editor schließen', 'Close workout editor')}><SystemIcon name="close" /></button>
        </div>
        <div className="hub-box-body">
          <label className="system-field wide"><span>{copy('Name', 'Name')}</span><input className="hub-input" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
          <div className="hub-row2">
            <label className="system-field"><span>{copy('Art', 'Type')}</span><select className="hub-input" value={kind} onChange={event => setKind(event.target.value)}>{['split', 'fullbody', 'push', 'pull', 'legs'].map(item => <option key={item} value={item}>{t(`kind_${item}`)}</option>)}</select></label>
            <label className="system-field"><span>{copy('Fokus', 'Focus')}</span><input className="hub-input" maxLength={100} value={focus} onChange={event => setFocus(event.target.value)} /></label>
          </div>
          <div className="tx-editor">
            {rows.map((row, index) => (
              <fieldset className="tx-erow" key={index}>
                <legend>{copy('Übung', 'Exercise')} {index + 1}</legend>
                <label className="system-field tx-en"><span>{copy('Name', 'Name')}</span><input className="hub-input" value={row.name} onChange={event => setRow(index, { name: event.target.value })} /></label>
                <label className="system-field tx-es"><span>{copy('Sätze', 'Sets')}</span><input className="hub-input" type="number" inputMode="numeric" min="1" max="10" value={row.sets} onChange={event => setRow(index, { sets: Math.max(1, Math.min(10, Number.parseInt(event.target.value, 10) || 1)) })} /></label>
                <label className="system-field tx-er"><span>{copy('Wdh.', 'Reps')}</span><input className="hub-input" maxLength={24} value={row.reps} onChange={event => setRow(index, { reps: event.target.value })} /></label>
                <label className="system-field tx-ew"><span>{copy('Gewicht', 'Weight')}</span><input className="hub-input" maxLength={24} value={row.weight} onChange={event => setRow(index, { weight: event.target.value })} /></label>
                {rows.length > 1 && <button className="tx-del" type="button" onClick={() => deleteRow(index)} aria-label={`${copy('Übung', 'Exercise')} ${index + 1} ${copy('löschen', 'delete')}`}><SystemIcon name="delete" /></button>}
              </fieldset>
            ))}
            <button className="system-button quiet tx-add" type="button" onClick={addRow}><SystemIcon name="plus" />{copy('Übung hinzufügen', 'Add exercise')}</button>
          </div>
          {error && <p className="system-inline-error" role="alert">{error}</p>}
          <button className="system-primary-action" type="button" onClick={() => void save()}>{mode === 'daily' ? copy('Training starten', 'Start workout') : copy('Plan speichern', 'Save plan')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LocalPlanBuilder({ onClose, onGenerated }: { onClose: () => void; onGenerated: (workout: Workout) => void }) {
  const [level, setLevel] = useState<PlanLevel>('beginner');
  const [goal, setGoal] = useState<PlanGoal>('muscle');
  const [focus, setFocus] = useState<PlanFocus>('push');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const levels: PlanLevel[] = ['beginner', 'advanced', 'elite'];
  const goals: PlanGoal[] = ['muscle', 'strength', 'endurance', 'definition'];
  const focuses: PlanFocus[] = ['push', 'pull', 'legs', 'fullbody'];
  const preview = generatePlan({ level, goal, focus, days });

  const generate = async () => {
    setBusy(true);
    const saved = await createWorkout(preview);
    onGenerated(saved);
  };

  return createPortal(
    <div className="hub-modal open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hub-box hub-box-lg" role="dialog" aria-modal="true" aria-labelledby="local-plan-title" onMouseDown={event => event.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title" id="local-plan-title"><SystemIcon name="spark" />{copy('Lokalen Plan erzeugen', 'Generate local plan')}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label={copy('Plan-Generator schließen', 'Close plan generator')}><SystemIcon name="close" /></button>
        </div>
        <div className="hub-box-body">
          <p className="local-builder-note"><SystemIcon name="info" />{copy('Dieser Plan entsteht aus festen Trainingsregeln auf deinem Gerät – nicht aus einer entfernten KI.', 'This plan is built from fixed training rules on your device — not by remote AI.')}</p>
          <OptionGroup label={copy('Erfahrung', 'Experience')} values={levels} selected={level} onSelect={value => setLevel(value as PlanLevel)} translationPrefix="lvl_" />
          <OptionGroup label={copy('Ziel', 'Goal')} values={goals} selected={goal} onSelect={value => setGoal(value as PlanGoal)} translationPrefix="goal_" />
          <OptionGroup label={copy('Fokus', 'Focus')} values={focuses} selected={focus} onSelect={value => setFocus(value as PlanFocus)} translationPrefix="kind_" />
          <div className="ai-field">
            <span className="ai-label">{copy('Trainingstage pro Woche', 'Training days per week')}: <b>{days}</b></span>
            <div className="ai-seg">{[2, 3, 4, 5, 6].map(value => <button type="button" key={value} className={`ai-opt${days === value ? ' sel' : ''}`} aria-pressed={days === value} onClick={() => setDays(value)}>{value}</button>)}</div>
          </div>
          <section className="ai-preview" aria-labelledby="local-preview-title">
            <div className="ai-preview-hd" id="local-preview-title"><SystemIcon name="plan" /><span>{preview.name}</span></div>
            <div className="ai-preview-focus">{preview.focus}</div>
            <div className="ai-preview-list">{preview.exercises.map((exercise, index) => <div className="ai-preview-ex" key={`${exercise.name}-${index}`}><span className="ai-px-n">{exercise.name}</span><span className="ai-px-s">{exercise.sets} × {exercise.reps} · <SystemIcon name="clock" />{exercise.rest}s</span></div>)}</div>
          </section>
          <button className="system-primary-action ai-gen-btn" type="button" onClick={() => void generate()} disabled={busy}><SystemIcon name="check" />{busy ? copy('Speichern…', 'Saving…') : copy('Plan speichern und starten', 'Save and start plan')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OptionGroup({
  label,
  values,
  selected,
  onSelect,
  translationPrefix,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
  translationPrefix: string;
}) {
  return (
    <div className="ai-field">
      <span className="ai-label">{label}</span>
      <div className="ai-seg ai-seg-2">
        {values.map(value => <button type="button" key={value} className={`ai-opt${selected === value ? ' sel' : ''}`} aria-pressed={selected === value} onClick={() => onSelect(value)}>{t(`${translationPrefix}${value}`)}</button>)}
      </div>
    </div>
  );
}
