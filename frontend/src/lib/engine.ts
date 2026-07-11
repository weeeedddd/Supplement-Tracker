// ═══════════════════════════════════════════════════════════════════
//  ◈ ULTRACODE ENGINES — 1:1-Port aus der Vanilla-App nach TypeScript
//  Alle Funktionen sind DOM-frei (reine Logik + localStorage), damit
//  React-Komponenten sie direkt konsumieren können.
// ═══════════════════════════════════════════════════════════════════
import { S, dateKey, prevKey } from './storage';
import { t } from './i18n';

// ── Typen ────────────────────────────────────────────────────────────
export interface Macros { kcal: number; prot: number; carb: number; fat: number; sug: number; }
export interface Profile {
  firstName: string; age: number; height: number; weight: number;
  gender: string; goal: string; avatarIdx: number; avatarPhoto: string | null;
}
export interface ProtocolItem { id: string; phase: 'alpha' | 'beta' | 'gamma'; wk?: string; }
export interface FoodEntry extends Macros { id: number; name: string; ts: number; }

// ═══ SUPPLEMENT-DEFINITIONEN ═════════════════════════════════════════
export const SDEFS: Record<string, { nk: string; dk: string; ok: string | null }> = {
  omega:      { nk: 'supp_omega', dk: 'supp_omega_dose', ok: 'supp_omega_note' },
  multi:      { nk: 'supp_multi', dk: 'supp_multi_dose', ok: null },
  kreatin:    { nk: 'supp_kreatin', dk: 'supp_kreatin_dose', ok: 'supp_kreatin_note' },
  bcaa:       { nk: 'supp_bcaa', dk: 'supp_bcaa_dose', ok: 'supp_bcaa_note' },
  protein:    { nk: 'supp_protein', dk: 'supp_protein_dose', ok: 'supp_protein_note' },
  vitc:       { nk: 'supp_vitc', dk: 'supp_vitc_dose', ok: 'supp_vitc_note' },
  zinc:       { nk: 'supp_zinc', dk: 'supp_zinc_dose', ok: 'supp_zinc_note' },
  enzyme:     { nk: 'supp_enzyme', dk: 'supp_enzyme_dose', ok: 'supp_enzyme_note' },
  ashwagandha:{ nk: 'supp_ashwa', dk: 'supp_ashwa_dose', ok: 'supp_ashwa_note' },
  magnesium:  { nk: 'supp_mag', dk: 'supp_mag_dose', ok: null },
  melatonin:  { nk: 'supp_melatonin', dk: 'supp_melatonin_dose', ok: 'supp_melatonin_note' },
  lcarnitin:  { nk: 'supp_lcarnitin', dk: 'supp_lcarnitin_dose', ok: 'supp_lcarnitin_note' },
  greentea:   { nk: 'supp_greentea', dk: 'supp_greentea_dose', ok: 'supp_greentea_note' },
  rhodiola:   { nk: 'supp_rhodiola', dk: 'supp_rhodiola_dose', ok: 'supp_rhodiola_note' },
  vitd:       { nk: 'supp_vitd', dk: 'supp_vitd_dose', ok: 'supp_vitd_note' },
  iron:       { nk: 'supp_iron', dk: 'supp_iron_dose', ok: 'supp_iron_note' },
  citrullin:  { nk: 'supp_citrullin', dk: 'supp_citrullin_dose', ok: 'supp_citrullin_note' },
};

// ═══ MAKRO-BERECHNUNG (Mifflin-St. Jeor, geschlechts- & ziel-spezifisch) ═══
export function calcMacros(age: number, heightCm: number, weightKg: number,
  training: string, nutrition: string, sleep: string, gender?: string, goal?: string): Macros {
  const gConst = gender === 'f' ? -161 : 5;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + gConst;
  const actMult = ({ none: 1.2, '1-2x': 1.375, '3-5x': 1.55, daily: 1.725 } as Record<string, number>)[training] || 1.375;
  const tdee = Math.round(bmr * actMult);
  let kcal = tdee + (sleep === 'sleepless' ? 150 : sleep === 'restless' ? 75 : 0);
  kcal = Math.round(kcal * (({ bulk: 1.12, cut: 0.85, perf: 1.05, long: 1.0 } as Record<string, number>)[goal || ''] || 1.0));
  const protG = Math.round(weightKg * (goal === 'cut' ? 2.4 : nutrition === 'highprot' ? 2.2 : 1.8));
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbG = Math.round((kcal - protG * 4 - fatG * 9) / 4);
  const sugG = Math.round(carbG * (nutrition === 'fastfood' ? 0.35 : 0.18));
  return { kcal, prot: protG, carb: Math.max(0, carbG), fat: fatG, sug: sugG };
}

