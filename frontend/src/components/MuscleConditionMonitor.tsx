import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter';

import {
  MUSCLE_IDS,
  MUSCLE_LOAD_STORAGE_KEY,
  MUSCLE_LOAD_UPDATED_EVENT,
  calculateMuscleLoads,
  getMuscleLoadBand,
  muscleLoadColor,
  sanitizeMuscleLoadEntries,
  type MuscleId,
  type MuscleLoadEntry,
  type MuscleLoadSource,
  type ExerciseMuscleTarget,
} from '../lib/muscleLoad';
import { lang } from '../lib/i18n';
import { loadUserProfile } from '../lib/profile';
import { S } from '../lib/storage';
import { detectDeload, lighterSession, type DeloadLevel } from '../lib/deload';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;
const DRAFT_STORAGE_KEY = 'train_muscle_load_drafts_v1';

interface MuscleInputDraft {
  sets: number;
  reps: number;
  durationMinutes: number;
  completedSets: number;
  updatedAt: number;
}

interface MuscleZone {
  id: MuscleId;
  de: string;
  en: string;
  overlay: [number, number];
}

const MUSCLE_ZONES: MuscleZone[] = [
  { id: 'shoulders', de: 'Schultern', en: 'Shoulders', overlay: [36, 30] },
  { id: 'chest', de: 'Brust', en: 'Chest', overlay: [36, 35] },
  { id: 'biceps', de: 'Bizeps', en: 'Biceps', overlay: [28, 41] },
  { id: 'core', de: 'Rumpf', en: 'Core', overlay: [36, 47] },
  { id: 'quads', de: 'Quadrizeps', en: 'Quads', overlay: [36, 66] },
  { id: 'back', de: 'Rücken', en: 'Back', overlay: [69, 39] },
  { id: 'triceps', de: 'Trizeps', en: 'Triceps', overlay: [78, 41] },
  { id: 'glutes', de: 'Gesäß', en: 'Glutes', overlay: [69, 56] },
  { id: 'hamstrings', de: 'Beinbeuger', en: 'Hamstrings', overlay: [69, 68] },
  { id: 'calves', de: 'Waden', en: 'Calves', overlay: [69, 82] },
];

const SLUG_TO_MUSCLE: Partial<Record<Slug, MuscleId>> = {
  abs: 'core',
  obliques: 'core',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  deltoids: 'shoulders',
  gluteal: 'glutes',
  hamstring: 'hamstrings',
  'lower-back': 'back',
  'upper-back': 'back',
  trapezius: 'back',
  quadriceps: 'quads',
  adductors: 'quads',
  triceps: 'triceps',
  forearm: 'biceps',
};

const BODY_REGION_GROUPS: Array<{ id: string; de: string; en: string; muscles: MuscleId[] }> = [
  { id: 'upper', de: 'Oberkörper', en: 'Upper body', muscles: ['shoulders', 'chest', 'biceps', 'triceps', 'back'] },
  { id: 'core', de: 'Rumpf', en: 'Core', muscles: ['core', 'back'] },
  { id: 'lower', de: 'Unterkörper', en: 'Lower body', muscles: ['quads', 'glutes', 'hamstrings', 'calves'] },
];

const FIGURE_PINS: Record<'front' | 'back', Partial<Record<MuscleId, [number, number]>>> = {
  front: {
    shoulders: [50, 23], chest: [50, 29], biceps: [19, 36], core: [50, 43], quads: [50, 64], calves: [50, 83],
  },
  back: {
    shoulders: [50, 23], back: [50, 34], triceps: [81, 36], glutes: [50, 52], hamstrings: [50, 66], calves: [50, 83],
  },
};

interface WorkoutLoadEventDetail {
  muscleIds?: MuscleId[];
  primaryMuscleId?: MuscleId;
  exerciseName?: string;
  targets?: ExerciseMuscleTarget[];
}

