// ═══════════════════════════════════════════════════════════════════
//  ◈ SHADOW-KI ONBOARDING — TS-Port der lokalen State-Machine
//  Sprach-Fix: alle Antworten kommen aus dem I18N-Katalog der aktiven
//  Sprache; ein optionales Backend/OpenAI kann vorgeschaltet werden.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';
import { t } from './i18n';
import { calcMacros, generateSmartProtocol, type Macros, type Profile, type ProtocolItem } from './engine';

export interface KiResponse {
  message: string;
  finalEvaluation: boolean;
  error?: boolean;
  macros?: Macros;
  protocol?: ProtocolItem[];
}

export let kiAns: Record<string, string> = {};
export function resetKiAns(): void { kiAns = {}; }

const detect = (maps: { w: string[]; v: string }[], text: string): string | null => {
  for (const { w, v } of maps) if (w.some(k => text.includes(k))) return v;
  return null;
};

const trainMap = [
  { w: ['täglich', 'jeden tag', '7x', '6x', 'every day', 'daily', '7 mal', '6 mal'], v: 'daily' },
  { w: ['5', '4', '3', 'fünf', 'vier', 'drei', '5x', '4x', '3x', 'dreimal', 'viermal', 'fünfmal', 'gym', 'training', 'pumpen', 'sport', 'workout', 'kraft', 'studio', 'fitnessstudio'], v: '3-5x' },
  { w: ['1', '2', 'einmal', 'zweimal', '1x', '2x', 'selten', 'rarely', 'manchmal', 'sometimes'], v: '1-2x' },
  { w: ['nie', 'kein', 'not', 'never', 'gar nicht', 'überhaupt nicht', 'keinen sport'], v: 'none' },
];
const nutrMap = [
  { w: ['protein', 'whey', 'hähnchen', 'chicken', 'fleisch', 'meat', 'high protein', 'viel protein', 'eiweiss', 'eiweiß', 'thunfisch', 'tuna', 'quark', 'magerquark', 'lachs', 'salmon', 'eier', 'eggs'], v: 'highprot' },
  { w: ['burger', 'pizza', 'fastfood', 'fast food', 'mcdo', 'junk', 'kebab', 'döner', 'pommes', 'chips', 'süssigkeiten', 'süßigkeiten', 'schokolade', 'candy', 'takeaway'], v: 'fastfood' },
  { w: ['ausgewogen', 'balanced', 'gesund', 'healthy', 'salat', 'gemüse', 'veg', 'obst', 'vollkorn', 'clean', 'meal prep', 'meal-prep', 'gekocht', 'selbst gekocht'], v: 'balanced' },
];
const sleepMap = [
  { w: ['schlecht', 'bad', 'terrible', 'kaum', 'wenig', '3 stunden', '4 stunden', '5 stunden', 'nicht gut', 'schlaf schlecht', 'schlafe schlecht', 'schlaf nicht', 'insomnie', 'insomnia', 'kaum schlaf', 'zu wenig'], v: 'sleepless' },
  { w: ['mittel', 'medium', 'okay', 'ok', 'so la la', '4-6', '5-6', 'geht so', 'manchmal', 'unregelmässig', 'unregelmäßig', 'nicht immer', 'mal gut mal schlecht'], v: 'restless' },
  { w: ['gut', 'super', 'toll', 'perfekt', 'tief', 'erholsam', '7', '8', '9', '10', 'regelmässig', 'regelmäßig', 'deep sleep', 'immer gut'], v: 'good' },
];

export function buildFallbackResponse(history: { role: string; content: string }[], profile: Partial<Profile>): KiResponse {
  const userMsgs = history.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
  const combined = userMsgs.join(' ');
  const turn = userMsgs.length;
  const name = profile.firstName || 'Vessel';
  const lastMsg = userMsgs[turn - 1] || '';

  if (!kiAns.training) kiAns.training = detect(trainMap, combined) || '3-5x';
  if (!kiAns.nutrition) kiAns.nutrition = detect(nutrMap, combined) || 'balanced';
  if (!kiAns.sleep) kiAns.sleep = detect(sleepMap, combined) || 'restless';

  if (turn === 1) {
    const trainingNote = t(({ daily: 'kib_train_daily', '3-5x': 'kib_train_35', '1-2x': 'kib_train_12', none: 'kib_train_none' } as Record<string, string>)[kiAns.training] || 'kib_train_35');
    const sleepNote = t(({ sleepless: 'kib_sleep_bad', restless: 'kib_sleep_mid', good: 'kib_sleep_good' } as Record<string, string>)[kiAns.sleep] || 'kib_sleep_mid');
    return { message: `${trainingNote}\n\n${sleepNote}\n\n${t('kib_q_nutrition').replace('{name}', name)}`, finalEvaluation: false };
  }
  if (turn === 2) {
    const nutrNote = t(({ highprot: 'kib_nutr_prot', fastfood: 'kib_nutr_fast', balanced: 'kib_nutr_bal' } as Record<string, string>)[kiAns.nutrition] || 'kib_nutr_bal');
    return { message: `${nutrNote}\n\n${t('kib_q_stress')}`, finalEvaluation: false };
  }

  // TURN 3 — Abschluss: Stress-Signal + Makros + Smart-Protokoll
  const stressKW = ['stress', 'druck', 'pressure', 'viel arbeit', 'busy', 'burnout', 'mental', 'kopfarbeit', 'überlastet', 'overwhelmed'];
  const sedentKW = ['büro', 'office', 'sitzen', 'sedentary', 'desk', 'computer', 'pc', 'schreibtisch', 'viel sitzen'];
  const activeKW = ['aktiv', 'active', 'stehe', 'laufe', 'walk', 'bewegung', 'viel bewegen', 'physisch', 'handwerk', 'lager'];

  let activityMod: 'neutral' | 'high_stress' | 'active' | 'sedentary' = 'neutral';
  if (stressKW.some(k => lastMsg.includes(k))) activityMod = 'high_stress';
  else if (activeKW.some(k => lastMsg.includes(k))) activityMod = 'active';
  else if (sedentKW.some(k => lastMsg.includes(k))) activityMod = 'sedentary';

  if (activityMod === 'sedentary' && kiAns.training === '3-5x') kiAns.training = '1-2x';

  const macros = profile.age
    ? calcMacros(profile.age!, profile.height!, profile.weight!, kiAns.training, kiAns.nutrition, kiAns.sleep, profile.gender, profile.goal)
    : { kcal: 2200, prot: 160, carb: 245, fat: 65, sug: 37 };
  macros.sug = Math.round(macros.carb * 0.15);

  const protocol = generateSmartProtocol(profile, kiAns);
  if (activityMod === 'high_stress') {
    if (!protocol.find(p => p.id === 'ashwagandha')) protocol.push({ id: 'ashwagandha', phase: 'gamma', wk: 'why_stress' });
    if (!protocol.find(p => p.id === 'rhodiola')) protocol.push({ id: 'rhodiola', phase: 'gamma', wk: 'why_stress' });
  }

  const closingNote = t(({ high_stress: 'kib_close_high_stress', active: 'kib_close_active', sedentary: 'kib_close_sedentary', neutral: 'kib_close_neutral' } as Record<string, string>)[activityMod]);

  S.set('ki_ans', kiAns);
  return {
    message: `${closingNote}\n\n${t('kib_final').replace('{name}', name)}`,
    finalEvaluation: true,
    macros,
    protocol,
  };
}