// ═══ SMART SUPPLEMENT ENGINE — Score-basiertes Ranking aus 5 Signalen ═══
export function generateSmartProtocol(profile: Partial<Profile>, answers: Record<string, string>): ProtocolItem[] {
  const { training = '3-5x', nutrition = 'balanced', sleep = 'restless' } = answers || {};
  const goal = profile?.goal || 'bulk';
  const age = profile?.age || 25;
  const wt = profile?.weight || 80;
  const ht = profile?.height || 180;
  const gender = profile?.gender || 'm';
  const bmi = wt / Math.pow(ht / 100, 2);
  const heavyBulk = goal === 'bulk' && (bmi >= 27 || wt >= 100);

  type Cand = { id: string; phase: ProtocolItem['phase']; score: number; wk: string };
  const C: Cand[] = [];
  const add = (id: string, phase: ProtocolItem['phase'], score: number, wk: string) => {
    const ex = C.find(c => c.id === id);
    if (ex) ex.score += score; else C.push({ id, phase, score, wk });
  };

  if (goal === 'bulk') {
    add('kreatin', 'beta', 5, 'why_bulk'); add('protein', 'beta', 4, 'why_bulk');
    add('zinc', 'alpha', 3, 'why_bulk'); add('enzyme', 'beta', 2, 'why_bulk');
    if (heavyBulk) { add('ashwagandha', 'gamma', 4, 'why_bulk'); add('zinc', 'alpha', 2, 'why_bulk'); }
  }
  if (goal === 'cut') {
    add('lcarnitin', 'beta', 5, 'why_cut'); add('greentea', 'alpha', 5, 'why_cut');
    add('protein', 'beta', 4, 'why_cut'); add('multi', 'alpha', 2, 'why_cut');
  }
  if (goal === 'perf') {
    add('citrullin', 'beta', 5, 'why_perf'); add('kreatin', 'beta', 4, 'why_perf'); add('bcaa', 'beta', 2, 'why_perf');
  }
  if (goal === 'long') {
    add('omega', 'alpha', 5, 'why_long'); add('vitd', 'alpha', 4, 'why_long'); add('multi', 'alpha', 3, 'why_long');
  }
  if (training === 'daily') { add('kreatin', 'beta', 3, 'why_perf'); add('bcaa', 'beta', 3, 'why_perf'); add('citrullin', 'beta', 2, 'why_perf'); }
  if (training === '3-5x') { add('kreatin', 'beta', 2, 'why_perf'); add('protein', 'beta', 2, 'why_perf'); }
  if (training === 'none') { add('vitd', 'alpha', 2, 'why_base'); add('multi', 'alpha', 2, 'why_base'); }
  if (nutrition === 'fastfood') { add('vitc', 'alpha', 4, 'why_immune'); add('zinc', 'alpha', 3, 'why_immune'); add('omega', 'alpha', 3, 'why_immune'); add('multi', 'alpha', 3, 'why_immune'); }
  if (nutrition === 'highprot') { add('enzyme', 'beta', 4, 'why_base'); }  // Omega-3 bewusst NICHT
  if (nutrition === 'balanced') { add('omega', 'alpha', 2, 'why_base'); add('multi', 'alpha', 2, 'why_base'); }
  if (sleep === 'sleepless') { add('melatonin', 'gamma', 5, 'why_sleep'); add('magnesium', 'gamma', 4, 'why_sleep'); add('ashwagandha', 'gamma', 3, 'why_sleep'); }
  if (sleep === 'restless') { add('magnesium', 'gamma', 3, 'why_sleep'); add('ashwagandha', 'gamma', 2, 'why_sleep'); }
  if (sleep === 'good') { add('magnesium', 'gamma', 1, 'why_sleep'); }
  if (age >= 30) { add('vitd', 'alpha', 2, 'why_age'); add('omega', 'alpha', 2, 'why_age'); }
  if (age >= 40) { add('multi', 'alpha', 2, 'why_age'); }
  if (gender === 'f') { add('iron', 'alpha', 4, 'why_female'); add('vitd', 'alpha', 1, 'why_female'); }
  if (bmi < 20 && goal !== 'cut') { add('protein', 'beta', 3, 'why_bulk'); add('enzyme', 'beta', 2, 'why_bulk'); }
  if (bmi >= 30 && goal !== 'bulk') { add('greentea', 'alpha', 3, 'why_cut'); add('lcarnitin', 'beta', 2, 'why_cut'); }

  const THRESHOLD = 3;
  const picked = C.filter(c => c.score >= THRESHOLD && SDEFS[c.id]).sort((a, b) => b.score - a.score);
  const perPhase: Record<string, number> = { alpha: 0, beta: 0, gamma: 0 };
  const out: ProtocolItem[] = [];
  for (const c of picked) {
    if (perPhase[c.phase] >= 4) continue;
    perPhase[c.phase]++;
    out.push({ id: c.id, phase: c.phase, wk: c.wk });
  }
  if (!out.length) out.push({ id: 'multi', phase: 'alpha', wk: 'why_base' }, { id: 'magnesium', phase: 'gamma', wk: 'why_base' });
  const ord: Record<string, number> = { alpha: 0, beta: 1, gamma: 2 };
  return out.sort((a, b) => ord[a.phase] - ord[b.phase]);
}

