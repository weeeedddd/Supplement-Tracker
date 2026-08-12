import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { lang } from '../lib/i18n';
import {
  deleteProgressPhotoSet,
  listProgressPhotoSets,
  loadProgressPhotoObjectUrl,
  saveProgressPhotoCheckIn,
  type ProgressPhotoObjectUrl,
  type ProgressPhotoReminderWeeks,
  type ProgressPhotoSetMetadata,
  type ProgressPhotoSlot,
} from '../lib/progressPhotos';
import {
  getProgressPhotoPreferences,
  notifyProgressPhotoChange,
  setProgressPhotoCadence,
  setProgressPhotoReminderEnabled,
} from '../lib/progressPhotoPreferences';
import { useModalIsolation } from '../lib/modal';
import { ProgressPhotoCapture, type ProgressPhotoDraft } from './ProgressPhotoCapture';
import { SystemIcon } from './SystemIcon';

import '../progress-photos.css';

export interface ProgressPhotoPanelProps {
  age: number | null | undefined;
  locale?: 'de' | 'en';
  className?: string;
}

interface LoadedPhoto extends ProgressPhotoObjectUrl {
  setId: string;
  slot: ProgressPhotoSlot;
}

const SLOT_LABELS: Record<ProgressPhotoSlot, { de: string; en: string }> = {
  head: { de: 'Kopf', en: 'Head' },
  torso: { de: 'Körpermitte', en: 'Torso' },
  legs: { de: 'Beine', en: 'Legs' },
  'full-body': { de: 'Ganzkörper', en: 'Full body' },
};

const c = (locale: 'de' | 'en', de: string, en: string) => locale === 'de' ? de : en;

function formatDate(value: string, locale: 'de' | 'en') {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value));
}

