export const PROGRESS_PHOTO_SCHEMA_VERSION = 1 as const;
export const PROGRESS_PHOTO_SLOTS = ['head', 'torso', 'legs', 'full-body'] as const;
export const PROGRESS_PHOTO_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_PROGRESS_PHOTO_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_PROGRESS_PHOTO_SET_BYTES = 40 * 1024 * 1024;
export const MAX_PROGRESS_PHOTO_LIBRARY_BYTES = 300 * 1024 * 1024;
export const DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS = 12 as const;
export const PROGRESS_PHOTO_REMINDER_OPTIONS = [8, 10, 12] as const;

export type ProgressPhotoSlot = (typeof PROGRESS_PHOTO_SLOTS)[number];
export type ProgressPhotoMimeType = (typeof PROGRESS_PHOTO_ALLOWED_MIME_TYPES)[number];
export type ProgressPhotoReminderWeeks = (typeof PROGRESS_PHOTO_REMINDER_OPTIONS)[number];

export interface ProgressPhotoSetMetadata {
  id: string;
  schemaVersion: typeof PROGRESS_PHOTO_SCHEMA_VERSION;
  createdAt: string;
  completedAt: string;
  slots: ProgressPhotoSlot[];
  photoCount: number;
  totalBytes: number;
  isComplete: boolean;
}

export interface SaveProgressPhotoCheckInInput {
  /** Supplying the same ID replaces that check-in atomically while preserving createdAt. */
  setId?: string;
  completedAt?: Date | string;
  photos: Partial<Record<ProgressPhotoSlot, Blob>>;
}

export interface ValidatedProgressPhotoSelection {
  photos: ReadonlyArray<{
    slot: ProgressPhotoSlot;
    blob: Blob;
    mimeType: ProgressPhotoMimeType;
    size: number;
  }>;
  slots: ProgressPhotoSlot[];
  totalBytes: number;
  isComplete: boolean;
}

export interface ProgressPhotoObjectUrl {
  blob: Blob;
  url: string;
  revoke: () => void;
}

export interface ProgressPhotoReminderState {
  cadenceWeeks: ProgressPhotoReminderWeeks;
  hasBaseline: boolean;
  latestCompletedOn: string | null;
  dueOn: string | null;
  daysUntilDue: number | null;
  due: boolean;
}

export type ProgressPhotoValidationCode =
  | 'empty_selection'
  | 'invalid_slot'
  | 'invalid_blob'
  | 'unsupported_mime_type'
  | 'empty_file'
  | 'file_too_large'
  | 'set_too_large'
  | 'invalid_set_id'
  | 'invalid_date'
  | 'invalid_reminder_cadence';

export class ProgressPhotoValidationError extends Error {
  readonly code: ProgressPhotoValidationCode;

  constructor(code: ProgressPhotoValidationCode, message: string) {
    super(message);
    this.name = 'ProgressPhotoValidationError';
    this.code = code;
  }
}

export type ProgressPhotoStorageCode =
  | 'indexeddb_unavailable'
  | 'storage_failed'
  | 'library_too_large'
  | 'object_url_unavailable';

export class ProgressPhotoStorageError extends Error {
  readonly code: ProgressPhotoStorageCode;

  constructor(code: ProgressPhotoStorageCode, message: string) {
    super(message);
    this.name = 'ProgressPhotoStorageError';
    this.code = code;
  }
}

interface ProgressPhotoBlobRecord {
  key: string;
  setId: string;
  schemaVersion: typeof PROGRESS_PHOTO_SCHEMA_VERSION;
  slot: ProgressPhotoSlot;
  mimeType: ProgressPhotoMimeType;
  size: number;
  blob: Blob;
}

