// ═══════════════════════════════════════════════════════════════════
//  ◈ GILDE, GERÄTEÜBERGREIFENDER SYNC & WOCHEN-RAIDS — Client
//
//  Lokal-first: ohne konfiguriertes Backend läuft die App unverändert
//  weiter, nur Gilde/Sync/Raids sind dann nicht verfügbar. Das
//  Gilden-Konto ist bewusst ein echtes Server-Konto und getrennt vom
//  lokalen Profil.
// ═══════════════════════════════════════════════════════════════════
import { getBackendUrl } from './backend';
import { S, dateKey, timeoutSignal } from './storage';
import {
  MUSCLE_LOAD_STORAGE_KEY, calculateTrainingLoad, sanitizeMuscleLoadEntries,
  type MuscleLoadEntry,
} from './muscleLoad';

const TIMEOUT = 9000;
const DAY = 86_400_000;

export const GUILD_ACCOUNT_KEY = 'guild_account_v1';
export const SYNC_REV_KEY = 'guild_sync_rev_v1';
export const SYNC_LAST_KEY = 'guild_sync_last_v1';
export const GUILD_UPDATED_EVENT = 'coreline:guild-updated';

// ── Typen ────────────────────────────────────────────────────────────
export interface GuildMemberView {
  uid: string; username: string; role: 'owner' | 'officer' | 'member';
  joined: number; lastSeen: number; online: boolean; me: boolean;
  characterPath?: string; activePlan?: string; activityLabel?: string;
  activityAt?: number; streak?: number;
}
export interface GuildView {
  id: number; name: string; tag: string; motto: string; owner: string; created: number;
  members: GuildMemberView[]; memberCount: number; onlineCount: number;
}
export type RaidKind = 'volume' | 'consistency' | 'sessions';
export interface RaidView {
  id: number; kind: RaidKind; weekKey: string; goal: number; total: number; pct: number;
  contributors: { uid: string; username: string; value: number; me: boolean }[];
}
export interface GuildAccount { token: string; uid: string; username: string; }

// ── Konto ────────────────────────────────────────────────────────────
export function getAccount(): GuildAccount | null { return S.get<GuildAccount>(GUILD_ACCOUNT_KEY); }
export function setAccount(account: GuildAccount | null): void {
  if (account) S.set(GUILD_ACCOUNT_KEY, account); else S.del(GUILD_ACCOUNT_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GUILD_UPDATED_EVENT));
}
export function isConnected(): boolean { return !!getBackendUrl() && !!getAccount(); }

async function api<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error('no_backend');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.auth !== false) {
    const account = getAccount();
    if (!account) throw new Error('no_account');
    headers.Authorization = `Bearer ${account.token}`;
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> || {}) },
    signal: timeoutSignal(TIMEOUT),
  });
  if (res.status === 401) { setAccount(null); throw new Error('unauthorized'); }
  if (!res.ok) {
    let detail = String(res.status);
    try { detail = (await res.json())?.detail || detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Authenticated GET shared by the real friends and push clients. */
export async function authedGet<T>(path: string): Promise<T> {
  return api<T>(path);
}

/** Authentifizierter POST für andere Module. */
export async function authedPost<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function registerAccount(email: string, username: string, password: string): Promise<GuildAccount> {
  const data = await api<any>('/api/auth/register', {
    method: 'POST', auth: false, body: JSON.stringify({ email, username, password }),
  });
  const account: GuildAccount = { token: data.token, uid: data.uid, username: data.username };
  setAccount(account);
  return account;
}

export async function loginAccount(email: string, password: string): Promise<GuildAccount> {
  const data = await api<any>('/api/auth/login', {
    method: 'POST', auth: false, body: JSON.stringify({ email, password }),
  });
  const account: GuildAccount = { token: data.token, uid: data.uid, username: data.username };
  setAccount(account);
  return account;
}

export function logoutAccount(): void { setAccount(null); }

// ── Gilde ────────────────────────────────────────────────────────────
export async function fetchGuild(): Promise<GuildView | null> {
  return (await api<{ guild: GuildView | null }>('/api/v1/guild')).guild;
}
export async function createGuild(name: string, tag: string, motto: string): Promise<GuildView> {
  return api<GuildView>('/api/v1/guild', { method: 'POST', body: JSON.stringify({ name, tag, motto }) });
}
export async function joinGuild(code: string): Promise<GuildView> {
  return api<GuildView>('/api/v1/guild/join', { method: 'POST', body: JSON.stringify({ code }) });
}
export async function leaveGuild(): Promise<{ ok: boolean; disbanded: boolean }> {
  return api('/api/v1/guild/leave', { method: 'POST' });
}
export async function createInvite(): Promise<{ code: string; expires: number; usesLeft: number }> {
  return api('/api/v1/guild/invite', { method: 'POST' });
}

// ── Raids ────────────────────────────────────────────────────────────
export async function fetchRaid(): Promise<{ raid: RaidView | null; weekKey?: string }> {
  return api('/api/v1/raid');
}
export async function startRaid(kind: RaidKind, goal = 0): Promise<{ raid: RaidView; existing?: boolean }> {
  return api('/api/v1/raid', { method: 'POST', body: JSON.stringify({ kind, goal }) });
}
export async function contributeRaid(value: number): Promise<{ raid: RaidView }> {
  return api('/api/v1/raid/contribute', { method: 'POST', body: JSON.stringify({ value }) });
}

function loadEntries(): MuscleLoadEntry[] {
  return sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY));
}

