// ═══════════════════════════════════════════════════════════════════
//  ◈ AGENT TRAINING PROTOCOLS & MATERIA FUEL — Frontend-Datenschicht
//  Offline-first: Preset-Gerichte/Workouts + localStorage; wenn ein
//  Backend konfiguriert ist, laufen Listen/Anlegen/Loggen über die API.
//  Stat-Buffs werden immer lokal gespiegelt (Dashboard-Widget bleibt
//  offline snappy) — identische Regeln wie im Backend.
// ═══════════════════════════════════════════════════════════════════
import { S } from './storage';
import { getBackendUrl } from './backend';
import { timeoutSignal } from './storage';
import { PRESET_DISHES } from './dishesData';
import { equippedTitleName } from './engine';

export interface Dish {
  id: number | string; name: string; category: string;
  ingredients: string[]; steps?: string[]; prep_min: number;
  kcal: number; prot: number; carb: number; fat: number;
  equipment: string[]; icon: string; image?: string; is_preset?: boolean; owner_uid?: string;
}
export interface Exercise { name: string; sets: number; reps: string; weight: string; rest: number; }
export interface Workout {
  id: number | string; name: string; kind: string; focus: string;
  exercises: Exercise[]; icon: string; is_preset?: boolean;
}
export interface Buff { label: string; icon: string; desc: string; boosts: Record<string, number>; expires_at: number; source?: string; }

const uid = () => (S.get<any>('auth')?.userId as string) || '#000';

// ── Preset-Daten (Spiegel des Backends → funktioniert ohne Server) ───
//   Der vollständige Katalog (100+ Gerichte mit Bild & Zubereitung) liegt in
//   dishesData.ts und wird aus derselben Quelle wie das Backend generiert.
export { PRESET_DISHES };

const ex = (name: string, sets: number, reps: string, weight: string, rest: number): Exercise => ({ name, sets, reps, weight, rest });
export const PRESET_WORKOUTS: Workout[] = [
  { id: 'w-push', name: 'Push Day', kind: 'push', focus: 'Brust · Schultern · Trizeps', icon: '🏋', is_preset: true, exercises: [
    ex('Bankdrücken', 4, '6-8', '80 kg', 120), ex('Schrägbank-Kurzhantel', 3, '10', '24 kg', 90),
    ex('Schulterdrücken', 3, '10', '18 kg', 90), ex('Seitheben', 3, '15', '10 kg', 60), ex('Trizeps-Pushdown', 3, '12', '25 kg', 60)] },
  { id: 'w-pull', name: 'Pull Day', kind: 'pull', focus: 'Rücken · Bizeps', icon: '🏋', is_preset: true, exercises: [
    ex('Klimmzüge', 4, '8', 'BW', 120), ex('Langhantelrudern', 4, '8', '70 kg', 100),
    ex('Latzug', 3, '12', '55 kg', 90), ex('Face Pulls', 3, '15', '20 kg', 60), ex('Bizeps-Curls', 3, '12', '14 kg', 60)] },
  { id: 'w-legs', name: 'Leg Day', kind: 'legs', focus: 'Quads · Hamstrings · Waden', icon: '🦵', is_preset: true, exercises: [
    ex('Kniebeugen', 4, '6-8', '100 kg', 150), ex('Rumänisches Kreuzheben', 3, '10', '80 kg', 120),
    ex('Beinpresse', 3, '12', '160 kg', 90), ex('Beinbeuger', 3, '12', '40 kg', 75), ex('Wadenheben', 4, '15', '60 kg', 45)] },
  { id: 'w-full', name: 'Ganzkörper Basis', kind: 'fullbody', focus: 'Kraft-Grundlagen für Einsteiger', icon: '⚡', is_preset: true, exercises: [
    ex('Kniebeugen', 3, '10', '50 kg', 90), ex('Bankdrücken', 3, '10', '50 kg', 90),
    ex('Langhantelrudern', 3, '10', '45 kg', 90), ex('Schulterdrücken', 3, '12', '14 kg', 75), ex('Plank', 3, '45s', 'BW', 45)] },
];