const DATABASE_NAME = 'coreline-progress-photos';
const DATABASE_VERSION = 1;
const SETS_STORE = 'sets';
const PHOTOS_STORE = 'photos';
const PHOTOS_BY_SET_INDEX = 'by-set';
const MILLISECONDS_PER_DAY = 86_400_000;
const allowedSlots = new Set<string>(PROGRESS_PHOTO_SLOTS);
const allowedMimeTypes = new Set<string>(PROGRESS_PHOTO_ALLOWED_MIME_TYPES);

function requireValidSetId(setId: string): string {
  const normalized = setId.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(normalized)) {
    throw new ProgressPhotoValidationError('invalid_set_id', 'Invalid progress photo set ID.');
  }
  return normalized;
}

function toValidDate(value: Date | string, code: 'invalid_date' = 'invalid_date'): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ProgressPhotoValidationError(code, 'Invalid progress photo date.');
  }
  return date;
}

function localDateOrdinal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY;
}

function localDateKeyFromOrdinal(ordinal: number): string {
  const date = new Date(ordinal * MILLISECONDS_PER_DAY);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function newSetId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `progress-${cryptoApi.randomUUID()}`;
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `progress-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  return `progress-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function blobKey(setId: string, slot: ProgressPhotoSlot): string {
  return `${setId}:${slot}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function storageFailure(error: unknown): ProgressPhotoStorageError {
  if (error instanceof ProgressPhotoStorageError) return error;
  return new ProgressPhotoStorageError('storage_failed', 'Progress photos could not be accessed on this device.');
}

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw new ProgressPhotoStorageError(
      'indexeddb_unavailable',
      'Private photo storage is unavailable in this browser.',
    );
  }

  try {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SETS_STORE)) {
        database.createObjectStore(SETS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PHOTOS_STORE)) {
        const photoStore = database.createObjectStore(PHOTOS_STORE, { keyPath: 'key' });
        photoStore.createIndex(PHOTOS_BY_SET_INDEX, 'setId', { unique: false });
      }
    };

    const database = await requestResult(request);
    database.onversionchange = () => database.close();
    return database;
  } catch (error) {
    throw storageFailure(error);
  }
}

export function validateProgressPhotoSelection(
  photos: Partial<Record<ProgressPhotoSlot, Blob>>,
): ValidatedProgressPhotoSelection {
  if (!photos || typeof photos !== 'object') {
    throw new ProgressPhotoValidationError('empty_selection', 'Select at least one progress photo.');
  }

  const validated: ValidatedProgressPhotoSelection['photos'][number][] = [];
  for (const [slot, candidate] of Object.entries(photos)) {
    if (!allowedSlots.has(slot)) {
      throw new ProgressPhotoValidationError('invalid_slot', 'Unknown progress photo slot.');
    }
    if (!(candidate instanceof Blob)) {
      throw new ProgressPhotoValidationError('invalid_blob', 'Progress photos must be image files.');
    }

    const mimeType = candidate.type.toLowerCase();
    if (!allowedMimeTypes.has(mimeType)) {
      throw new ProgressPhotoValidationError(
        'unsupported_mime_type',
        'Only JPEG, PNG, and WebP progress photos are supported.',
      );
    }
    if (candidate.size <= 0) {
      throw new ProgressPhotoValidationError('empty_file', 'Empty progress photos cannot be saved.');
    }
    if (candidate.size > MAX_PROGRESS_PHOTO_FILE_BYTES) {
      throw new ProgressPhotoValidationError('file_too_large', 'A progress photo exceeds the file size limit.');
    }

    validated.push({
      slot: slot as ProgressPhotoSlot,
      blob: candidate,
      mimeType: mimeType as ProgressPhotoMimeType,
      size: candidate.size,
    });
  }

  if (validated.length === 0) {
    throw new ProgressPhotoValidationError('empty_selection', 'Select at least one progress photo.');
  }

  validated.sort((left, right) => (
    PROGRESS_PHOTO_SLOTS.indexOf(left.slot) - PROGRESS_PHOTO_SLOTS.indexOf(right.slot)
  ));
  const totalBytes = validated.reduce((total, photo) => total + photo.size, 0);
  if (totalBytes > MAX_PROGRESS_PHOTO_SET_BYTES) {
    throw new ProgressPhotoValidationError('set_too_large', 'The progress photo check-in exceeds the size limit.');
  }

  return {
    photos: validated,
    slots: validated.map(({ slot }) => slot),
    totalBytes,
    isComplete: validated.length === PROGRESS_PHOTO_SLOTS.length,
  };
}

export function calculateProgressPhotoReminder(
  latestCompletedAt: Date | string | null | undefined,
  cadenceWeeks: ProgressPhotoReminderWeeks = DEFAULT_PROGRESS_PHOTO_REMINDER_WEEKS,
  now: Date = new Date(),
): ProgressPhotoReminderState {
  if (!PROGRESS_PHOTO_REMINDER_OPTIONS.includes(cadenceWeeks)) {
    throw new ProgressPhotoValidationError(
      'invalid_reminder_cadence',
      'Progress photo reminders support 8, 10, or 12 week intervals.',
    );
  }

  const currentDate = toValidDate(now);
  if (latestCompletedAt == null) {
    return {
      cadenceWeeks,
      hasBaseline: false,
      latestCompletedOn: null,
      dueOn: null,
      daysUntilDue: null,
      due: false,
    };
  }

  const latestDate = toValidDate(latestCompletedAt);
  const latestOrdinal = localDateOrdinal(latestDate);
  const dueOrdinal = latestOrdinal + cadenceWeeks * 7;
  const daysUntilDue = dueOrdinal - localDateOrdinal(currentDate);
  return {
    cadenceWeeks,
    hasBaseline: true,
    latestCompletedOn: localDateKeyFromOrdinal(latestOrdinal),
    dueOn: localDateKeyFromOrdinal(dueOrdinal),
    daysUntilDue,
    due: daysUntilDue <= 0,
  };
}

export async function saveProgressPhotoCheckIn(
  input: SaveProgressPhotoCheckInInput,
): Promise<ProgressPhotoSetMetadata> {
  const selection = validateProgressPhotoSelection(input.photos);
  const setId = input.setId ? requireValidSetId(input.setId) : newSetId();
  const completedAt = toValidDate(input.completedAt ?? new Date()).toISOString();
  const database = await openDatabase();

  try {
    const transaction = database.transaction([SETS_STORE, PHOTOS_STORE], 'readwrite');
    const setsStore = transaction.objectStore(SETS_STORE);
    const photosStore = transaction.objectStore(PHOTOS_STORE);
    const existingSetRequest = setsStore.get(setId) as IDBRequest<ProgressPhotoSetMetadata | undefined>;
    const allSetsRequest = setsStore.getAll() as IDBRequest<ProgressPhotoSetMetadata[]>;
    const existingPhotoKeysRequest = photosStore.index(PHOTOS_BY_SET_INDEX).getAllKeys(setId);

    const [existingSet, allSets, existingPhotoKeys] = await Promise.all([
      requestResult(existingSetRequest),
      requestResult(allSetsRequest),
      requestResult(existingPhotoKeysRequest),
    ]);
    const storedBytesWithoutCurrentSet = allSets.reduce(
      (total, item) => total + (item.id === setId ? 0 : item.totalBytes),
      0,
    );
    if (storedBytesWithoutCurrentSet + selection.totalBytes > MAX_PROGRESS_PHOTO_LIBRARY_BYTES) {
      transaction.abort();
      throw new ProgressPhotoStorageError(
        'library_too_large',
        'The private progress photo storage limit has been reached.',
      );
    }

    for (const key of existingPhotoKeys) photosStore.delete(key);

    const metadata: ProgressPhotoSetMetadata = {
      id: setId,
      schemaVersion: PROGRESS_PHOTO_SCHEMA_VERSION,
      createdAt: existingSet?.createdAt ?? new Date().toISOString(),
      completedAt,
      slots: selection.slots,
      photoCount: selection.photos.length,
      totalBytes: selection.totalBytes,
      isComplete: selection.isComplete,
    };
    setsStore.put(metadata);
    for (const photo of selection.photos) {
      const record: ProgressPhotoBlobRecord = {
        key: blobKey(setId, photo.slot),
        setId,
        schemaVersion: PROGRESS_PHOTO_SCHEMA_VERSION,
        slot: photo.slot,
        mimeType: photo.mimeType,
        size: photo.size,
        blob: photo.blob,
      };
      photosStore.put(record);
    }

    await transactionComplete(transaction);
    return metadata;
  } catch (error) {
    throw storageFailure(error);
  } finally {
    database.close();
  }
}

export async function listProgressPhotoSets(): Promise<ProgressPhotoSetMetadata[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETS_STORE, 'readonly');
    const records = await requestResult(
      transaction.objectStore(SETS_STORE).getAll() as IDBRequest<ProgressPhotoSetMetadata[]>,
    );
    await transactionComplete(transaction);
    return records.sort((left, right) => (
      new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
    ));
  } catch (error) {
    throw storageFailure(error);
  } finally {
    database.close();
  }
}

export async function loadProgressPhotoBlob(
  setId: string,
  slot: ProgressPhotoSlot,
): Promise<Blob | null> {
  const normalizedSetId = requireValidSetId(setId);
  if (!allowedSlots.has(slot)) {
    throw new ProgressPhotoValidationError('invalid_slot', 'Unknown progress photo slot.');
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(PHOTOS_STORE, 'readonly');
    const record = await requestResult(
      transaction.objectStore(PHOTOS_STORE).get(blobKey(normalizedSetId, slot)) as
        IDBRequest<ProgressPhotoBlobRecord | undefined>,
    );
    await transactionComplete(transaction);
    return record?.blob ?? null;
  } catch (error) {
    throw storageFailure(error);
  } finally {
    database.close();
  }
}

export async function loadProgressPhotoObjectUrl(
  setId: string,
  slot: ProgressPhotoSlot,
): Promise<ProgressPhotoObjectUrl | null> {
  const blob = await loadProgressPhotoBlob(setId, slot);
  if (!blob) return null;
  if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
    throw new ProgressPhotoStorageError(
      'object_url_unavailable',
      'Photo previews are unavailable in this browser.',
    );
  }

  const url = URL.createObjectURL(blob);
  let revoked = false;
  return {
    blob,
    url,
    revoke: () => {
      if (revoked) return;
      URL.revokeObjectURL(url);
      revoked = true;
    },
  };
}

export async function deleteProgressPhotoSet(setId: string): Promise<boolean> {
  const normalizedSetId = requireValidSetId(setId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction([SETS_STORE, PHOTOS_STORE], 'readwrite');
    const setsStore = transaction.objectStore(SETS_STORE);
    const photosStore = transaction.objectStore(PHOTOS_STORE);
    const [existingSet, photoKeys] = await Promise.all([
      requestResult(setsStore.get(normalizedSetId)),
      requestResult(photosStore.index(PHOTOS_BY_SET_INDEX).getAllKeys(normalizedSetId)),
    ]);
    setsStore.delete(normalizedSetId);
    for (const key of photoKeys) photosStore.delete(key);
    await transactionComplete(transaction);
    return existingSet !== undefined;
  } catch (error) {
    throw storageFailure(error);
  } finally {
    database.close();
  }
}

export async function deleteAllProgressPhotos(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([SETS_STORE, PHOTOS_STORE], 'readwrite');
    transaction.objectStore(SETS_STORE).clear();
    transaction.objectStore(PHOTOS_STORE).clear();
    await transactionComplete(transaction);
  } catch (error) {
    throw storageFailure(error);
  } finally {
    database.close();
  }
}
