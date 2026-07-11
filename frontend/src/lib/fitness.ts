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

export interface Dish {
  id: number | string; name: string; category: string;
  ingredients: string[]; prep_min: number;
  kcal: number; prot: number; carb: number; fat: number;
  equipment: string[]; icon: string; is_preset?: boolean; owner_uid?: string;
}
export interface Exercise { name: string; sets: number; reps: string; weight: string; rest: number; }
export interface Workout {
  id: number | string; name: string; kind: string; focus: string;
  exercises: Exercise[]; icon: string; is_preset?: boolean;
}
export interface Buff { label: string; icon: string; desc: string; boosts: Record<string, number>; expires_at: number; source?: string; }

const uid = () => (S.get<any>('auth')?.userId as string) || '#000';

// ── Preset-Daten (Spiegel des Backends → funktioniert ohne Server) ───
export const PRESET_DISHES: Dish[] = [
  { id: 'p-cordon', name: 'Airfryer Cordon Bleu', category: 'main', prep_min: 20, kcal: 480, prot: 34, carb: 22, fat: 26, equipment: ['airfryer'], icon: '🍗', is_preset: true,
    ingredients: ['2 Hähnchenschnitzel', '2 Scheiben Kochschinken', '2 Scheiben Käse', 'Semmelbrösel', '1 Ei', 'Salz, Pfeffer'] },
  { id: 'p-fries', name: 'Airfryer Süßkartoffel-Pommes', category: 'main', prep_min: 18, kcal: 310, prot: 5, carb: 58, fat: 7, equipment: ['airfryer'], icon: '🍠', is_preset: true,
    ingredients: ['1 große Süßkartoffel', '1 EL Olivenöl', 'Paprikapulver', 'Salz'] },
  { id: 'p-lachs', name: 'Airfryer Lachs & Brokkoli', category: 'main', prep_min: 15, kcal: 420, prot: 38, carb: 12, fat: 24, equipment: ['airfryer'], icon: '🐟', is_preset: true,
    ingredients: ['180g Lachsfilet', '150g Brokkoli', '1 EL Olivenöl', 'Zitrone, Salz'] },
  { id: 'p-jollof', name: 'Reiskocher Jollof Rice', category: 'main', prep_min: 30, kcal: 520, prot: 22, carb: 78, fat: 12, equipment: ['ricecooker'], icon: '🍚', is_preset: true,
    ingredients: ['200g Reis', '1 Dose Tomaten', '1 Zwiebel', '150g Hähnchen', 'Paprika, Gewürze'] },
  { id: 'p-oats', name: 'Reiskocher Protein-Oats', category: 'breakfast', prep_min: 12, kcal: 390, prot: 30, carb: 52, fat: 8, equipment: ['ricecooker'], icon: '🥣', is_preset: true,
    ingredients: ['80g Haferflocken', '1 Scoop Proteinpulver', '250ml Milch', '1 Banane', 'Zimt'] },
  { id: 'p-congee', name: 'Reiskocher Hähnchen-Congee', category: 'main', prep_min: 35, kcal: 360, prot: 28, carb: 46, fat: 6, equipment: ['ricecooker'], icon: '🍲', is_preset: true,
    ingredients: ['100g Reis', '150g Hähnchen', '1L Brühe', 'Ingwer, Frühlingszwiebel'] },
  { id: 'p-quark', name: 'Magerquark-Bowl', category: 'breakfast', prep_min: 5, kcal: 320, prot: 40, carb: 30, fat: 4, equipment: ['none'], icon: '🥛', is_preset: true,
    ingredients: ['250g Magerquark', '100g Beeren', '20g Nüsse', '1 TL Honig'] },
  { id: 'p-pancakes', name: 'Protein-Pancakes', category: 'breakfast', prep_min: 15, kcal: 410, prot: 35, carb: 40, fat: 10, equipment: ['stove'], icon: '🥞', is_preset: true,
    ingredients: ['1 Banane', '2 Eier', '1 Scoop Protein', '40g Haferflocken'] },
  { id: 'p-brownie', name: 'Airfryer Protein-Brownie', category: 'dessert', prep_min: 20, kcal: 240, prot: 18, carb: 24, fat: 8, equipment: ['airfryer'], icon: '🍫', is_preset: true,
    ingredients: ['1 Scoop Schoko-Protein', '1 Ei', '30g Haferflocken', '1 EL Kakao', 'Süßstoff'] },
  { id: 'p-skyr', name: 'Skyr-Eiscreme', category: 'dessert', prep_min: 10, kcal: 180, prot: 22, carb: 18, fat: 2, equipment: ['none'], icon: '🍨', is_preset: true,
    ingredients: ['300g Skyr', '1 Banane (gefroren)', 'Vanille', 'Süßstoff'] },
];

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