// ═══ STREAK & RANK ═══════════════════════════════════════════════════
export function getStreak(): { count: number; lastDate: string | null } {
  return S.get('streak') || { count: 0, lastDate: null };
}
export function completedToday(): boolean { return getStreak().lastDate === dateKey(); }
export function finaliseStreak(): number {
  if (completedToday()) return getStreak().count;
  const s = getStreak();
  const base = s.lastDate === prevKey() ? s.count : 0;
  const next = base + 1;
  S.set('streak', { count: next, lastDate: dateKey() });
  return next;
}

// ═══ XP / RANK / ACHIEVEMENTS ════════════════════════════════════════
export const XP_RANKS = [
  { min: 0, label: 'Shadow Novice' },
  { min: 100, label: 'Shadow Initiate' },
  { min: 300, label: 'Seven Shadows Elite' },
  { min: 700, label: 'Eminence in Shadow' },
];
const XP_THRESHOLDS = [100, 300, 700, Infinity];

export function getXP(): number { return S.get<number>('xp') || 0; }
export function gainXP(amount: number): void { if (amount > 0) S.set('xp', getXP() + amount); }
export function getXPRankData() {
  const xp = getXP();
  let idx = 0;
  for (let i = 0; i < XP_RANKS.length; i++) if (xp >= XP_RANKS[i].min) idx = i;
  const rank = XP_RANKS[idx];
  const nextXp = XP_THRESHOLDS[idx];
  const pct = nextXp === Infinity ? 100 : Math.min(100, Math.round((xp - rank.min) / (nextXp - rank.min) * 100));
  return { xp, rank, nextXp, pct, idx };
}

export const ACHIEVE_DEFS: Record<string, { icon: string; name: string; desc: string; xp: number }> = {
  novice:     { icon: '◈', name: 'Shadow Novice', desc: 'Erste Schritte in die Void', xp: 0 },
  servant:    { icon: '⚔', name: 'Diener der Schatten', desc: '7 Tage perfektes Tracking', xp: 50 },
  nightWalk:  { icon: '🌙', name: 'Nachtwandler', desc: 'Nahrung nach 23:00 Uhr gescannt', xp: 15 },
  sustenance: { icon: '🍖', name: 'Lord of Sustenance', desc: '10 Mahlzeiten dokumentiert', xp: 20 },
  airfryer:   { icon: '🔥', name: 'Meister des Airfryers', desc: '5× Cordon Bleu eingetragen', xp: 30 },
  alchemist:  { icon: '⚗', name: 'Protokoll-Alchemist', desc: '3× Supplements vollständig', xp: 25 },
};

// Härtung: Storage-Werte können korrupt sein (Nicht-Array) — nie durchreichen
export function asArray<T>(v: unknown, fallback: T[] = []): T[] { return Array.isArray(v) ? (v as T[]) : fallback; }

export function getUnlockedAchievements(): string[] { return asArray<string>(S.get('achievements'), ['novice']); }
export function getEquippedTitle(): string { return S.get('title_equipped') || 'novice'; }
export function equipTitle(id: string): void {
  if (getUnlockedAchievements().includes(id)) S.set('title_equipped', id);
}
// Anzeigename des aktuell ausgerüsteten Titels (für Chat/Sidebar/Bot)
export function equippedTitleName(): string {
  return ACHIEVE_DEFS[getEquippedTitle()]?.name || 'Shadow Novice';
}

