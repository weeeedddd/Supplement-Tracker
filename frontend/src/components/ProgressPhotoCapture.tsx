import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { lang } from '../lib/i18n';
import {
  MAX_PROGRESS_PHOTO_FILE_BYTES,
  PROGRESS_PHOTO_REMINDER_OPTIONS,
  PROGRESS_PHOTO_SLOTS,
  type ProgressPhotoReminderWeeks,
  type ProgressPhotoSlot,
} from '../lib/progressPhotos';
import { SystemIcon } from './SystemIcon';

import '../progress-photos.css';

export type ProgressPhotoDraft = Partial<Record<ProgressPhotoSlot, Blob>>;

export interface ProgressPhotoCaptureProps {
  value: ProgressPhotoDraft;
  onChange: (next: ProgressPhotoDraft) => void;
  cadenceWeeks?: ProgressPhotoReminderWeeks;
  onCadenceChange?: (weeks: ProgressPhotoReminderWeeks) => void;
  showCadence?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  locale?: 'de' | 'en';
}

const SLOT_COPY: Record<ProgressPhotoSlot, { de: string; en: string; hintDe: string; hintEn: string }> = {
  head: { de: 'Kopf', en: 'Head', hintDe: 'Kopf und Schultern', hintEn: 'Head and shoulders' },
  torso: { de: 'Körpermitte', en: 'Torso', hintDe: 'Brust bis Hüfte', hintEn: 'Chest to hips' },
  legs: { de: 'Beine', en: 'Legs', hintDe: 'Hüfte bis Füße', hintEn: 'Hips to feet' },
  'full-body': { de: 'Ganzkörper', en: 'Full body', hintDe: 'Neutraler Stand', hintEn: 'Neutral stance' },
};
const MAX_DECODED_PHOTO_EDGE = 12_000;
const MAX_DECODED_PHOTO_PIXELS = 80_000_000;

function copy(locale: 'de' | 'en', de: string, en: string) {
  return locale === 'de' ? de : en;
}

function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function prepareProgressPhoto(file: File): Promise<Blob> {
  const mimeType = file.type.toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('unsupported');
  }
  if (file.size <= 0 || file.size > MAX_PROGRESS_PHOTO_FILE_BYTES) {
    throw new Error('size');
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesImageSignature(header, mimeType)) throw new Error('invalid');

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error('invalid');
    if (
      decoded.width > MAX_DECODED_PHOTO_EDGE
      || decoded.height > MAX_DECODED_PHOTO_EDGE
      || decoded.width * decoded.height > MAX_DECODED_PHOTO_PIXELS
    ) throw new Error('dimensions');
    const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('processing');
    context.fillStyle = '#0b0d0e';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    canvas.width = 1;
    canvas.height = 1;
    if (!blob?.size || blob.size > MAX_PROGRESS_PHOTO_FILE_BYTES) throw new Error('processing');
    return blob;
  } finally {
    decoded.close();
  }
}

function usePreviewUrls(value: ProgressPhotoDraft) {
  const [urls, setUrls] = useState<Partial<Record<ProgressPhotoSlot, string>>>({});
  useEffect(() => {
    const entries = PROGRESS_PHOTO_SLOTS.flatMap((slot) => {
      const blob = value[slot];
      return blob ? [[slot, URL.createObjectURL(blob)] as const] : [];
    });
    setUrls(Object.fromEntries(entries));
    return () => entries.forEach(([, url]) => URL.revokeObjectURL(url));
  }, [value]);
  return urls;
}