/**
 * Eigener Wochenbeitrag, aus den lokal erfassten Trainingsdaten berechnet.
 * Reine Funktion (Einträge injizierbar), damit sie testbar bleibt.
 */
export function weekContribution(
  kind: RaidKind, entries: MuscleLoadEntry[] = loadEntries(), now = Date.now(),
): number {
  const since = now - 7 * DAY;
  const recent = entries.filter(entry => entry.createdAt >= since && entry.createdAt <= now);
  if (kind === 'volume') {
    return Math.round(recent.reduce((sum, entry) => sum + calculateTrainingLoad(entry), 0));
  }
  const days = new Set(recent.map(entry => dateKey(new Date(entry.createdAt))));
  if (kind === 'sessions') return days.size;
  // consistency: Trainingstage + Tage mit abgehaktem Protokoll
  let protocolDays = 0;
  for (let i = 0; i < 7; i++) {
    const key = dateKey(new Date(now - i * DAY));
    if ((S.get<string[]>('day_' + key) || []).length) protocolDays++;
  }
  return days.size + protocolDays;
}

// ── Geräteübergreifender Sync ────────────────────────────────────────
/**
 * POSITIVLISTE — nur diese Schlüssel verlassen das Gerät.
 *
 * Bewusst keine Sperrliste: die würde jeden künftig hinzugefügten
 * sg_-Schlüssel automatisch mit hochladen. `auth` enthält lokale
 * Anmeldedaten und `guild_account_v1` das Bearer-Token — beides darf
 * niemals in den Sync-Blob geraten.
 */
export const SYNC_ALLOW = [
  'profile', 'user_profile_v3', 'macros', 'nutrition_targets_v2', 'protocol',
  'streak', 'xp', 'achievements', 'title_equipped', 'complete_days_count',
  'cart_cfg', 'lang', 'stat_buffs', 'plan_preferences', 'initial_plan',
  'character_equipped_path_v1', 'fuel_user_dishes',
  'train_muscle_load_v1', 'train_sessions', 'train_user_plans',
  'train_rewarded_sessions', 'train_session_drafts',
] as const;

/**
 * Tagesbezogene Schlüssel — bewusst mit Datumsprüfung statt blossem
 * Präfix: 'food_cache' beginnt ebenfalls mit 'food_', ist aber ein
 * Gerätecache und hat im Sync nichts verloren.
 */
const DAY_KEY_PATTERN = /^(day|food|mana|note)_\d{4}-\d{2}-\d{2}$/;

export function isDayKey(key: string): boolean { return DAY_KEY_PATTERN.test(key); }

export function isSyncable(key: string): boolean {
  return (SYNC_ALLOW as readonly string[]).includes(key) || isDayKey(key);
}

export function collectLocalState(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SYNC_ALLOW) {
    const value = S.get(key);
    if (value !== null) out[key] = value;
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.key(i);
      if (!raw || !raw.startsWith('sg_')) continue;
      const key = raw.slice(3);
      if (!isDayKey(key)) continue;
      const value = S.get(key);
      if (value !== null) out[key] = value;
    }
  } catch { /* noop */ }
  return out;
}

/** Gegenrichtung ebenfalls gefiltert: ein fremder Server darf keine
 *  beliebigen Schlüssel ins lokale Storage schreiben. */
export function applyRemoteState(payload: Record<string, unknown>): number {
  let applied = 0;
  for (const [key, value] of Object.entries(payload || {})) {
    if (!isSyncable(key)) continue;
    S.set(key, value);
    applied++;
  }
  return applied;
}

export function getSyncRev(): number { return S.get<number>(SYNC_REV_KEY) || 0; }
export function getSyncLast(): number { return S.get<number>(SYNC_LAST_KEY) || 0; }
function setSyncRev(rev: number): void { S.set(SYNC_REV_KEY, rev); S.set(SYNC_LAST_KEY, Date.now()); }

export type SyncOutcome =
  | { status: 'pushed'; rev: number }
  | { status: 'pulled'; rev: number; applied: number }
  | { status: 'unchanged'; rev: number }
  | { status: 'conflict'; rev: number; remote: Record<string, unknown> };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Web';
}

/** Erst ziehen, dann schieben. Konflikte werden gemeldet, nie still gelöst. */
export async function syncNow(force = false): Promise<SyncOutcome> {
  const remote = await api<{ rev: number; payload: Record<string, unknown> | null }>('/api/v1/sync');
  const localRev = getSyncRev();
  const localState = collectLocalState();

  // Der Server hat einen Stand, den dieses Gerät noch nie gesehen hat.
  if (remote.rev > 0 && localRev === 0 && remote.payload && !force) {
    const applied = applyRemoteState(remote.payload);
    setSyncRev(remote.rev);
    return { status: 'pulled', rev: remote.rev, applied };
  }

  if (!force && remote.rev === localRev && remote.payload
    && stableJson(remote.payload) === stableJson(localState)) {
    return { status: 'unchanged', rev: remote.rev };
  }

  const result = await api<any>('/api/v1/sync', {
    method: 'POST',
    body: JSON.stringify({
      payload: localState,
      baseRev: force ? remote.rev : localRev,
      device: deviceName(),
    }),
  });
  if (result.conflict) return { status: 'conflict', rev: result.rev, remote: result.payload || {} };
  setSyncRev(result.rev);
  return { status: 'pushed', rev: result.rev };
}

/** Konflikt zugunsten des Servers auflösen. */
export function resolveWithRemote(remote: Record<string, unknown>, rev: number): number {
  const applied = applyRemoteState(remote);
  setSyncRev(rev);
  return applied;
}
