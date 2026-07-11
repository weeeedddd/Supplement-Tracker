// ═══════════════════════════════════════════════════════════════════
//  ◈ BACKEND-CLIENT — Verbindung zum Python/FastAPI-Server
//  Die App bleibt vollständig GitHub-Pages-tauglich: Ohne konfiguriertes
//  Backend laufen alle Features lokal weiter; Chat zeigt Offline-Status.
//  Backend-URL: localStorage (sg_backend_url) > VITE_BACKEND_URL > ''.
// ═══════════════════════════════════════════════════════════════════
import { S, timeoutSignal } from './storage';

export function getBackendUrl(): string {
  const stored = S.get<string>('backend_url');
  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL || '';
  const url = (stored ?? envUrl ?? '').trim();
  return url.replace(/\/+$/, '');
}
export function setBackendUrl(url: string): void {
  S.set('backend_url', url.trim().replace(/\/+$/, ''));
}

export async function backendHealth(): Promise<boolean> {
  const base = getBackendUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/health`, { signal: timeoutSignal(5000) });
    return res.ok;
  } catch { return false; }
}

// Scan-Historie best-effort ans Backend spiegeln (fire-and-forget)
export function syncScanToBackend(entry: { name: string; kcal: number; prot: number; carb: number; fat: number; sug: number }): void {
  const base = getBackendUrl();
  if (!base) return;
  const auth = S.get<any>('auth') || {};
  fetch(`${base}/api/scans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: auth.userId || 'anon', ...entry }),
    signal: timeoutSignal(6000),
  }).catch(() => { /* Backend offline — lokal bleibt die Quelle der Wahrheit */ });
}

// ── Chat ─────────────────────────────────────────────────────────────
export interface RosterUser { uid: string; user: string; title: string; }

export interface SharedRecipe {
  name: string; icon: string; image: string; category: string; prep_min: number;
  kcal: number; prot: number; carb: number; fat: number;
  equipment: string[]; ingredients: string[]; steps: string[];
}

export interface ChatMsg {
  type: 'msg' | 'warning' | 'system' | 'history' | 'presence' | 'bot';
  room?: string; user?: string; uid?: string; title?: string;
  text?: string; media?: string | null; ts?: number;
  recipe?: SharedRecipe | null;   // geteiltes Rezept → Card + Preview-Modal
  reason?: string; messages?: ChatMsg[];
  count?: number;                 // presence: aktuelle Nutzerzahl im Raum
  roster?: RosterUser[];          // presence: aktive User (für die Sidebar)
}

export function chatSocketUrl(room: string, user: string, uid: string, title = ''): string {
  const base = getBackendUrl();
  const ws = base.replace(/^http/, 'ws');
  return `${ws}/ws/chat/${encodeURIComponent(room)}`
    + `?user=${encodeURIComponent(user)}&uid=${encodeURIComponent(uid)}&title=${encodeURIComponent(title)}`;
}

// RPG-Snapshot ans Backend spiegeln, damit der Shadow Bot !profile lesen kann
export function syncProfileToBackend(stats: {
  uid: string; name: string; rank: string; xp: number; level: number;
  attrs: Record<string, number>; achievements: number; titles: number;
  equipped_title: string; streak: number;
}): void {
  const base = getBackendUrl();
  if (!base) return;
  fetch(`${base}/api/profile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stats),
    signal: timeoutSignal(6000),
  }).catch(() => { /* Backend offline — Chat läuft ohne Sync weiter */ });
}

export async function uploadChatMedia(file: File): Promise<string | null> {
  const base = getBackendUrl();
  if (!base) return null;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${base}/api/chat/upload`, { method: 'POST', body: fd, signal: timeoutSignal(15000) });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.url ? `${base}${d.url}` : null;
  } catch { return null; }
}