export function ProgressPhotoCapture({
  value,
  onChange,
  cadenceWeeks = 12,
  onCadenceChange,
  showCadence = true,
  disabled = false,
  onBusyChange,
  locale = lang === 'en' ? 'en' : 'de',
}: ProgressPhotoCaptureProps) {
  const baseId = useId();
  const inputRefs = useRef<Partial<Record<ProgressPhotoSlot, HTMLInputElement | null>>>({});
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const [processing, setProcessing] = useState<ProgressPhotoSlot | null>(null);
  const [error, setError] = useState('');
  const urls = usePreviewUrls(value);
  const selectedCount = useMemo(() => PROGRESS_PHOTO_SLOTS.filter((slot) => value[slot]).length, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      onBusyChange?.(false);
    };
  }, [onBusyChange]);

  const chooseFile = async (slot: ProgressPhotoSlot, file?: File) => {
    if (!file) return;
    setError('');
    setProcessing(slot);
    onBusyChange?.(true);
    const requestGeneration = ++requestGenerationRef.current;
    try {
      const blob = await prepareProgressPhoto(file);
      if (!mountedRef.current || requestGeneration !== requestGenerationRef.current) return;
      onChange({ ...value, [slot]: blob });
    } catch (caught) {
      if (!mountedRef.current || requestGeneration !== requestGenerationRef.current) return;
      const code = caught instanceof Error ? caught.message : 'processing';
      setError(code === 'unsupported'
        ? copy(locale, 'Nur JPEG, PNG oder WebP sind erlaubt.', 'Only JPEG, PNG, or WebP is supported.')
        : code === 'size'
          ? copy(locale, 'Das Bild darf maximal 12 MB groß sein.', 'The image must be no larger than 12 MB.')
          : code === 'dimensions'
            ? copy(locale, 'Die Bildauflösung ist für eine sichere Verarbeitung zu hoch. Wähle eine kleinere Aufnahme oder einen Screenshot.', 'The image resolution is too high to process safely. Choose a smaller photo or a screenshot.')
          : copy(locale, 'Das Bild konnte nicht sicher verarbeitet werden.', 'The image could not be processed safely.'));
    } finally {
      if (!mountedRef.current || requestGeneration !== requestGenerationRef.current) return;
      setProcessing(null);
      onBusyChange?.(false);
      const input = inputRefs.current[slot];
      if (input) input.value = '';
    }
  };

  return (
    <section className="progress-photo-capture" aria-labelledby={`${baseId}-title`}>
      <div className="progress-photo-capture__intro">
        <span className="progress-photo-kicker"><SystemIcon name="camera" /> {copy(locale, 'Private Fortschrittsakte', 'Private progress record')}</span>
        <h3 id={`${baseId}-title`}>{copy(locale, 'Vier Perspektiven. Alle freiwillig.', 'Four angles. All optional.')}</h3>
        <p>{copy(locale,
          'Die Auswahl bleibt in diesem Browserprofil. Sie wird nicht hochgeladen und nicht durch KI oder Körperanalyse ausgewertet. Je nach Gerät öffnet sich Kamera oder Mediathek.',
          'Your selection stays in this browser profile. It is not uploaded or evaluated by AI or body analysis. Depending on your device, the camera or photo library opens.')}</p>
      </div>

      <div className="progress-photo-grid">
        {PROGRESS_PHOTO_SLOTS.map((slot, index) => {
          const slotCopy = SLOT_COPY[slot];
          const label = locale === 'de' ? slotCopy.de : slotCopy.en;
          const hint = locale === 'de' ? slotCopy.hintDe : slotCopy.hintEn;
          const inputId = `${baseId}-${slot}`;
          const hasPhoto = Boolean(value[slot]);
          return (
            <article className={`progress-photo-slot${hasPhoto ? ' has-photo' : ''}`} key={slot}>
              <div className="progress-photo-slot__head">
                <span aria-hidden="true">0{index + 1}</span>
                <div><strong>{label}</strong><small>{hint}</small></div>
                {hasPhoto && <SystemIcon name="check" title={copy(locale, 'Ausgewählt', 'Selected')} />}
              </div>
              <div className="progress-photo-slot__preview">
                {urls[slot]
                  ? <img src={urls[slot]} alt={copy(locale, `Vorschau: ${label}`, `Preview: ${label}`)} />
                  : <><SystemIcon name="camera" /><span>{copy(locale, 'Noch kein Bild', 'No image yet')}</span></>}
              </div>
              <input
                ref={(node) => { inputRefs.current[slot] = node; }}
                className="progress-photo-file-input"
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture={slot === 'head' ? 'user' : 'environment'}
                disabled={disabled || processing !== null}
                onChange={(event) => void chooseFile(slot, event.currentTarget.files?.[0])}
                tabIndex={-1}
                aria-hidden="true"
              />
              <div className="progress-photo-slot__actions">
                <button
                  type="button"
                  className="progress-photo-action"
                  disabled={disabled || processing !== null}
                  onClick={() => inputRefs.current[slot]?.click()}
                >
                  <SystemIcon name={hasPhoto ? 'sync' : 'camera'} />
                  {processing === slot
                    ? copy(locale, 'Verarbeite…', 'Processing…')
                    : hasPhoto ? copy(locale, 'Ersetzen', 'Replace') : copy(locale, 'Foto wählen', 'Choose photo')}
                </button>
                {hasPhoto && (
                  <button
                    type="button"
                    className="progress-photo-action progress-photo-action--danger"
                    disabled={disabled || processing !== null}
                    onClick={() => {
                      const next = { ...value };
                      delete next[slot];
                      onChange(next);
                    }}
                    aria-label={copy(locale, `${label} entfernen`, `Remove ${label}`)}
                  ><SystemIcon name="delete" /></button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="progress-photo-capture__status" aria-live="polite">
        <span>{selectedCount} / 4 {copy(locale, 'ausgewählt', 'selected')}</span>
        <small>{copy(locale, 'Auch ein einzelnes Foto kann gespeichert werden.', 'A single photo can also be saved.')}</small>
      </div>

      {showCadence && onCadenceChange && (
        <label className="progress-photo-cadence">
          <span><SystemIcon name="calendar" /> {copy(locale, 'In-App-Erinnerung', 'In-app reminder')}</span>
          <select
            value={cadenceWeeks}
            disabled={disabled}
            onChange={(event) => onCadenceChange(Number(event.target.value) as ProgressPhotoReminderWeeks)}
          >
            {PROGRESS_PHOTO_REMINDER_OPTIONS.map((weeks) => (
              <option value={weeks} key={weeks}>
                {copy(locale, `alle ${weeks} Wochen`, `every ${weeks} weeks`)}
              </option>
            ))}
          </select>
          <small>{copy(locale, 'Erscheint nur beim Öffnen der App; keine Systembenachrichtigung.', 'Shown only when you open the app; no system notification.')}</small>
        </label>
      )}

      {error && <p className="progress-photo-error" role="alert"><SystemIcon name="warning" /> {error}</p>}
    </section>
  );
}