// ── Backend-Helfer ───────────────────────────────────────────────────
async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const base = getBackendUrl();
  if (!base) return null;
  try {
    const res = await fetch(base + path, { ...init, signal: timeoutSignal(8000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

// ── Gerichte ─────────────────────────────────────────────────────────
function localDishes(): Dish[] { return [...PRESET_DISHES, ...(S.get<Dish[]>('fuel_user_dishes') || [])]; }

export async function fetchDishes(category?: string, equipment?: string): Promise<Dish[]> {
  const qs = new URLSearchParams({ owner: uid() });
  if (category) qs.set('category', category);
  if (equipment) qs.set('equipment', equipment);
  const r = await api<{ dishes: Dish[] }>(`/api/dishes?${qs}`);
  let list = r?.dishes ?? localDishes();
  if (!r) {  // lokale Filter
    if (category) list = list.filter(d => d.category === category);
    if (equipment) list = list.filter(d => d.equipment.includes(equipment));
  }
  return list;
}

export async function createDish(input: Omit<Dish, 'id' | 'is_preset'>): Promise<Dish> {
  const r = await api<Dish>('/api/dishes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, owner_uid: uid() }),
  });
  if (r) return r;
  const local: Dish = { ...input, id: 'u-' + Date.now(), is_preset: false, owner_uid: uid() };
  S.set('fuel_user_dishes', [...(S.get<Dish[]>('fuel_user_dishes') || []), local]);
  return local;
}

// ── Trainingspläne ───────────────────────────────────────────────────
function localWorkouts(): Workout[] { return [...PRESET_WORKOUTS, ...(S.get<Workout[]>('train_user_plans') || [])]; }

export async function fetchWorkouts(): Promise<Workout[]> {
  const r = await api<{ workouts: Workout[] }>(`/api/workouts?owner=${encodeURIComponent(uid())}`);
  return r?.workouts ?? localWorkouts();
}

export async function createWorkout(input: Omit<Workout, 'id' | 'is_preset'>): Promise<Workout> {
  const r = await api<Workout>('/api/workouts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, owner_uid: uid() }),
  });
  if (r) return r;
  const local: Workout = { ...input, id: 'u-' + Date.now(), is_preset: false };
  S.set('train_user_plans', [...(S.get<Workout[]>('train_user_plans') || []), local]);
  return local;
}

// ── MEGA-FEATURE: Stat-Buffs ─────────────────────────────────────────
const BUFF_TTL = 6 * 3600 * 1000;

function computeMealBuff(prot: number, kcal: number): Buff {
  const exp = Date.now() + BUFF_TTL;
  if (prot >= 30) return { label: 'High-Protein Meal', icon: '🥩', desc: '+10 Physische Basiswerte', boosts: { STR: 10, VIT: 10 }, expires_at: exp, source: 'meal' };
  if (kcal >= 500) return { label: 'Energie-Schub', icon: '🔥', desc: '+8 Vitalität', boosts: { VIT: 8 }, expires_at: exp, source: 'meal' };
  return { label: 'Materia getankt', icon: '🍽', desc: '+5 Vitalität', boosts: { VIT: 5 }, expires_at: exp, source: 'meal' };
}
function computeWorkoutBuff(kind: string): Buff {
  const exp = Date.now() + BUFF_TTL;
  let boosts: Record<string, number> = { STR: 5, INT: 5 };
  if (kind === 'legs') boosts = { STR: 8, VIT: 4 };
  else if (kind === 'push' || kind === 'pull') boosts = { STR: 7, INT: 3 };
  const desc = '+' + Object.entries(boosts).map(([k, v]) => `${v} ${k}`).join(' · +');
  return { label: 'Protokoll absolviert', icon: '⚡', desc, boosts, expires_at: exp, source: 'workout' };
}

function pushLocalBuff(b: Buff): void {
  const list = (S.get<Buff[]>('stat_buffs') || []).filter(x => x.expires_at > Date.now());
  list.push(b);
  S.set('stat_buffs', list);
}

export function getActiveBuffs(): Buff[] {
  const list = (S.get<Buff[]>('stat_buffs') || []).filter(b => b.expires_at > Date.now());
  S.set('stat_buffs', list);   // gepruned zurückschreiben
  return list.sort((a, b) => b.expires_at - a.expires_at);
}

export function buffTotals(buffs: Buff[] = getActiveBuffs()): Record<string, number> {
  const tot: Record<string, number> = {};
  for (const b of buffs) for (const [k, v] of Object.entries(b.boosts || {})) tot[k] = (tot[k] || 0) + v;
  return tot;
}

export async function logMeal(d: { name: string; prot: number; kcal: number }): Promise<Buff> {
  const buff = computeMealBuff(d.prot, d.kcal);
  pushLocalBuff(buff);   // sofort lokal → Dashboard reagiert direkt
  api('/api/log/meal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: uid(), name: d.name, prot: d.prot, kcal: d.kcal }),
  });
  return buff;
}

export async function logWorkout(w: { name: string; kind: string }): Promise<Buff> {
  const buff = computeWorkoutBuff(w.kind);
  pushLocalBuff(buff);
  api('/api/log/workout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: uid(), name: w.name, kind: w.kind }),
  });
  return buff;
}