const DEFAULT_DRAFT: MuscleInputDraft = {
  sets: 3,
  reps: 10,
  durationMinutes: 30,
  completedSets: 0,
  updatedAt: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDraft(value: Partial<MuscleInputDraft> | undefined): MuscleInputDraft {
  const sets = clamp(Math.floor(Number(value?.sets) || DEFAULT_DRAFT.sets), 1, 12);
  return {
    sets,
    reps: clamp(Math.floor(Number(value?.reps) || 0), 0, 200),
    durationMinutes: clamp(Math.floor(Number(value?.durationMinutes) || 0), 0, 360),
    completedSets: clamp(Math.floor(Number(value?.completedSets) || 0), 0, sets),
    updatedAt: Number.isFinite(Number(value?.updatedAt)) ? Number(value?.updatedAt) : 0,
  };
}

function loadDrafts(): Partial<Record<MuscleId, MuscleInputDraft>> {
  const stored = S.get<unknown>(DRAFT_STORAGE_KEY);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const source = stored as Record<string, Partial<MuscleInputDraft>>;
  return Object.fromEntries(MUSCLE_IDS.flatMap(id => source[id] ? [[id, normalizeDraft(source[id])]] : []));
}

function zoneLabel(zone: MuscleZone): string {
  return lang === 'de' ? zone.de : zone.en;
}

function bandLabel(load: number): string {
  const band = getMuscleLoadBand(load);
  if (band === 'strained') return copy('Hohe Belastung', 'High load');
  if (band === 'loaded') return copy('Aktiv belastet', 'Active load');
  return copy('Niedrige Belastung', 'Low load');
}

function relativeTime(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return copy('gerade eben', 'just now');
  if (minutes < 60) return copy(`vor ${minutes} Min.`, `${minutes}m ago`);
  const hours = Math.round(minutes / 60);
  return copy(`vor ${hours} Std.`, `${hours}h ago`);
}

function entryId(): string {
  return globalThis.crypto?.randomUUID?.() || `muscle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MuscleConditionMonitor() {
  const profile = useMemo(() => loadUserProfile(), []);
  const modelGender = profile?.gender === 'f' ? 'female' : 'male';
  const modelLabel = profile?.gender === 'f'
    ? copy('WEIBLICHES MODELL', 'FEMALE MODEL')
    : profile?.gender === 'x'
      ? copy('NEUTRALES MODELL', 'NEUTRAL MODEL')
      : copy('MÄNNLICHES MODELL', 'MALE MODEL');
  const [entries, setEntries] = useState<MuscleLoadEntry[]>(() => sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY)));
  const [drafts, setDrafts] = useState<Partial<Record<MuscleId, MuscleInputDraft>>>(() => loadDrafts());
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const [flashing, setFlashing] = useState<MuscleId[]>([]);
  const [lastWorkoutEvent, setLastWorkoutEvent] = useState<WorkoutLoadEventDetail | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const firstInputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onMuscleLoadUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkoutLoadEventDetail>).detail || {};
      setEntries(sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY)));
      setClock(Date.now());
      setLastWorkoutEvent(detail);
      const ids = detail.muscleIds?.filter(id => MUSCLE_IDS.includes(id)) || [];
      if (ids.length) flashZones(ids);
    };
    window.addEventListener(MUSCLE_LOAD_UPDATED_EVENT, onMuscleLoadUpdated);
    return () => window.removeEventListener(MUSCLE_LOAD_UPDATED_EVENT, onMuscleLoadUpdated);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const frame = window.requestAnimationFrame(() => firstInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
  }, []);

  const loads = useMemo(() => calculateMuscleLoads(entries, clock), [entries, clock]);
  const deload = useMemo(() => detectDeload(entries, clock), [entries, clock]);
  const lighter = useMemo(() => lighterSession(entries, deload, clock), [entries, deload, clock]);
  const selectedZone = selected ? MUSCLE_ZONES.find(zone => zone.id === selected) || null : null;
  const draft = selected ? drafts[selected] || DEFAULT_DRAFT : DEFAULT_DRAFT;
  const selectedLoad = selected ? loads[selected] : 0;
  const peakLoad = Math.max(0, ...Object.values(loads));
  const activeZones = MUSCLE_IDS.filter(id => loads[id] > 0).length;
  const selectedEntries = selected ? entries.filter(entry => entry.muscleId === selected).slice(0, 3) : [];
  const remainingSets = Math.max(0, draft.sets - draft.completedSets);

  const updateDraft = (id: MuscleId, patch: Partial<MuscleInputDraft>) => {
    setDrafts(current => {
      const nextDraft = normalizeDraft({ ...(current[id] || DEFAULT_DRAFT), ...patch, updatedAt: Date.now() });
      const next = { ...current, [id]: nextDraft };
      S.set(DRAFT_STORAGE_KEY, next);
      return next;
    });
  };

  function flashZones(ids: MuscleId[]) {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    setFlashing([]);
    window.requestAnimationFrame(() => setFlashing(ids));
    flashTimerRef.current = window.setTimeout(() => setFlashing([]), 760);
  }

  const flashZone = (id: MuscleId) => flashZones([id]);

  const addEntry = (
    id: MuscleId,
    sets: number,
    reps: number,
    durationMinutes: number,
    source: MuscleLoadSource,
  ) => {
    const entry: MuscleLoadEntry = {
      id: entryId(),
      muscleId: id,
      sets,
      reps,
      durationMinutes,
      createdAt: Date.now(),
      source,
    };
    setEntries(current => {
      const next = [entry, ...current].slice(0, 500);
      S.set(MUSCLE_LOAD_STORAGE_KEY, next);
      return next;
    });
    setClock(Date.now());
    flashZone(id);
  };

  const completeSet = () => {
    if (!selected || draft.completedSets >= draft.sets) return;
    addEntry(selected, 1, draft.reps, draft.durationMinutes / draft.sets, 'set');
    updateDraft(selected, { completedSets: draft.completedSets + 1 });
  };

  const logRemaining = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || remainingSets <= 0) return;
    addEntry(
      selected,
      remainingSets,
      draft.reps,
      draft.durationMinutes * (remainingSets / draft.sets),
      'session',
    );
    updateDraft(selected, { completedSets: draft.sets });
  };

  const undoLast = () => {
    if (!selected) return;
    const index = entries.findIndex(entry => entry.muscleId === selected);
    if (index < 0) return;
    const removed = entries[index];
    const next = entries.filter((_, entryIndex) => entryIndex !== index);
    setEntries(next);
    S.set(MUSCLE_LOAD_STORAGE_KEY, next);
    updateDraft(selected, { completedSets: Math.max(0, draft.completedSets - removed.sets) });
    setClock(Date.now());
    flashZone(selected);
  };

  const selectZone = (id: MuscleId) => setSelected(current => current === id ? null : id);
  const bodyData = useMemo<ExtendedBodyPart[]>(() => Object.entries(SLUG_TO_MUSCLE).map(([slug, muscleId]) => {
    const load = loads[muscleId];
    const active = selected === muscleId;
    return {
      slug: slug as Slug,
      color: muscleLoadColor(load),
      styles: {
        fill: muscleLoadColor(load),
        stroke: active ? '#d9fff5' : load > 0 ? muscleLoadColor(Math.min(100, load + 15)) : '#41504d',
        strokeWidth: active ? 5 : 2,
      },
    };
  }), [loads, selected]);

  const handleBodyPart = (part: ExtendedBodyPart) => {
    const muscleId = part.slug ? SLUG_TO_MUSCLE[part.slug] : undefined;
    if (muscleId) selectZone(muscleId);
  };

  const zoneAverage = (ids: MuscleId[]) => Math.round(ids.reduce((sum, id) => sum + loads[id], 0) / ids.length);

  return (
    <section className="system-ledger muscle-monitor" aria-labelledby="muscle-monitor-title">
      <header className="ledger-heading muscle-monitor-heading">
        <span aria-hidden="true"><SystemIcon name="target" /></span>
        <h2 id="muscle-monitor-title">{copy('Muskelzustand', 'Muscle condition')}</h2>
        <small>{copy('48 Std. Belastung', '48h load')}</small>
      </header>

      <div className="muscle-monitor-summary" aria-label={copy('Belastungsübersicht', 'Load summary')}>
        <span><small>{copy('Spitze', 'Peak')}</small><strong>{peakLoad}%</strong></span>
        <span><small>{copy('Aktive Zonen', 'Active zones')}</small><strong>{activeZones}</strong></span>
        <span><small>{copy('Eingaben', 'Entries')}</small><strong>{entries.length}</strong></span>
      </div>

      {deload.level !== 'none' && (
        <DeloadNotice level={deload.level} reasons={deload.reasons} lighter={lighter} loads={loads} />
      )}

      <div className="muscle-monitor-layout">
        <div className="muscle-map-stage">
          <div className="anatomy-console" role="group" aria-label={copy('Interaktive Muskelkarte, Vorder- und Rückseite', 'Interactive front and back muscle map')}>
            <aside className="body-region-index" aria-label={copy('Körperregionen', 'Body regions')}>
              <header><span>{copy('KÖRPERREGIONEN', 'BODY REGIONS')}</span><small>{modelLabel}</small></header>
              {BODY_REGION_GROUPS.map(region => {
                const average = zoneAverage(region.muscles);
                const primary = [...region.muscles].sort((a, b) => loads[b] - loads[a])[0];
                return <button key={region.id} type="button" onClick={() => setSelected(primary)}>
                  <span><small>{lang === 'de' ? region.de : region.en}</small><strong>{average}%</strong></span>
                  <i><em style={{ width: `${average}%`, background: muscleLoadColor(average) }} /></i>
                </button>;
              })}
              <p><SystemIcon name="target" />{copy('Muskel direkt antippen', 'Tap a muscle directly')}</p>
            </aside>

            <div className="anatomy-figures">
              {(['front', 'back'] as const).map(side => <figure className="anatomy-model" key={side}>
                <div className={`anatomy-figure${profile?.gender === 'x' ? ' neutral' : ''}${flashing.map(id => ` flash-${id}`).join('')}`}>
                  <Body
                    data={bodyData}
                    side={side}
                    gender={modelGender}
                    scale={1}
                    border="#68726f"
                    defaultFill="#17201e"
                    defaultStroke="#35403d"
                    defaultStrokeWidth={1.4}
                    onBodyPartPress={handleBodyPart}
                  />
                  {Object.entries(FIGURE_PINS[side]).map(([id, position]) => {
                    const muscleId = id as MuscleId;
                    if (!position || (loads[muscleId] <= 0 && selected !== muscleId)) return null;
                    return <button
                      className={`anatomy-load-pin${selected === muscleId ? ' selected' : ''}`}
                      key={muscleId}
                      type="button"
                      style={{ left: `${position[0]}%`, top: `${position[1]}%`, color: muscleLoadColor(loads[muscleId]) }}
                      onClick={() => setSelected(muscleId)}
                      aria-label={`${zoneLabel(MUSCLE_ZONES.find(zone => zone.id === muscleId)!)} ${loads[muscleId]}%`}
                    >{loads[muscleId]}%</button>;
                  })}
                </div>
                <figcaption>{side === 'front' ? copy('VORNE', 'FRONT') : copy('HINTEN', 'BACK')}</figcaption>
              </figure>)}
            </div>
          </div>

          <div className="anatomy-stat-ribbon" aria-label={copy('Muskelwerte', 'Muscle stats')}>
            {MUSCLE_ZONES.map(zone => <button key={zone.id} type="button" className={selected === zone.id ? 'selected' : ''} onClick={() => setSelected(zone.id)}>
              <span>{zoneLabel(zone)}</span><strong style={{ color: muscleLoadColor(loads[zone.id]) }}>{loads[zone.id]}%</strong>
            </button>)}
          </div>

          {selectedZone && (
            <form
              className="muscle-system-overlay"
              style={{ left: `${selectedZone.overlay[0]}%`, top: `${selectedZone.overlay[1]}%` }}
              onSubmit={logRemaining}
              aria-label={`${zoneLabel(selectedZone)} ${copy('Belastung erfassen', 'load entry')}`}
            >
              <div className="muscle-overlay-head">
                <span>
                  <small>{copy('Werte zuweisen', 'Allocate stats')}</small>
                  <strong>{zoneLabel(selectedZone)}</strong>
                </span>
                <span className="muscle-overlay-load" style={{ color: muscleLoadColor(selectedLoad) }}>{selectedLoad}%</span>
                <button type="button" onClick={() => setSelected(null)} aria-label={copy('Eingabe schließen', 'Close entry')}><SystemIcon name="close" /></button>
              </div>

              <div className="muscle-overlay-fields">
                <label>
                  <span>{copy('Sätze', 'Sets')}</span>
                  <input ref={firstInputRef} type="number" inputMode="numeric" min="1" max="12" value={draft.sets} onChange={event => updateDraft(selectedZone.id, { sets: Number(event.target.value) })} />
                </label>
                <label>
                  <span>{copy('Wdh.', 'Reps')}</span>
                  <input type="number" inputMode="numeric" min="0" max="200" value={draft.reps} onChange={event => updateDraft(selectedZone.id, { reps: Number(event.target.value) })} />
                </label>
                <label>
                  <span>{copy('Zeit', 'Time')}</span>
                  <span className="muscle-time-input"><input type="number" inputMode="numeric" min="0" max="360" value={draft.durationMinutes} onChange={event => updateDraft(selectedZone.id, { durationMinutes: Number(event.target.value) })} /><small>MIN</small></span>
                </label>
              </div>

              <div className="muscle-set-progress">
                <span>{copy('Satzfortschritt', 'Set progress')}</span>
                <strong>{draft.completedSets} / {draft.sets}</strong>
                <div aria-hidden="true">
                  {Array.from({ length: draft.sets }, (_, index) => <i key={index} className={index < draft.completedSets ? 'done' : ''} />)}
                </div>
              </div>

              {remainingSets > 0 ? (
                <div className="muscle-overlay-actions">
                  <button className="muscle-complete-set" type="button" onClick={completeSet}><SystemIcon name="check" />{copy('Satz fertig', 'Complete set')}</button>
                  <button className="muscle-save-load" type="submit">{copy(`${remainingSets} Rest speichern`, `Save ${remainingSets} remaining`)}</button>
                </div>
              ) : (
                <button className="muscle-new-allocation" type="button" onClick={() => updateDraft(selectedZone.id, { completedSets: 0 })}><SystemIcon name="plus" />{copy('Neue Eingabe', 'New allocation')}</button>
              )}
            </form>
          )}
        </div>

        <aside className="muscle-readout" aria-live="polite">
          {lastWorkoutEvent?.exerciseName && <section className="muscle-live-transfer">
            <small>{copy('LIVE AUS CHARAKTER-WORKOUT', 'LIVE FROM CHARACTER WORKOUT')}</small>
            <strong>{lastWorkoutEvent.exerciseName}</strong>
            <div>{lastWorkoutEvent.targets?.map(targetItem => <button key={targetItem.muscleId} type="button" onClick={() => setSelected(targetItem.muscleId)}>
              <span><small>{targetItem.role === 'primary' ? copy('PRIMÄR', 'PRIMARY') : copy('SUPPORT', 'SUPPORT')} {Math.round(targetItem.share * 100)}%</small><strong>{zoneLabel(MUSCLE_ZONES.find(zone => zone.id === targetItem.muscleId)!)}</strong></span>
              <b style={{ color: muscleLoadColor(loads[targetItem.muscleId]) }}>{loads[targetItem.muscleId]}%</b>
            </button>)}</div>
          </section>}
          {selectedZone ? (
            <>
              <div className="muscle-readout-primary">
                <small>{copy('Ausgewählte Zone', 'Selected zone')}</small>
                <strong>{zoneLabel(selectedZone)}</strong>
                <span style={{ color: muscleLoadColor(selectedLoad) }}>{selectedLoad}%</span>
                <p>{bandLabel(selectedLoad)}</p>
              </div>
              <div className="muscle-recent">
                <div className="muscle-readout-title"><span>{copy('Letzte Eingaben', 'Recent entries')}</span>{selectedEntries.length > 0 && <button type="button" onClick={undoLast}>{copy('Letzte rückgängig', 'Undo last')}</button>}</div>
                {selectedEntries.length ? selectedEntries.map(entry => (
                  <div className="muscle-recent-row" key={entry.id}>
                    <span><strong>{entry.exerciseName || `${entry.sets} × ${entry.reps}`}</strong><small>{entry.role ? `${entry.role === 'primary' ? copy('Primär', 'Primary') : 'Support'} ${Math.round((entry.targetShare || 1) * 100)}% · ` : ''}{entry.reps > 0 ? `${entry.reps} ${copy('Wdh.', 'reps')}` : ''}{entry.weightKg ? ` · ${entry.weightKg} kg` : ''}{entry.durationMinutes > 0 ? ` · ${Math.round(entry.durationMinutes * 60)} sec` : ''}</small></span>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>{relativeTime(entry.createdAt, clock)}</time>
                  </div>
                )) : <p>{copy('Tippe Werte in das Feld direkt auf der Figur ein.', 'Enter values in the panel directly on the figure.')}</p>}
              </div>
            </>
          ) : (
            <div className="muscle-readout-empty">
              <SystemIcon name="target" />
              <strong>{copy('Muskel wählen', 'Select a muscle')}</strong>
              <p>{copy('Tippe eine Zone an. Das Eingabefeld öffnet sich direkt aus der Karte heraus.', 'Tap a zone. Its entry panel opens directly from the map.')}</p>
            </div>
          )}

          <div className="muscle-legend" aria-label={copy('Belastungslegende', 'Load legend')}>
            <span><i className="fresh" />{copy('Niedrig', 'Low')} <small>0–29</small></span>
            <span><i className="loaded" />{copy('Mittel', 'Moderate')} <small>30–64</small></span>
            <span><i className="strained" />{copy('Hoch', 'High')} <small>65–100</small></span>
          </div>
        </aside>
      </div>

      <p className="ledger-footnote muscle-monitor-note"><SystemIcon name="info" />{copy(
        'Die Farbe ist eine relative 48-Stunden-Anzeige aus deinen Sätzen, Wiederholungen und Minuten. Sie ist keine medizinische Erholungs- oder Verletzungsbewertung.',
        'Color is a relative 48-hour display based on your sets, reps, and minutes. It is not a medical recovery or injury assessment.',
      )}</p>
    </section>
  );
}

// ── Deload-Hinweis ───────────────────────────────────────────────────
const DELOAD_LEVEL_LABEL: Record<DeloadLevel, [string, string]> = {
  none: ['', ''],
  watch: ['Beobachten', 'Watch'],
  advised: ['Entlastung empfohlen', 'Deload advised'],
  urgent: ['Entlastung dringend', 'Deload urgent'],
};

const DELOAD_REASON_LABEL: Record<string, [string, string]> = {
  'persistent-strain': ['Mehrere Muskeln bleiben seit Tagen stark belastet',
                        'Several muscles have stayed heavily loaded for days'],
  'sustained-body-load': ['Die Ganzkörperlast ist seit mehreren Tagen erhöht',
                          'Whole-body load has been elevated for several days'],
  'volume-spike': ['Das Volumen liegt deutlich über der Vorwoche',
                   'Volume is far above last week'],
};

function DeloadNotice({ level, reasons, lighter, loads }: {
  level: DeloadLevel;
  reasons: string[];
  lighter: { muscleId: MuscleId; sets: number; reps: number }[];
  loads: Record<MuscleId, number>;
}) {
  return (
    <section className={`deload-notice ${level}`} role="status"
      aria-label={copy('Deload-Schutz', 'Deload protection')}>
      <header>
        <span><SystemIcon name="shield" />{copy('DELOAD-SCHUTZ', 'DELOAD PROTECTION')}</span>
        <strong>{copy(...DELOAD_LEVEL_LABEL[level])}</strong>
      </header>
      <ul className="deload-reasons">
        {reasons.map(reason => (
          <li key={reason}>{copy(...(DELOAD_REASON_LABEL[reason] || [reason, reason]))}</li>
        ))}
      </ul>
      {lighter.length > 0 && (
        <>
          <p className="deload-suggestion-title">
            {copy('Leichtere Variante — gleiche Bewegungen, weniger Sätze:',
                  'Lighter version — same movements, fewer sets:')}
          </p>
          <ul className="deload-suggestion">
            {lighter.map(item => (
              <li key={item.muscleId}>
                <span className="deload-dot" aria-hidden="true"
                  style={{ background: muscleLoadColor(loads[item.muscleId]) }} />
                <strong>{zoneLabel(MUSCLE_ZONES.find(zone => zone.id === item.muscleId)!)}</strong>
                <span>{item.sets} × {item.reps}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
