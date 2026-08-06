// ── Minimaler globaler Store: ein Tick-Zähler, den Mutationen erhöhen.
//    Spiegelt die bewährte render()-Architektur der Vanilla-App in React —
//    Screens/Widgets lesen direkt aus localStorage-backed Engines und
//    re-rendern über refresh().
import { useSyncExternalStore } from 'react';

export type Screen = 'onboard' | 'ki' | 'dashboard' | 'fuel' | 'training';

const listeners = new Set<() => void>();
let version = 0;
let currentScreen: Screen = 'onboard';

export function refresh(): void {
  version++;
  listeners.forEach(l => l());
}

export function useAppState(): number {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => version,
  );
}

export function getScreen(): Screen { return currentScreen; }
export function showScreen(s: Screen): void { currentScreen = s; refresh(); }
