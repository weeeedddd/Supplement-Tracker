import { I18N as BASE } from './i18nData';
import { I18N_EXTRA } from './i18nExtra';
import { S } from './storage';
import { refresh } from './store';

// Basiskatalog (aus der Vanilla-App portiert) + Full-Stack-Erweiterungen mergen
export const I18N: Record<string, Record<string, string>> = {};
for (const lg of Object.keys(BASE)) I18N[lg] = { ...BASE[lg], ...(I18N_EXTRA[lg] || {}) };

const SUPPORTED = ['de', 'en'];
export let lang: string = (() => {
  const stored = S.get<string>('lang');
  if (stored) return SUPPORTED.includes(stored) ? stored : 'en';
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : '';
  return SUPPORTED.includes(browserLanguage) ? browserLanguage : 'de';
})();

export function t(k: string): string {
  return (I18N[lang] || I18N.de)[k] || I18N.de[k] || k;
}

export function setLang(l: string): void {
  lang = SUPPORTED.includes(l) ? l : 'en';
  S.set('lang', lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  refresh();
}

export function applyDocumentLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const LANGS = ['de', 'en'] as const;

export const LANG_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English' };
