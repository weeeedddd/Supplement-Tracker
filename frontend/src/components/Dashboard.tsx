import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import {
  asArray,
  calcConsumed,
  checkAchievements,
  completedToday,
  creditDailySupplementXP,
  finaliseStreak,
  gainXP,
  getFoodLog,
  getSafeProtocolDisplay,
  getStreak,
  normalizeFoodEntry,
  playSound,
  sanitizeFoodNumber,
  saveFoodLog,
  type FoodEntry,
  type Macros,
  type ProtocolItem,
} from '../lib/engine';
import { lang, t } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { assessFoodForGoal } from '../lib/nutritionScoring';
import { analyzeImageLocally, analyzeTextLocally, type ScanResult } from '../lib/scanner';
import { dateKey, S } from '../lib/storage';
import { refresh, useAppState } from '../lib/store';
import { PerformanceHero } from './PerformanceHero';
import { ProgressPhotoReminder } from './ProgressPhotoReminder';
import { SystemIcon } from './SystemIcon';
import { loadUserProfile } from '../lib/profile';

const copy = (de: string, en: string) => lang === 'de' ? de : en;
const MAX_FOOD_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_FOOD_PHOTO_EDGE = 1600;

async function prepareFoodPhoto(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, MAX_FOOD_PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getChecked(): string[] {
  return asArray<string>(S.get(`day_${dateKey()}`));
}

function progressStyle(value: number): CSSProperties {
  return { transform: `scaleX(${Math.max(0, Math.min(1, value))})` };
}

export function Dashboard({
  onComplete,
  onOpenProgressPhotos,
}: {
  onComplete: (streak: number) => void;
  onOpenProgressPhotos: () => void;
}) {
  useAppState();
  const currentDateKey = dateKey();
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  const checked = getChecked();
  const total = protocol.length;
  const done = checked.filter(id => protocol.some(item => item.id === id)).length;
  const consumed = calcConsumed();
  const goals = S.get<Macros>('macros');
  const streak = getStreak().count;
  const today = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());
  const photoEligible = (loadUserProfile()?.age ?? 0) >= 18;

  useEffect(() => {
    const checkDate = () => {
      if (dateKey() !== currentDateKey) refresh();
    };
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 50);
    const midnightTimer = window.setTimeout(checkDate, nextMidnight.getTime() - now.getTime());
    const onVisibility = () => { if (!document.hidden) checkDate(); };
    window.addEventListener('focus', checkDate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', checkDate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentDateKey]);

  const toggleSupplement = (id: string) => {
    const ids = protocol.map(item => item.id);
    if (!ids.includes(id)) return;

    const next = getChecked();
    const index = next.indexOf(id);
    const adding = index === -1;
    if (adding) next.push(id);
    else next.splice(index, 1);

    S.set(`day_${dateKey()}`, next);
    if (adding) creditDailySupplementXP(id);

    if (ids.length > 0 && ids.every(protocolId => next.includes(protocolId)) && !completedToday()) {
      gainXP(20);
      S.set('complete_days_count', (S.get<number>('complete_days_count') || 0) + 1);
      checkAchievements();
      const nextStreak = finaliseStreak();
      playSound();
      onComplete(nextStreak);
    }
    refresh();
  };

  return (
    <section className="screen active system-screen" id="screen-dashboard">
      <div className="system-page today-page">
        <PerformanceHero
          variant="today"
          icon="today"
          title={copy('Heute', 'Today')}
          description={`${today} · ${copy('Deine echten Einträge, ohne erfundene Bereitschafts- oder Rangwerte.', 'Your real entries, without invented readiness or rank scores.')}`}
          status={(
            <>
              <span><small>{copy('Routine', 'Routine')}</small><strong>{total ? `${done}/${total}` : '–'}</strong></span>
              <span><small>{copy('Serie', 'Streak')}</small><strong>{streak} {streak === 1 ? copy('Tag', 'day') : copy('Tage', 'days')}</strong></span>
              <span><small>{copy('Energie', 'Energy')}</small><strong>{Math.round(consumed.kcal)} kcal</strong></span>
            </>
          )}
        />

        <ProgressPhotoReminder
          onOpen={onOpenProgressPhotos}
          eligible={photoEligible}
          locale={lang === 'de' ? 'de' : 'en'}
        />

        <div className="today-command-grid">
          <RoutinePanel protocol={protocol} checked={checked} onToggle={toggleSupplement} />
          <MacroPanel consumed={consumed} goals={goals} />
          <HydrationPanel />
        </div>

        <div className="today-utility-grid">
          <NutritionEntryPanel />
          <DailyNotes key={currentDateKey} storageDateKey={currentDateKey} />
        </div>
      </div>
    </section>
  );
}

function PanelHeading({ id, icon, title, meta }: { id: string; icon: Parameters<typeof SystemIcon>[0]['name']; title: string; meta?: string }) {
  return (
    <header className="ledger-heading">
      <span aria-hidden="true"><SystemIcon name={icon} /></span>
      <h2 id={id}>{title}</h2>
      {meta && <small>{meta}</small>}
    </header>
  );
}

function RoutinePanel({
  protocol,
  checked,
  onToggle,
}: {
  protocol: ProtocolItem[];
  checked: string[];
  onToggle: (id: string) => void;
}) {
  const total = protocol.length;
  const done = checked.filter(id => protocol.some(item => item.id === id)).length;
  const periodLabels = {
    alpha: copy('Morgen', 'Morning'),
    beta: copy('Tagsüber', 'Daytime'),
    gamma: copy('Abends', 'Evening'),
  } as const;

  return (
    <section className="system-ledger routine-ledger" aria-labelledby="today-routine-title">
      <PanelHeading
        id="today-routine-title"
        icon="supplements"
        title={copy('Supplement-Routine', 'Supplement routine')}
        meta={total ? `${done} / ${total}` : undefined}
      />
      <div className="ledger-progress" role="progressbar" aria-label={copy('Fortschritt der Supplement-Routine', 'Supplement routine progress')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={progressStyle(total ? done / total : 0)} />
      </div>
      {!protocol.length ? (
        <div className="system-empty compact">
          <SystemIcon name="info" />
          <div>
            <strong>{copy('Noch keine Routine gewählt', 'No routine selected')}</strong>
            <p>{copy('Wähle unter „Supps“ nur Produkte aus, die du bereits nutzt oder fachlich geprüft hast.', 'Under “Supps”, select only products you already use or have reviewed with a qualified professional.')}</p>
          </div>
        </div>
      ) : (
        <div className="routine-periods">
          {(['alpha', 'beta', 'gamma'] as const).map(period => {
            const items = protocol.filter(item => item.phase === period);
            if (!items.length) return null;
            return (
              <section className="routine-period" key={period} aria-label={periodLabels[period]}>
                <h3>{periodLabels[period]}</h3>
                <div>
                  {items.map(item => {
                    const display = getSafeProtocolDisplay(item.id);
                    if (!display) return null;
                    const isDone = checked.includes(item.id);
                    return (
                      <button
                        type="button"
                        className={isDone ? 'routine-row done' : 'routine-row'}
                        key={item.id}
                        aria-pressed={isDone}
                        onClick={() => onToggle(item.id)}
                      >
                        <span className="routine-row-check" aria-hidden="true"><SystemIcon name={isDone ? 'check' : 'plus'} /></span>
                        <span>{t(display.nameKey)}</span>
                        <small>{isDone ? copy('Erledigt', 'Done') : copy('Offen', 'Open')}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="ledger-footnote">{copy(
        'Nur dokumentieren – Etikett und qualifizierte Beratung bleiben maßgeblich.',
        'Track only — the product label and qualified advice remain decisive.',
      )}</p>
    </section>
  );
}

function MacroPanel({ consumed, goals }: { consumed: Macros; goals: Macros | null }) {
  const rows: { key: keyof Macros; label: string; unit: string }[] = [
    { key: 'kcal', label: copy('Kalorien', 'Calories'), unit: 'kcal' },
    { key: 'prot', label: copy('Protein', 'Protein'), unit: 'g' },
    { key: 'carb', label: copy('Kohlenhydrate', 'Carbohydrates'), unit: 'g' },
    { key: 'fat', label: copy('Fett', 'Fat'), unit: 'g' },
    { key: 'sug', label: copy('Zucker', 'Sugar'), unit: 'g' },
  ];

  return (
    <section className="system-ledger macro-ledger" aria-labelledby="today-macros-title">
      <PanelHeading id="today-macros-title" icon="food" title={copy('Kalorien & Makros', 'Calories & macros')} />
      <div className="macro-ledger-rows">
        {rows.map(row => {
          const target = goals?.[row.key] || 0;
          const value = consumed[row.key];
          const progress = target > 0 ? Math.min(1, value / target) : 0;
          return (
            <div className="macro-ledger-row" key={row.key}>
              <div><span>{row.label}</span><strong>{Math.round(value)} <small>{row.unit}</small></strong></div>
              <div className="ledger-progress" role="progressbar" aria-label={row.label} aria-valuemin={0} aria-valuemax={target || undefined} aria-valuenow={Math.round(value)}>
                <span style={progressStyle(progress)} />
              </div>
              <small>{target ? `${Math.round(value)} / ${Math.round(target)} ${row.unit}` : copy('Kein Ziel', 'No target')}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HydrationPanel() {
  useAppState();
  const count = S.get<number>(`mana_${dateKey()}`) || 0;

  const setCount = (index: number) => {
    const next = index + 1 <= count ? index : index + 1;
    S.set(`mana_${dateKey()}`, next);
    refresh();
  };

  return (
    <section className="system-ledger hydration-ledger" aria-labelledby="today-hydration-title">
      <PanelHeading id="today-hydration-title" icon="water" title={copy('Trinken', 'Hydration')} meta={`${count} / 8`} />
      <p>{copy('Markiere Gläser als einfache Gedächtnisstütze – kein medizinisches Trinkziel.', 'Mark glasses as a simple memory aid — not a medical hydration target.')}</p>
      <div className="hydration-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <button
            type="button"
            key={index}
            className={index < count ? 'hydration-cell filled' : 'hydration-cell'}
            aria-label={`${copy('Trinken auf', 'Set hydration to')} ${index + 1} ${copy('von 8 Gläsern setzen', 'of 8 glasses')}`}
            aria-pressed={index < count}
            onClick={() => setCount(index)}
          >
            <SystemIcon name="water" />
          </button>
        ))}
      </div>
    </section>
  );
}

function NutritionEntryPanel() {
  const [text, setText] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const log = getFoodLog();

  useModalIsolation(Boolean(editing), {
    backgroundSelectors: ['.today-page', '.system-topbar', '.system-bottom-nav'],
    onEscape: () => setEditing(null),
  });

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!file.type.startsWith('image/') || file.size > MAX_FOOD_PHOTO_BYTES) {
      setError(copy('Wähle ein Bild mit höchstens 8 MB.', 'Choose an image up to 8 MB.'));
      return;
    }
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setImageData(await prepareFoodPhoto(file));
    } catch {
      setError(copy('Das Foto konnte nicht verarbeitet werden.', 'The photo could not be processed.'));
    } finally {
      setBusy(false);
    }
  };

  const clearImage = () => {
    setImageData(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const resetScan = () => {
    setPreview(null);
    setText('');
    clearImage();
  };

  const submit = async () => {
    const query = text.trim();
    if ((!query && !imageData) || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = imageData
        ? await analyzeImageLocally(imageData, query)
        : await analyzeTextLocally(query);

      if (!result) {
        setError(copy('Nichts zuverlässig erkannt. Beschreibe Lebensmittel und Menge genauer oder trage die Werte unter „Essen“ manuell ein.', 'Nothing reliable was detected. Describe the food and amount more precisely or enter the values manually under “Food”.'));
        return;
      }

      setPreview(result);
    } finally {
      setBusy(false);
    }
  };

  const confirmPreview = () => {
    if (!preview) return;
    const entry = normalizeFoodEntry({
      id: Date.now(),
      name: preview.name,
      ...preview.macros,
      ts: Date.now(),
    });
    if (!entry) {
      setError(copy('Der Eintrag war unvollständig und wurde nicht gespeichert.', 'The entry was incomplete and was not saved.'));
      return;
    }
    saveFoodLog([...getFoodLog(), entry]);
    resetScan();
    gainXP(3);
    checkAchievements();
    refresh();
  };

  const deleteEntry = (id: number) => {
    saveFoodLog(getFoodLog().filter(entry => entry.id !== id));
    refresh();
  };

  const saveEntry = (entry: FoodEntry) => {
    saveFoodLog(getFoodLog().map(current => current.id === entry.id ? entry : current));
    setEditing(null);
    refresh();
  };

  return (
    <section className="system-ledger nutrition-entry-ledger" aria-labelledby="today-food-entry-title">
      <PanelHeading id="today-food-entry-title" icon="food" title={copy('Essen protokollieren', 'Log food')} meta={`${log.length} ${copy('Einträge', 'entries')}`} />
      <div className="nutrition-entry-controls">
        <label className="system-field wide">
          <span>{copy('Lebensmittel und Menge', 'Food and amount')}</span>
          <input
            type="text"
            value={text}
            placeholder={copy('z. B. 250 g Skyr mit Beeren', 'e.g. 250 g skyr with berries')}
            onChange={event => { setText(event.target.value); setPreview(null); }}
            onKeyDown={event => { if (event.key === 'Enter') void submit(); }}
          />
        </label>
        <div className="nutrition-entry-actions">
          <label className="system-button quiet file-action" htmlFor="today-food-photo">
            <SystemIcon name="camera" />
            <span>{copy('Foto wählen', 'Choose photo')}</span>
            <input ref={fileRef} id="today-food-photo" type="file" accept="image/*" capture="environment" onChange={onFile} />
          </label>
          <button className="system-button" type="button" disabled={busy || (!text.trim() && !imageData)} onClick={() => void submit()}>
            <SystemIcon name="search" />
            {busy ? copy('Lokal prüfen…', 'Checking locally…') : copy('Eintrag prüfen', 'Check entry')}
          </button>
        </div>
      </div>

      {imageData && (
        <div className="nutrition-photo-preview">
          <img src={imageData} alt={copy('Ausgewähltes Essensfoto', 'Selected food photo')} />
           <span>{busy ? copy('Lokale Barcode-Prüfung läuft', 'Local barcode check in progress') : copy('Foto bleibt lokal; nur ein erkannter Barcode wird nachgeschlagen.', 'Photo stays local; only a detected barcode is looked up.')}</span>
          <button type="button" className="system-icon-button" onClick={clearImage} aria-label={copy('Foto entfernen', 'Remove photo')}><SystemIcon name="close" /></button>
        </div>
      )}
      {error && <p className="system-inline-error" role="alert">{error}</p>}
      {preview && (
        <FoodScanPreview
          result={preview}
          targets={S.get<Macros>('macros')}
          consumed={calcConsumed()}
          goal={loadUserProfile()?.goal ?? 'general_fitness'}
          onConfirm={confirmPreview}
          onDiscard={resetScan}
        />
      )}

      <div className="food-entry-list">
        {!log.length && (
          <div className="system-empty compact">
            <SystemIcon name="food" />
            <div><strong>{copy('Heute noch nichts erfasst', 'Nothing logged today')}</strong><p>{copy('Erkannte Produkte und lokale Schätzungen erscheinen hier und bleiben bearbeitbar.', 'Recognized products and local estimates appear here and remain editable.')}</p></div>
          </div>
        )}
        {log.map(entry => (
          <article className="food-entry-row" key={entry.id}>
            <div>
              <strong>{entry.name}</strong>
              <span>{Math.round(entry.kcal)} kcal · {Math.round(entry.prot)} g P · {Math.round(entry.carb)} g C · {Math.round(entry.fat)} g F</span>
            </div>
            <button type="button" className="system-icon-button" onClick={() => setEditing(entry)} aria-label={`${entry.name}: ${copy('bearbeiten', 'edit')}`}><SystemIcon name="edit" /></button>
            <button type="button" className="system-icon-button danger" onClick={() => deleteEntry(entry.id)} aria-label={`${entry.name}: ${copy('löschen', 'delete')}`}><SystemIcon name="delete" /></button>
          </article>
        ))}
      </div>
      {editing && <EditFoodDialog entry={editing} onSave={saveEntry} onClose={() => setEditing(null)} />}
    </section>
  );
}

function FoodScanPreview({
  result,
  targets,
  consumed,
  goal,
  onConfirm,
  onDiscard,
}: {
  result: ScanResult;
  targets: Macros | null;
  consumed: Macros;
  goal: NonNullable<ReturnType<typeof loadUserProfile>>['goal'];
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const assessment = assessFoodForGoal(result, targets, consumed, goal, lang === 'de' ? 'de' : 'en');
  const source = result.details?.confidence === 'database'
    ? copy('Barcode-Datenbank', 'Barcode database')
    : copy('Lokale Referenzschätzung', 'Local reference estimate');
  const gaugeStyle = { '--scan-score': `${assessment.score * 3.6}deg` } as CSSProperties;
  return (
    <article className={`food-scan-result rating-${assessment.rating}`} aria-labelledby="scan-result-title">
      <header className="food-scan-result-header">
        <span><SystemIcon name="target" />{copy('SYSTEM-ANALYSE', 'SYSTEM ANALYSIS')}</span>
        <small>{source}</small>
      </header>
      <div className="food-scan-result-main">
        <div className="food-rating-meter" role="meter" aria-label={copy('Ziel-Fit Bewertung', 'Goal-fit rating')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={assessment.score} style={gaugeStyle}>
          <div><strong>{assessment.score}</strong><span>/ 100</span></div>
          <small>{assessment.label}</small>
        </div>
        <div className="food-scan-verdict">
          <small>{copy('FIT FÜR', 'FIT FOR')} {assessment.goalLabel}</small>
          <h3 id="scan-result-title">{result.name}</h3>
          <p>{assessment.verdict}</p>
        </div>
      </div>
      <div className="food-scan-macros" aria-label={copy('Erkannte Nährwerte', 'Detected nutrition')}>
        {([
          ['kcal', Math.round(result.macros.kcal), 'kcal'],
          ['P', Math.round(result.macros.prot * 10) / 10, 'g'],
          ['C', Math.round(result.macros.carb * 10) / 10, 'g'],
          ['F', Math.round(result.macros.fat * 10) / 10, 'g'],
          [copy('Zucker', 'Sugar'), Math.round(result.macros.sug * 10) / 10, 'g'],
        ] as Array<[string, number, string]>).map(([label, value, unit]) => (
          <span key={label}><small>{label}</small><strong>{value}<em>{unit}</em></strong></span>
        ))}
      </div>
      <ul className="food-scan-facts">
        {assessment.facts.map(fact => <li key={fact}><SystemIcon name="check" /><span>{fact}</span></li>)}
      </ul>
      <p className="food-scan-caveat"><SystemIcon name="info" />{result.details?.confidence === 'database'
        ? copy('Datenbankwerte können vom Etikett abweichen. Prüfe Portion und Herstellerangaben.', 'Database values can differ from the label. Verify the serving and manufacturer values.')
        : copy('Referenzschätzung für unverarbeitete Standardlebensmittel. Mengen prüfen und bei Bedarf nach dem Speichern bearbeiten.', 'Reference estimate for standard unprocessed foods. Verify amounts and edit after saving if needed.')}</p>
      <footer>
        <button className="system-button quiet" type="button" onClick={onDiscard}>{copy('Verwerfen', 'Discard')}</button>
        <button className="system-button" type="button" onClick={onConfirm}><SystemIcon name="plus" />{copy('Für heute eintragen', 'Add to today')}</button>
      </footer>
    </article>
  );
}

function EditFoodDialog({ entry, onSave, onClose }: { entry: FoodEntry; onSave: (entry: FoodEntry) => void; onClose: () => void }) {
  const [draft, setDraft] = useState({ ...entry });
  const [error, setError] = useState('');

  const updateNumber = (key: keyof Macros, value: string) => {
    setDraft(current => ({ ...current, [key]: sanitizeFoodNumber(value, key) }));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeFoodEntry(draft);
    if (!normalized || !normalized.name.trim() || normalized.kcal <= 0 || normalized.sug > normalized.carb) {
      setError(copy('Prüfe Name, Kalorien und dass Zucker nicht über den Kohlenhydraten liegt.', 'Check the name, calories, and ensure sugar does not exceed carbohydrates.'));
      return;
    }
    onSave({ ...normalized, name: normalized.name.trim() });
  };

  const fields: { key: keyof Macros; label: string; max: number }[] = [
    { key: 'kcal', label: copy('Kalorien', 'Calories'), max: 10000 },
    { key: 'prot', label: copy('Protein (g)', 'Protein (g)'), max: 1000 },
    { key: 'carb', label: copy('Kohlenhydrate (g)', 'Carbohydrates (g)'), max: 1500 },
    { key: 'fat', label: copy('Fett (g)', 'Fat (g)'), max: 1000 },
    { key: 'sug', label: copy('Zucker (g)', 'Sugar (g)'), max: 1500 },
  ];

  return createPortal(
    <div className="system-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="system-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-food-title" onSubmit={save}>
        <header>
          <h2 id="edit-food-title">{copy('Eintrag bearbeiten', 'Edit entry')}</h2>
          <button className="system-icon-button" type="button" onClick={onClose} aria-label={copy('Dialog schließen', 'Close dialog')}><SystemIcon name="close" /></button>
        </header>
        <label className="system-field wide">
          <span>{copy('Name', 'Name')}</span>
          <input required maxLength={100} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
        </label>
        <div className="edit-nutrition-grid">
          {fields.map(field => (
            <label className="system-field" key={field.key}>
              <span>{field.label}</span>
              <input type="number" min={0} max={field.max} step="0.1" value={draft[field.key]} onChange={event => updateNumber(field.key, event.target.value)} />
            </label>
          ))}
        </div>
        {error && <p className="system-inline-error" role="alert">{error}</p>}
        <footer>
          <button className="system-button quiet" type="button" onClick={onClose}>{copy('Abbrechen', 'Cancel')}</button>
          <button className="system-button" type="submit">{copy('Änderungen speichern', 'Save changes')}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function DailyNotes({ storageDateKey }: { storageDateKey: string }) {
  const [note, setNote] = useState(() => S.get<string>(`note_${storageDateKey}`) || '');

  return (
    <section className="system-ledger daily-notes-ledger" aria-labelledby="today-notes-title">
      <PanelHeading id="today-notes-title" icon="edit" title={copy('Tagesnotiz', 'Daily note')} />
      <label className="system-field wide">
        <span>{copy('Was heute relevant ist', 'What matters today')}</span>
        <textarea
          rows={8}
          maxLength={1200}
          value={note}
          placeholder={copy('Training, Erholung, Appetit oder eine Beobachtung…', 'Training, recovery, appetite, or an observation…')}
          onChange={event => {
            setNote(event.target.value);
            S.set(`note_${storageDateKey}`, event.target.value);
          }}
        />
      </label>
      <span className="field-counter">{note.length} / 1200</span>
    </section>
  );
}
