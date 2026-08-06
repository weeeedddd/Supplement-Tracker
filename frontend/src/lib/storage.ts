// ── Lokaler Storage-Wrapper (Prefix sg_) — identisch zur Vanilla-App,
//    damit bestehende Nutzerdaten nahtlos übernommen werden.
export const S = {
  _p: 'sg_',
  get<T = any>(k: string): T | null {
    try {
      const v = localStorage.getItem(this._p + k);
      return v ? (JSON.parse(v) as T) : null;
    } catch { return null; }
  },
  set(k: string, v: unknown): void {
    try { localStorage.setItem(this._p + k, JSON.stringify(v)); } catch (e) { console.warn(e); }
  },
  del(k: string): void {
    try { localStorage.removeItem(this._p + k); } catch { /* noop */ }
  },
};

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateKey(now: Date = new Date()): string { return localDateKey(now); }
export function prevKey(now: Date = new Date()): string {
  const previous = new Date(now.getTime());
  previous.setDate(previous.getDate() - 1);
  return localDateKey(previous);
}

// ── Härtung: AbortSignal.timeout existiert erst ab iOS 16 / Safari 16.
//    Auf älteren Geräten würde der Aufruf synchron werfen → hier ein
//    sicherer Wrapper, der notfalls ohne Timeout-Signal arbeitet.
export function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
      return (AbortSignal as any).timeout(ms);
    }
  } catch { /* noop */ }
  return undefined;
}
