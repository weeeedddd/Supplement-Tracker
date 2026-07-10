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

export function dateKey(): string { return new Date().toISOString().slice(0, 10); }
export function prevKey(): string { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

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
