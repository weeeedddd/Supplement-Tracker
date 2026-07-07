import { THEMES } from './themesData';
import { S } from './storage';
import { refresh } from './store';

export { THEMES };

export function getCurrentTheme(): string { return S.get<string>('theme') || 'shadow'; }

export function applyTheme(name: string): void {
  if (!THEMES[name]) name = 'shadow';
  S.set('theme', name);
  document.documentElement.setAttribute('data-theme', name);
  refresh();
}

export function theme(): any { return THEMES[getCurrentTheme()]; }
