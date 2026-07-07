// ═══════════════════════════════════════════════════════════════════
//  ◈ BACKEND-CLIENT — Verbindung zum Python/FastAPI-Server
//  Die App bleibt vollständig GitHub-Pages-tauglich: Ohne konfiguriertes
//  Backend laufen alle Features lokal weiter; Chat zeigt Offline-Status.
//  Backend-URL: localStorage (sg_backend_url) > VITE_BACKEND_URL > ''.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';

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
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
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
    signal: AbortSignal.timeout(6000),
  }).catch(() => { /* Backend offline — lokal bleibt die Quelle der Wahrheit */ });
}

// ── Chat ─────────────────────────────────────────────────────────────
export interface ChatMsg {
  type: 'msg' | 'warning' | 'system' | 'history';
  room?: string; user?: string; uid?: string;
  text?: string; media?: string | null; ts?: number;
  reason?: string; messages?: ChatMsg[];
}

export function chatSocketUrl(room: string, user: string, uid: string): string {
  const base = getBackendUrl();
  const ws = base.replace(/^http/, 'ws');
  return `${ws}/ws/chat/${encodeURIComponent(room)}?user=${encodeURIComponent(user)}&uid=${encodeURIComponent(uid)}`;
}

export async function uploadChatMedia(file: File): Promise<string | null> {
  const base = getBackendUrl();
  if (!base) return null;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${base}/api/chat/upload`, { method: 'POST', body: fd, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.url ? `${base}${d.url}` : null;
  } catch { return null; }
}
