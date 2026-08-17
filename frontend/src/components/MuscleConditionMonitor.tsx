import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import {
  MUSCLE_IDS,
  calculateMuscleLoads,
  getMuscleLoadBand,
  muscleLoadColor,
  sanitizeMuscleLoadEntries,
  type MuscleId,
  type MuscleLoadEntry,
  type MuscleLoadSource,
} from '../lib/muscleLoad';
import { lang } from '../lib/i18n';
import { S } from '../lib/storage';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;
const LOAD_STORAGE_KEY = 'train_muscle_load_v1';
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
  anchor: [number, number];
  overlay: [number, number];
}

const MUSCLE_ZONES: MuscleZone[] = [
  { id: 'shoulders', de: 'Schultern', en: 'Shoulders', anchor: [120, 108], overlay: [66, 37] },
  { id: 'chest', de: 'Brust', en: 'Chest', anchor: [120, 144], overlay: [66, 39] },
  { id: 'biceps', de: 'Bizeps', en: 'Biceps', anchor: [73, 178], overlay: [66, 42] },
  { id: 'core', de: 'Rumpf', en: 'Core', anchor: [120, 214], overlay: [66, 48] },
  { id: 'quads', de: 'Quadrizeps', en: 'Quads', anchor: [105, 342], overlay: [66, 62] },
  { id: 'back', de: 'Rücken', en: 'Back', anchor: [300, 166], overlay: [34, 42] },
  { id: 'triceps', de: 'Trizeps', en: 'Triceps', anchor: [347, 183], overlay: [34, 43] },
  { id: 'glutes', de: 'Gesäß', en: 'Glutes', anchor: [300, 278], overlay: [34, 55] },
  { id: 'hamstrings', de: 'Beinbeuger', en: 'Hamstrings', anchor: [316, 352], overlay: [34, 65] },
  { id: 'calves', de: 'Waden', en: 'Calves', anchor: [316, 437], overlay: [34, 72] },
];

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
  const [entries, setEntries] = useState<MuscleLoadEntry[]>(() => sanitizeMuscleLoadEntries(S.get<unknown>(LOAD_STORAGE_KEY)));
  const [drafts, setDrafts] = useState<Partial<Record<MuscleId, MuscleInputDraft>>>(() => loadDrafts());
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const [flashing, setFlashing] = useState<MuscleId | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const firstInputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
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

  const flashZone = (id: MuscleId) => {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    setFlashing(null);
    window.requestAnimationFrame(() => setFlashing(id));
    flashTimerRef.current = window.setTimeout(() => setFlashing(null), 760);
  };

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
      S.set(LOAD_STORAGE_KEY, next);
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
    S.set(LOAD_STORAGE_KEY, next);
    updateDraft(selected, { completedSets: Math.max(0, draft.completedSets - removed.sets) });
    setClock(Date.now());
    flashZone(selected);
  };

  const selectZone = (id: MuscleId) => setSelected(current => current === id ? null : id);
  const activateZone = (event: KeyboardEvent<SVGGElement>, id: MuscleId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectZone(id);
  };

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

      <div className="muscle-monitor-layout">
        <div className="muscle-map-stage">
          <svg className="muscle-map" viewBox="0 0 420 520" role="group" aria-label={copy('Interaktive Muskelkarte, Vorder- und Rückseite', 'Interactive front and back muscle map')}>
            <g className="anatomy-base anatomy-front" aria-hidden="true">
              <circle cx="120" cy="49" r="25" />
              <path d="M107 74h26l5 18c15 4 28 13 34 28l20 74c3 12-13 17-18 6l-22-58-4 104-17 41 10 190c1 17-20 19-24 3l-17-144-17 144c-4 16-25 14-24-3l10-190-17-41-4-104-22 58c-5 11-21 6-18-6l20-74c6-15 19-24 34-28z" />
            </g>
            <g className="anatomy-base anatomy-back" aria-hidden="true">
              <circle cx="300" cy="49" r="25" />
              <path d="M287 74h26l5 18c15 4 28 13 34 28l20 74c3 12-13 17-18 6l-22-58-4 104-17 41 10 190c1 17-20 19-24 3l-17-144-17 144c-4 16-25 14-24-3l10-190-17-41-4-104-22 58c-5 11-21 6-18-6l20-74c6-15 19-24 34-28z" />
              <path className="anatomy-seam" d="M300 94v151M285 286l15 17 15-17" />
            </g>

            {MUSCLE_ZONES.map(zone => {
              const load = loads[zone.id];
              const isSelected = selected === zone.id;
              const style = { '--muscle-color': muscleLoadColor(load) } as CSSProperties;
              return (
                <g
                  key={zone.id}
                  className={`muscle-zone zone-${zone.id}${isSelected ? ' is-selected' : ''}${flashing === zone.id ? ' is-flashing' : ''}`}
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${zoneLabel(zone)}: ${load}% ${bandLabel(load)}`}
                  onClick={() => selectZone(zone.id)}
                  onKeyDown={event => activateZone(event, zone.id)}
                >
                  <title>{zoneLabel(zone)} · {load}%</title>
                  <MuscleShapes id={zone.id} />
                  {(load > 0 || isSelected) && (
                    <g className="muscle-zone-badge" transform={`translate(${zone.anchor[0]} ${zone.anchor[1]})`} aria-hidden="true">
                      <rect x="-20" y="-11" width="40" height="21" />
                      <text y="4">{load}%</text>
                    </g>
                  )}
                </g>
              );
            })}

            <text className="anatomy-view-label" x="120" y="510" textAnchor="middle">{copy('VORNE', 'FRONT')}</text>
            <text className="anatomy-view-label" x="300" y="510" textAnchor="middle">{copy('HINTEN', 'BACK')}</text>
          </svg>

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
                    <span><strong>{entry.sets} × {entry.reps}</strong><small>{Math.round(entry.durationMinutes)} min</small></span>
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

function MuscleShapes({ id }: { id: MuscleId }) {
  switch (id) {
    case 'shoulders':
      return <>
        <path className="muscle-zone-shape" d="M91 101q13-14 27-9l-8 38q-18-1-27-13zM149 101q-13-14-27-9l8 38q18-1 27-13z" />
        <path className="muscle-zone-shape" d="M271 101q13-14 27-9l-8 38q-18-1-27-13zM329 101q-13-14-27-9l8 38q18-1 27-13z" />
      </>;
    case 'chest':
      return <path className="muscle-zone-shape" d="M94 126q12-7 25-1v36q-15 8-29-3zM146 126q-12-7-25-1v36q15 8 29-3z" />;
    case 'biceps':
      return <>
        <ellipse className="muscle-zone-shape" cx="75" cy="178" rx="12" ry="30" transform="rotate(11 75 178)" />
        <ellipse className="muscle-zone-shape" cx="165" cy="178" rx="12" ry="30" transform="rotate(-11 165 178)" />
      </>;
    case 'core':
      return <path className="muscle-zone-shape" d="M103 166q17 8 34 0l6 74q-23 18-46 0zM120 170v72M103 194h34M100 219h40" />;
    case 'quads':
      return <path className="muscle-zone-shape" d="M93 285q14-8 25 2l-5 103q-13 14-25-2zM147 285q-14-8-25 2l5 103q13 14 25-2z" />;
    case 'back':
      return <path className="muscle-zone-shape" d="M276 120q24-16 48 0l8 91q-11 32-32 36-21-4-32-36zM300 119v122M276 151q24 15 48 0M272 193q28 18 56 0" />;
    case 'triceps':
      return <>
        <ellipse className="muscle-zone-shape" cx="255" cy="181" rx="11" ry="31" transform="rotate(11 255 181)" />
        <ellipse className="muscle-zone-shape" cx="345" cy="181" rx="11" ry="31" transform="rotate(-11 345 181)" />
      </>;
    case 'glutes':
      return <path className="muscle-zone-shape" d="M275 252q25-9 25 22 0 31-27 30l-5-34q0-13 7-18zM325 252q-25-9-25 22 0 31 27 30l5-34q0-13-7-18z" />;
    case 'hamstrings':
      return <path className="muscle-zone-shape" d="M275 304q18-5 25 8l-8 83q-13 12-25-2zM325 304q-18-5-25 8l8 83q13 12 25-2z" />;
    case 'calves':
      return <path className="muscle-zone-shape" d="M269 399q14-12 24 2l-4 78q-12 13-22-2zM331 399q-14-12-24 2l4 78q12 13 22-2z" />;
  }
}