// RPG-Snapshot für den Backend-Sync (Shadow Bot !profile / !stats)
export function buildStatsSnapshot(uid: string, name: string, rank: string) {
  const xp = getXPRankData();
  const unlocked = getUnlockedAchievements();
  return {
    uid, name, rank,
    xp: xp.xp, level: xp.idx + 1,
    attrs: calcRPGStats(),
    achievements: unlocked.length,
    titles: unlocked.length,
    equipped_title: equippedTitleName(),
    streak: getStreak().count,
  };
}

export function getAllFoodEntries(): FoodEntry[] {
  const all: FoodEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.key(i);
      if (raw && raw.startsWith('sg_food_')) {
        const entries = S.get<FoodEntry[]>(raw.replace('sg_', ''));
        if (Array.isArray(entries)) all.push(...entries);
      }
    }
  } catch { /* noop */ }
  return all;
}

export function checkAchievements(): void {
  const unlocked = new Set(getUnlockedAchievements());
  const streak = getStreak().count;
  const allFood = getAllFoodEntries();
  let changed = false;
  const unlock = (id: string) => {
    if (!unlocked.has(id)) { unlocked.add(id); gainXP(ACHIEVE_DEFS[id]?.xp || 0); changed = true; }
  };
  if (streak >= 7) unlock('servant');
  if (allFood.length >= 10) unlock('sustenance');
  if (allFood.filter(e => (e.name || '').toLowerCase().includes('cordon')).length >= 5) unlock('airfryer');
  if (allFood.some(e => new Date(e.ts || 0).getHours() >= 23)) unlock('nightWalk');
  if ((S.get<number>('complete_days_count') || 0) >= 3) unlock('alchemist');
  if (changed) S.set('achievements', [...unlocked]);
}

// ═══ RPG-STATS & RADAR ═══════════════════════════════════════════════
export function calcRPGStats() {
  const profile = S.get<Profile>('profile') || ({} as Partial<Profile>);
  const macros = S.get<Macros>('macros') || ({} as Partial<Macros>);
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  const chk = asArray<string>(S.get('day_' + dateKey()));
  const streak = getStreak().count;
  const total = protocol.length;
  const done = total ? chk.filter(id => protocol.some(s => s.id === id)).length : 0;

  const str = Math.min(100, Math.round(((macros.prot || 0) / 2.8) * 0.65 + Math.max(0, ((profile.weight || 70) - 50)) * 0.35));
  const kcalDelta = (macros.kcal || 2000) - 1800;
  const vit = Math.min(100, Math.max(5, Math.round(50 + kcalDelta / 28)));
  const sugRatio = (macros.carb || 1) > 0 ? (macros.sug || 0) / (macros.carb || 1) : 0.15;
  const agi = Math.min(100, Math.max(8, Math.round(100 - sugRatio * 260)));
  const xpPct = getXPRankData().pct;
  const int_ = Math.min(100, Math.round(streak * 4 + xpPct * 0.28));
  const mag = total ? Math.round((done / total) * 100) : 0;
  return { STR: str, VIT: vit, AGI: agi, INT: int_, MAG: mag };
}

