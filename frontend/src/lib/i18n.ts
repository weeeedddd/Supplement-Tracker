import { I18N as BASE } from './i18nData';
import { I18N_EXTRA } from './i18nExtra';
import { S } from './storage';
import { refresh } from './store';

// Basiskatalog (aus der Vanilla-App portiert) + Full-Stack-Erweiterungen mergen
export const I18N: Record<string, Record<string, string>> = {};
for (const lg of Object.keys(BASE)) I18N[lg] = { ...BASE[lg], ...(I18N_EXTRA[lg] || {}) };

export let lang: string = S.get<string>('lang') || 'de';

export function t(k: string): string {
  return (I18N[lang] || I18N.de)[k] || I18N.de[k] || k;
}

export function setLang(l: string): void {
  lang = l;
  S.set('lang', l);
  refresh();
}

export const LANGS = ['de', 'en', 'ja', 'ko', 'es'] as const;

export const LANG_NAMES: Record<string, string> = {
  de: 'German', en: 'English', ja: 'Japanese', ko: 'Korean', es: 'Spanish',
};