export function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Rezept-Sharing → Community-Chat ──────────────────────────────────
export async function shareRecipeToChat(dish: Dish, room = 'global'): Promise<boolean> {
  const base = getBackendUrl();
  if (!base) return false;   // Chat ist backend-gebunden (offline-first)
  const auth = S.get<any>('auth') || {};
  const profile = S.get<any>('profile') || {};
  const recipe = {
    name: dish.name, icon: dish.icon, image: dish.image || '', category: dish.category,
    prep_min: dish.prep_min, kcal: dish.kcal, prot: dish.prot, carb: dish.carb, fat: dish.fat,
    equipment: dish.equipment, ingredients: dish.ingredients, steps: dish.steps || [],
  };
  try {
    const res = await fetch(base + '/api/chat/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: timeoutSignal(8000),
      body: JSON.stringify({
        room, user: profile.firstName || auth.username || 'Shadow',
        uid: auth.userId || '#000', title: equippedTitleName(), recipe,
      }),
    });
    return res.ok;
  } catch { return false; }
}

// ── AI PROTOCOL BUILDER — dynamischer Trainingsplan-Generator ────────
export type PlanLevel = 'beginner' | 'advanced' | 'elite';
export type PlanGoal = 'muscle' | 'strength' | 'endurance' | 'definition';
export type PlanFocus = 'push' | 'pull' | 'legs' | 'fullbody';
export interface PlanParams { level: PlanLevel; goal: PlanGoal; focus: PlanFocus; days: number; }

const EX_POOL: Record<PlanFocus, string[]> = {
  push: ['Bankdrücken', 'Schrägbankdrücken', 'Schulterdrücken', 'Butterfly', 'Seitheben', 'Trizeps-Pushdown', 'Dips'],
  pull: ['Klimmzüge', 'Langhantelrudern', 'Latzug', 'Kreuzheben', 'Face Pulls', 'Bizeps-Curls', 'Hammer-Curls'],
  legs: ['Kniebeugen', 'Beinpresse', 'Rumänisches Kreuzheben', 'Ausfallschritte', 'Beinbeuger', 'Beinstrecker', 'Wadenheben'],
  fullbody: ['Kniebeugen', 'Bankdrücken', 'Langhantelrudern', 'Schulterdrücken', 'Kreuzheben', 'Ausfallschritte', 'Plank'],
};
const GOAL_SCHEME: Record<PlanGoal, { reps: string; rest: number; setBias: number; de: string }> = {
  strength:   { reps: '4-6',   rest: 150, setBias: 1,  de: 'Kraftaufbau' },
  muscle:     { reps: '8-12',  rest: 90,  setBias: 0,  de: 'Muskelaufbau' },
  definition: { reps: '12-15', rest: 60,  setBias: 0,  de: 'Definition' },
  endurance:  { reps: '15-20', rest: 45,  setBias: -1, de: 'Ausdauer' },
};
const LEVEL_META: Record<PlanLevel, { count: number; sets: number; de: string }> = {
  beginner: { count: 4, sets: 3, de: 'Anfänger' },
  advanced: { count: 5, sets: 4, de: 'Fortgeschritten' },
  elite:    { count: 6, sets: 4, de: 'Elite' },
};
const FOCUS_META: Record<PlanFocus, { icon: string; de: string; muscles: string }> = {
  push:     { icon: '🏋', de: 'Push', muscles: 'Brust · Schultern · Trizeps' },
  pull:     { icon: '🏋', de: 'Pull', muscles: 'Rücken · Bizeps' },
  legs:     { icon: '🦵', de: 'Legs', muscles: 'Quads · Hamstrings · Waden' },
  fullbody: { icon: '⚡', de: 'Ganzkörper', muscles: 'Kraft-Grundlagen' },
};

export function generatePlan(p: PlanParams): Omit<Workout, 'id' | 'is_preset'> {
  const lvl = LEVEL_META[p.level] || LEVEL_META.beginner;
  const gs = GOAL_SCHEME[p.goal] || GOAL_SCHEME.muscle;
  const fm = FOCUS_META[p.focus] || FOCUS_META.fullbody;
  const sets = Math.max(2, Math.min(6, lvl.sets + gs.setBias));
  // mehr Tage/Woche → etwas weniger Volumen pro Einheit (sinnvolle Erholung)
  const count = Math.max(3, Math.min(EX_POOL[p.focus].length, lvl.count - (p.days >= 5 ? 1 : 0)));
  const names = EX_POOL[p.focus].slice(0, count);
  const exercises: Exercise[] = names.map((name, i) => ({
    name,
    // Grundübung (erste) bei Kraft schwerer & wenige Reps, Isolation etwas höher
    sets: i === 0 && p.goal === 'strength' ? sets + 1 : sets,
    reps: name === 'Plank' ? '45s' : i >= count - 1 && p.goal !== 'strength' ? '12-15' : gs.reps,
    weight: '—',
    rest: name === 'Plank' ? 45 : i === 0 ? gs.rest + 30 : gs.rest,
  }));
  return {
    name: `KI · ${fm.de} · ${gs.de}`,
    kind: p.focus,
    focus: `${fm.muscles} · ${lvl.de} · ${p.days}×/Woche`,
    icon: fm.icon,
    exercises,
  };
}
