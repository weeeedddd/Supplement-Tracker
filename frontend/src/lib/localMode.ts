import { S } from './storage';

export const LOCAL_DATA_SCHEMA = 2;
export const LEGACY_AUTH_KEYS = ['auth', 'session', '_pending', '_uidctr'] as const;

export type InitialScreen = 'onboard' | 'dashboard';

export interface LocalSyncState {
  mode: 'local-only';
  schemaVersion: number;
  provider: null;
}

export const LOCAL_SYNC_STATE: LocalSyncState = {
  mode: 'local-only',
  schemaVersion: LOCAL_DATA_SCHEMA,
  provider: null,
};

export function resolveInitialScreen(get: (key: string) => unknown): InitialScreen {
  return get('profile') ? 'dashboard' : 'onboard';
}

export function removeLegacyPseudoAuth(): void {
  for (const key of LEGACY_AUTH_KEYS) S.del(key);
}

interface StorageReader {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface LocalExport {
  app: 'Supplement Tracker';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
  excludedLegacyKeys: string[];
}

/**
 * Creates a portable local-data snapshot without carrying forward the obsolete
 * password/session records from the old demo login. Corrupt values are skipped
 * instead of being interpreted or repaired during export.
 */
export function collectExportableLocalData(
  storage: StorageReader,
  exportedAt = new Date().toISOString(),
): LocalExport {
  const data: Record<string, unknown> = {};
  const excludedLegacyKeys: string[] = [];
  const excluded = new Set<string>(LEGACY_AUTH_KEYS);

  for (let index = 0; index < storage.length; index++) {
    const rawKey = storage.key(index);
    if (!rawKey?.startsWith(S._p)) continue;
    const key = rawKey.slice(S._p.length);

    if (excluded.has(key)) {
      excludedLegacyKeys.push(key);
      continue;
    }

    const rawValue = storage.getItem(rawKey);
    if (rawValue === null) continue;
    try {
      data[key] = JSON.parse(rawValue) as unknown;
    } catch {
      // Ignore malformed local values. They are not safe to sync or re-import.
    }
  }

  return {
    app: 'Supplement Tracker',
    schemaVersion: LOCAL_DATA_SCHEMA,
    exportedAt,
    data,
    excludedLegacyKeys: excludedLegacyKeys.sort(),
  };
}