export function ProgressPhotoPanel({
  age,
  locale = lang === 'en' ? 'en' : 'de',
  className = '',
}: ProgressPhotoPanelProps) {
  const [sets, setSets] = useState<ProgressPhotoSetMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [loadedPhotos, setLoadedPhotos] = useState<LoadedPhoto[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [draft, setDraft] = useState<ProgressPhotoDraft>({});
  const [cadence, setCadence] = useState<ProgressPhotoReminderWeeks>(
    () => getProgressPhotoPreferences().cadenceWeeks,
  );
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(
    () => getProgressPhotoPreferences().reminderEnabled,
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const canCapture = typeof age === 'number' && age >= 18;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSets(await listProgressPhotoSets());
    } catch {
      setError(c(locale,
        'Der private Fotospeicher ist in diesem Browser nicht verfügbar.',
        'Private photo storage is unavailable in this browser.'));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void reload(); }, [reload]);

  const comparisonSets = useMemo(() => {
    if (!sets.length) return [];
    const newest = sets[0];
    const oldest = sets[sets.length - 1];
    return oldest.id === newest.id ? [oldest] : [oldest, newest];
  }, [sets]);

  useEffect(() => {
    let cancelled = false;
    const created: LoadedPhoto[] = [];
    setLoadedPhotos([]);
    if (!revealed) return () => undefined;

    void (async () => {
      try {
        for (const set of comparisonSets) {
          for (const slot of set.slots) {
            const result = await loadProgressPhotoObjectUrl(set.id, slot);
            if (result) created.push({ ...result, setId: set.id, slot });
          }
        }
        if (cancelled) created.forEach((photo) => photo.revoke());
        else setLoadedPhotos(created);
      } catch {
        created.forEach((photo) => photo.revoke());
        if (!cancelled) {
          setError(c(locale, 'Die Fotos konnten nicht angezeigt werden.', 'The photos could not be displayed.'));
          setRevealed(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((photo) => photo.revoke());
    };
  }, [comparisonSets, locale, revealed]);

  const closeCapture = () => {
    if (saving || processing) return;
    setCaptureOpen(false);
    setDraft({});
    setError('');
  };

  useModalIsolation(captureOpen, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: closeCapture,
  });

  useEffect(() => {
    if (!captureOpen) return;
    window.setTimeout(() => closeRef.current?.focus(), 0);
  }, [captureOpen]);

  useEffect(() => {
    if (confirmDelete) deleteConfirmRef.current?.focus();
  }, [confirmDelete]);

  const openCapture = () => {
    setDraft({});
    setCadence(getProgressPhotoPreferences().cadenceWeeks);
    setError('');
    setCaptureOpen(true);
  };

  const saveCapture = async () => {
    if (!Object.keys(draft).length) {
      setError(c(locale, 'Wähle mindestens ein Foto oder schließe den Dialog.', 'Select at least one photo or close the dialog.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveProgressPhotoCheckIn({ photos: draft });
      setProgressPhotoCadence(cadence);
      notifyProgressPhotoChange();
      setCaptureOpen(false);
      setDraft({});
      setRevealed(false);
      await reload();
    } catch {
      setError(c(locale, 'Der Check-in konnte nicht lokal gespeichert werden.', 'The check-in could not be saved locally.'));
    } finally {
      setSaving(false);
    }
  };

  const removeSet = async (setId: string) => {
    setError('');
    try {
      await deleteProgressPhotoSet(setId);
      notifyProgressPhotoChange();
      setConfirmDelete(null);
      setRevealed(false);
      await reload();
    } catch {
      setError(c(locale, 'Der Eintrag konnte nicht gelöscht werden.', 'The entry could not be deleted.'));
    }
  };

  return (
    <section className={`progress-photo-panel ${className}`.trim()} aria-labelledby="progress-photo-panel-title">
      <header className="progress-photo-panel__header">
        <span className="progress-photo-kicker"><SystemIcon name="history" /> {c(locale, 'Visuelle Chronik', 'Visual timeline')}</span>
        <h2 id="progress-photo-panel-title">{c(locale, 'Fortschrittsfotos', 'Progress photos')}</h2>
        <p>{c(locale,
          'Private, freiwillige Momentaufnahmen für deinen eigenen Vergleich – ohne Upload, KI-Auswertung oder Körperversprechen.',
          'Private, optional snapshots for your own comparison — without uploads, AI analysis, or body promises.')}</p>
      </header>

      <div className="progress-photo-privacy-note">
        <SystemIcon name="shield" />
        <p><strong>{c(locale, 'Nur dieses Browserprofil', 'This browser profile only')}</strong><br />
          {c(locale,
            'Kein CORELINE-Cloud-Upload und nicht im JSON-Backup enthalten. Wer Zugriff auf dein entsperrtes Gerät und Browserprofil hat, kann lokale Daten möglicherweise einsehen; das Löschen von Website-Daten kann Fotos entfernen.',
            'No CORELINE cloud upload and excluded from the JSON backup. Someone with access to your unlocked device and browser profile may be able to view local data; clearing site data can remove photos.')}</p>
      </div>

      <label className="progress-photo-reminder-toggle">
        <input
          type="checkbox"
          checked={reminderEnabled}
          onChange={(event) => {
            setReminderEnabled(event.target.checked);
            setProgressPhotoReminderEnabled(event.target.checked);
          }}
        />
        <span>{c(locale, 'Fällige In-App-Erinnerung anzeigen', 'Show due reminder in the app')}</span>
        <small>{c(locale, 'Nur beim Öffnen der App; keine Systembenachrichtigung.', 'Only when you open the app; no system notification.')}</small>
      </label>

      <div className="progress-photo-panel__actions">
        <button type="button" className="progress-photo-primary" onClick={openCapture} disabled={!canCapture || loading}>
          <SystemIcon name="camera" /> {c(locale, 'Neuer Check-in', 'New check-in')}
        </button>
        {sets.length > 0 && (
          <button type="button" className="progress-photo-secondary" onClick={() => setRevealed((value) => !value)}>
            <SystemIcon name={revealed ? 'close' : 'profile'} />
            {revealed ? c(locale, 'Fotos verbergen', 'Hide photos') : c(locale, 'Vergleich anzeigen', 'Reveal comparison')}
          </button>
        )}
      </div>

      {!canCapture && (
        <p className="progress-photo-age-note"><SystemIcon name="info" /> {c(locale,
          'Neue Fortschrittsfotos sind in dieser Version erst ab 18 verfügbar. Vorhandene Einträge kannst du weiterhin ansehen oder löschen.',
          'New progress photos are available from age 18 in this release. You can still view or delete existing entries.')}</p>
      )}
      {error && !captureOpen && <p className="progress-photo-error" role="alert"><SystemIcon name="warning" /> {error}</p>}
      {loading && <p className="progress-photo-loading" aria-live="polite">{c(locale, 'Chronik wird geladen…', 'Loading timeline…')}</p>}

      {!loading && sets.length === 0 && !error && (
        <div className="progress-photo-empty">
          <SystemIcon name="camera" />
          <strong>{c(locale, 'Noch keine Vergleichsbasis', 'No comparison baseline yet')}</strong>
          <p>{c(locale, 'Ein Foto reicht für den ersten freiwilligen Check-in.', 'One photo is enough for your first optional check-in.')}</p>
        </div>
      )}

      {revealed && comparisonSets.length > 0 && (
        <div className={`progress-photo-comparison${comparisonSets.length === 1 ? ' is-single' : ''}`} aria-busy={loadedPhotos.length === 0}>
          {comparisonSets.map((set, index) => (
            <article className="progress-photo-comparison__column" key={set.id}>
              <header><span>{index === 0 ? c(locale, 'Basis', 'Baseline') : c(locale, 'Aktuell', 'Latest')}</span><time>{formatDate(set.completedAt, locale)}</time></header>
              <div className="progress-photo-comparison__images">
                {(['head', 'torso', 'legs', 'full-body'] as const).map((slot) => {
                  const photo = loadedPhotos.find((item) => item.setId === set.id && item.slot === slot);
                  return photo ? (
                    <figure key={slot}>
                      <img src={photo.url} alt={`${locale === 'de' ? SLOT_LABELS[slot].de : SLOT_LABELS[slot].en}, ${formatDate(set.completedAt, locale)}`} />
                      <figcaption>{locale === 'de' ? SLOT_LABELS[slot].de : SLOT_LABELS[slot].en}</figcaption>
                    </figure>
                  ) : set.slots.includes(slot) ? (
                    <div className="progress-photo-image-skeleton" aria-hidden="true" key={slot} />
                  ) : (
                    <div className="progress-photo-image-missing" key={slot}>
                      <SystemIcon name="camera" aria-hidden="true" />
                      <span>{locale === 'de' ? SLOT_LABELS[slot].de : SLOT_LABELS[slot].en}</span>
                      <small>{c(locale, 'Nicht aufgenommen', 'Not captured')}</small>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      {sets.length > 0 && (
        <div className="progress-photo-records">
          <h3>{c(locale, 'Gespeicherte Check-ins', 'Saved check-ins')} <span>{sets.length}</span></h3>
          {sets.map((set) => (
            <div className="progress-photo-record" key={set.id}>
              <div><time>{formatDate(set.completedAt, locale)}</time><small>{set.photoCount} / 4 {c(locale, 'Perspektiven', 'angles')}</small></div>
              {confirmDelete === set.id ? (
                <div className="progress-photo-delete-confirm" role="group" aria-label={c(locale, 'Löschen bestätigen', 'Confirm deletion')}>
                  <button ref={deleteConfirmRef} type="button" onClick={() => void removeSet(set.id)}>{c(locale, 'Endgültig löschen', 'Delete permanently')}</button>
                  <button type="button" onClick={() => {
                    setConfirmDelete(null);
                    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-delete-set="${set.id}"]`)?.focus(), 0);
                  }}>{c(locale, 'Abbrechen', 'Cancel')}</button>
                </div>
              ) : (
                <button data-delete-set={set.id} type="button" className="progress-photo-delete" onClick={() => setConfirmDelete(set.id)} aria-label={`${c(locale, 'Check-in löschen', 'Delete check-in')}: ${formatDate(set.completedAt, locale)}`}>
                  <SystemIcon name="delete" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {captureOpen && typeof document !== 'undefined' && createPortal(
        <div className="system-dialog-backdrop progress-photo-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) closeCapture();
        }}>
          <section className="system-dialog progress-photo-modal" role="dialog" aria-modal="true" aria-labelledby="progress-photo-modal-title">
            <header>
              <div><span className="progress-photo-kicker">{c(locale, 'Lokaler Check-in', 'Local check-in')}</span><h2 id="progress-photo-modal-title">{c(locale, 'Neue Momentaufnahme', 'New snapshot')}</h2></div>
              <button ref={closeRef} type="button" className="modal-close" disabled={saving || processing} onClick={closeCapture} aria-label={c(locale, 'Dialog schließen', 'Close dialog')}><SystemIcon name="close" /></button>
            </header>
            <div className="progress-photo-modal__body">
              <ProgressPhotoCapture
                value={draft}
                onChange={setDraft}
                cadenceWeeks={cadence}
                onCadenceChange={setCadence}
                onBusyChange={setProcessing}
                disabled={saving || processing}
                locale={locale}
              />
              {error && <p className="progress-photo-error" role="alert"><SystemIcon name="warning" /> {error}</p>}
            </div>
            <footer>
              <button type="button" className="progress-photo-secondary" onClick={closeCapture} disabled={saving || processing}>{c(locale, 'Ohne Speichern schließen', 'Close without saving')}</button>
              <button type="button" className="progress-photo-primary" onClick={() => void saveCapture()} disabled={saving || processing || Object.keys(draft).length === 0}>
                <SystemIcon name="check" /> {saving ? c(locale, 'Speichere…', 'Saving…') : c(locale, 'Privat speichern', 'Save privately')}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