// Radar-Chart als SVG-String (Anzeige-only → dangerouslySetInnerHTML)
export function buildRadarSVG(stats: ReturnType<typeof calcRPGStats>, attrs: string[]): string {
  const vals = [stats.STR, stats.VIT, stats.AGI, stats.INT, stats.MAG];
  const cx = 105, cy = 108, R = 76, N = 5;
  const ang = (i: number) => (i * 72 - 90) * Math.PI / 180;
  const pt = (i: number, frac: number) => [
    (cx + R * frac * Math.cos(ang(i))).toFixed(1),
    (cy + R * frac * Math.sin(ang(i))).toFixed(1),
  ];
  const gridSVG = [.33, .66, 1].map(lvl => {
    const pts = Array.from({ length: N }, (_, i) => pt(i, lvl).join(',')).join(' ');
    return `<polygon points="${pts}" class="radar-grid"/>`;
  }).join('');
  const axesSVG = Array.from({ length: N }, (_, i) =>
    `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" class="radar-axis"/>`).join('');
  const statPts = Array.from({ length: N }, (_, i) => pt(i, vals[i] / 100).join(',')).join(' ');
  const statSVG = `<polygon points="${statPts}" class="radar-stat"/>`;
  const LR = R + 17;
  const labelSVG = Array.from({ length: N }, (_, i) => {
    const a = ang(i);
    const lx = (cx + LR * Math.cos(a)).toFixed(1);
    const ly = (cy + LR * Math.sin(a)).toFixed(1);
    const anc = parseFloat(lx) < cx - 4 ? 'end' : parseFloat(lx) > cx + 4 ? 'start' : 'middle';
    return `<text x="${lx}" y="${(parseFloat(ly) - 1).toFixed(1)}" text-anchor="${anc}" class="radar-label">${attrs[i]}</text>
            <text x="${lx}" y="${(parseFloat(ly) + 9).toFixed(1)}" text-anchor="${anc}" class="radar-val">${vals[i]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 210 215" class="rpg-radar-svg" xmlns="http://www.w3.org/2000/svg">${gridSVG}${axesSVG}${statSVG}${labelSVG}</svg>`;
}

// ═══ BUFFS / DEBUFFS (theme-aware, Theme-Objekt wird injiziert) ═══════
export function calcBuffsDebuffs(th: any) {
  const kiAns = S.get<Record<string, string>>('ki_ans') || {};
  const chk = asArray<string>(S.get('day_' + dateKey()));
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  const macros = S.get<Macros>('macros') || ({} as Partial<Macros>);
  const streak = getStreak().count;
  const buffs: { icon: string; name: string; desc: string }[] = [];
  const debuffs: { icon: string; name: string; desc: string }[] = [];

  // Härtung: jedes Theme-Feld defensiv — Buffs fallen weg statt zu crashen
  if (kiAns.sleep === 'sleepless' && th?.sleep2) debuffs.push({ icon: '💤', name: th.sleep2.name, desc: th.sleep2.desc });
  else if (kiAns.sleep === 'restless' && th?.sleep1) debuffs.push({ icon: '😴', name: th.sleep1.name, desc: th.sleep1.desc });

  const alphaDone = ['omega', 'multi'].every(id => chk.includes(id) && protocol.some(s => s.id === id));
  if (alphaDone && th?.alpha) buffs.push({ icon: '⚡', name: th.alpha.name, desc: th.alpha.desc });
  if (streak >= 7) {
    const nm = typeof th?.streak?.name === 'function' ? th.streak.name(streak) : `Streak ${streak}d`;
    buffs.push({ icon: '🔥', name: nm, desc: th?.streak?.desc ?? '' });
  }
  const sugRatio = (macros.carb || 0) > 0 ? (macros.sug || 0) / (macros.carb || 1) : 0;
  if (sugRatio > 0.28 && th?.sugar) debuffs.push({ icon: '🍬', name: th.sugar.name, desc: th.sugar.desc });
  return { buffs, debuffs };
}

// ═══ FOOD LOG ════════════════════════════════════════════════════════
export function getFoodLog(): FoodEntry[] { return asArray<FoodEntry>(S.get('food_' + dateKey())); }
export function saveFoodLog(log: FoodEntry[]): void { S.set('food_' + dateKey(), log); }
export function calcConsumed(): Macros {
  return getFoodLog().reduce((a, e) => ({
    kcal: a.kcal + (e.kcal || 0), prot: a.prot + (e.prot || 0),
    carb: a.carb + (e.carb || 0), fat: a.fat + (e.fat || 0), sug: a.sug + (e.sug || 0),
  }), { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 });
}

// ═══ DYNAMIC GLOW — Zielnähe 0→1 ═════════════════════════════════════
export function goalProximity(checked: string[]): number {
  const parts: number[] = [];
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  if (protocol.length) {
    const done = checked.filter(id => protocol.some(s => s.id === id)).length;
    parts.push(done / protocol.length);
  }
  const goals = S.get<Macros>('macros');
  if (goals && goals.kcal) {
    const c = calcConsumed();
    parts.push(Math.min(1, c.kcal / goals.kcal));
    if (goals.prot) parts.push(Math.min(1, c.prot / goals.prot));
  }
  if (!parts.length) return 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function updateDynamicGlow(checked: string[]): void {
  const p = Math.max(0, Math.min(1, goalProximity(checked)));
  document.documentElement.style.setProperty('--glow-lvl', p.toFixed(3));
  document.body.classList.toggle('goal-pulse', p >= 0.995);
}

// ═══ SOUND ═══════════════════════════════════════════════════════════
export function playSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [261.63, 329.63, 392, 523.25].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0, ctx.currentTime + i * .12);
      g.gain.linearRampToValueAtTime(.14, ctx.currentTime + i * .12 + .05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * .12 + .5);
      o.start(ctx.currentTime + i * .12); o.stop(ctx.currentTime + i * .12 + .5);
    });
  } catch { /* noop */ }
}
