// ═══════════════════════════════════════════════════════════════════
//  ◈ WOCHEN-SYSTEMBERICHT
//
//  Fasst zusammen, was ohnehin schon erfasst wird: Muskelbalance,
//  Volumenverlauf, Ernährungs- und Protokoll-Konstanz, Rekorde.
//  Jede Empfehlung führt die Zahl mit, auf der sie beruht — und wenn
//  die Datenlage zu dünn ist, sagt der Bericht genau das.
//
//  Reine Logik: Einträge und "jetzt" werden hineingereicht.
// ═══════════════════════════════════════════════════════════════════
import { volumeBetween } from './deload';
import type { FoodEntry, Macros } from './engine';
import { MUSCLE_IDS, calculateTrainingLoad, type MuscleId, type MuscleLoadEntry } from './muscleLoad';
import type { NutritionTargets } from './plans';
import { S, dateKey } from './storage';

const DAY = 86_400_000;

export type RegionId = 'push' | 'pull' | 'legs' | 'core';

export const REGION_MUSCLES: Record<RegionId, MuscleId[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'biceps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  core: ['core'],
};

/** Wochenziel je Muskel in Load-Punkten — etwa zwei solide Einheiten. */
export const WEEKLY_TARGET_PER_MUSCLE = 150;

export const REPORT_MIN_ENTRIES = 4;

// ── Ernährung ────────────────────────────────────────────────────────
export interface DayNutrition { key: string; logged: boolean; macros: Macros; }

const ZERO: Macros = { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 };

export function lastDayKeys(days: number, now = Date.now()): string[] {
  const keys: string[] = [];
  for (let index = days - 1; index >= 0; index--) keys.push(dateKey(new Date(now - index * DAY)));
  return keys;
}

export function nutritionSeries(days = 7, now = Date.now()): DayNutrition[] {
  return lastDayKeys(days, now).map(key => {
    const entries = S.get<FoodEntry[]>('food_' + key) || [];
    const macros = entries.reduce((total, entry) => ({
      kcal: total.kcal + (entry.kcal || 0), prot: total.prot + (entry.prot || 0),
      carb: total.carb + (entry.carb || 0), fat: total.fat + (entry.fat || 0),
      sug: total.sug + (entry.sug || 0),
    }), { ...ZERO });
    return { key, logged: entries.length > 0, macros };
  });
}

/** Anteil der Tage mit erfasster Ernährung (0–100). */
export function nutritionConsistency(days = 7, now = Date.now()): number {
  const series = nutritionSeries(days, now);
  return Math.round((series.filter(day => day.logged).length / series.length) * 100);
}

/** Anteil der Tage mit abgehaktem Protokoll (0–100). */
export function protocolConsistency(days = 7, now = Date.now()): number {
  const keys = lastDayKeys(days, now);
  const done = keys.filter(key => (S.get<string[]>('day_' + key) || []).length > 0).length;
  return Math.round((done / keys.length) * 100);
}

/** Durchschnittliche Kalorien-Zielerreichung an erfassten Tagen (null ohne Ziel). */
export function calorieAdherence(days = 7, now = Date.now()): number | null {
  const targets = S.get<NutritionTargets>('nutrition_targets_v2');
  if (!targets?.calories) return null;
  const logged = nutritionSeries(days, now).filter(day => day.logged);
  if (!logged.length) return null;
  const average = logged.reduce((sum, day) => sum + day.macros.kcal, 0) / logged.length;
  return Math.round((average / targets.calories) * 100);
}

// ── Training ─────────────────────────────────────────────────────────
export interface VolumeWeek { weeksAgo: number; volume: number; sessions: number; }

export function volumeProgression(
  entries: MuscleLoadEntry[], weeks = 4, now = Date.now(),
): VolumeWeek[] {
  const result: VolumeWeek[] = [];
  for (let week = weeks - 1; week >= 0; week--) {
    const to = now - week * 7 * DAY;
    const from = to - 7 * DAY;
    const inWindow = entries.filter(entry => entry.createdAt >= from && entry.createdAt < to);
    const days = new Set(inWindow.map(entry => dateKey(new Date(entry.createdAt))));
    result.push({
      weeksAgo: week,
      volume: Math.round(volumeBetween(entries, from, to)),
      sessions: days.size,
    });
  }
  return result;
}

export interface BalanceRow { id: RegionId; volume: number; target: number; pct: number; }

export function muscleBalance(entries: MuscleLoadEntry[], now = Date.now()): BalanceRow[] {
  const from = now - 7 * DAY;
  return (Object.keys(REGION_MUSCLES) as RegionId[]).map(id => {
    const muscles = REGION_MUSCLES[id];
    const volume = Math.round(entries
      .filter(entry => muscles.includes(entry.muscleId) && entry.createdAt >= from && entry.createdAt <= now)
      .reduce((sum, entry) => sum + calculateTrainingLoad(entry), 0));
    const target = muscles.length * WEEKLY_TARGET_PER_MUSCLE;
    return { id, volume, target, pct: Math.round((volume / target) * 100) };
  });
}

// ── Rekorde ──────────────────────────────────────────────────────────
export type RecordKind = 'session' | 'day' | 'week' | 'streak';
export interface RecordRow { kind: RecordKind; label: string; value: number; when: number | null; }

export function personalRecords(entries: MuscleLoadEntry[], now = Date.now()): RecordRow[] {
  const records: RecordRow[] = [];

  let best = { muscleId: '', load: 0, at: 0 };
  entries.forEach(entry => {
    const load = calculateTrainingLoad(entry);
    if (load > best.load) best = { muscleId: entry.muscleId, load, at: entry.createdAt };
  });
  if (best.load > 0) {
    records.push({ kind: 'session', label: best.muscleId, value: Math.round(best.load), when: best.at });
  }

  const byDay = new Map<string, number>();
  entries.forEach(entry => {
    const key = dateKey(new Date(entry.createdAt));
    byDay.set(key, (byDay.get(key) || 0) + calculateTrainingLoad(entry));
  });
  let bestDay = { key: '', total: 0 };
  byDay.forEach((total, key) => { if (total > bestDay.total) bestDay = { key, total }; });
  if (bestDay.total > 0) {
    records.push({ kind: 'day', label: bestDay.key, value: Math.round(bestDay.total), when: null });
  }

  let bestWeek = 0;
  for (let week = 0; week < 4; week++) {
    const to = now - week * 7 * DAY;
    bestWeek = Math.max(bestWeek, volumeBetween(entries, to - 7 * DAY, to));
  }
  if (bestWeek > 0) records.push({ kind: 'week', label: 'week', value: Math.round(bestWeek), when: null });

  const streak = S.get<{ count: number }>('streak');
  if (streak?.count) records.push({ kind: 'streak', label: 'streak', value: streak.count, when: null });

  return records;
}

// ── Empfehlungen — jede mit Beleg ────────────────────────────────────
export type RecommendationTone = 'good' | 'info' | 'warn' | 'bad';
export type RecommendationId =
  | 'low-data' | 'imbalance' | 'balanced' | 'volume-spike' | 'volume-drop'
  | 'volume-growth' | 'nutrition-gap' | 'nutrition-good' | 'protocol-gap'
  | 'protocol-good' | 'frequency-low' | 'calories-under' | 'calories-over';

export interface Recommendation { id: RecommendationId; tone: RecommendationTone; evidence: string; }

export function recommendations(entries: MuscleLoadEntry[], now = Date.now()): Recommendation[] {
  // Ehrlich bleiben, wenn die Grundlage fehlt.
  if (entries.length < REPORT_MIN_ENTRIES) {
    return [{ id: 'low-data', tone: 'info', evidence: `${entries.length}/${REPORT_MIN_ENTRIES}` }];
  }

  const out: Recommendation[] = [];
  const balance = muscleBalance(entries, now);
  const volume = volumeProgression(entries, 4, now);

  const sorted = [...balance].sort((a, b) => a.pct - b.pct);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  if (strongest.pct - weakest.pct >= 40) {
    out.push({ id: 'imbalance', tone: 'warn', evidence: `${weakest.id} ${weakest.pct}% · ${strongest.id} ${strongest.pct}%` });
  } else if (weakest.pct >= 70) {
    out.push({ id: 'balanced', tone: 'good', evidence: `${weakest.pct}–${strongest.pct}%` });
  }

  const current = volume[volume.length - 1]?.volume || 0;
  const previous = volume[volume.length - 2]?.volume || 0;
  if (previous > 0) {
    const delta = Math.round(((current - previous) / previous) * 100);
    const evidence = `${delta > 0 ? '+' : ''}${delta}% (${previous} → ${current})`;
    if (delta >= 40) out.push({ id: 'volume-spike', tone: 'warn', evidence });
    else if (delta <= -35) out.push({ id: 'volume-drop', tone: 'info', evidence });
    else if (delta >= 5) out.push({ id: 'volume-growth', tone: 'good', evidence });
  }

  const nutrition = nutritionConsistency(7, now);
  if (nutrition < 50) out.push({ id: 'nutrition-gap', tone: 'warn', evidence: `${nutrition}%` });
  else if (nutrition >= 85) out.push({ id: 'nutrition-good', tone: 'good', evidence: `${nutrition}%` });

  const adherence = calorieAdherence(7, now);
  if (adherence !== null && adherence < 80) {
    out.push({ id: 'calories-under', tone: 'info', evidence: `${adherence}%` });
  } else if (adherence !== null && adherence > 120) {
    out.push({ id: 'calories-over', tone: 'info', evidence: `${adherence}%` });
  }

  const protocol = protocolConsistency(7, now);
  if (protocol > 0 && protocol < 50) out.push({ id: 'protocol-gap', tone: 'warn', evidence: `${protocol}%` });
  else if (protocol >= 85) out.push({ id: 'protocol-good', tone: 'good', evidence: `${protocol}%` });

  const sessions = volume[volume.length - 1]?.sessions || 0;
  if (sessions <= 1 && current > 0) out.push({ id: 'frequency-low', tone: 'info', evidence: `${sessions}` });

  return out;
}

export interface WeeklyReport {
  generatedAt: number;
  balance: BalanceRow[];
  volume: VolumeWeek[];
  nutrition: DayNutrition[];
  nutritionPct: number;
  protocolPct: number;
  caloriePct: number | null;
  records: RecordRow[];
  recommendations: Recommendation[];
  muscleCount: number;
}

export function buildWeeklyReport(entries: MuscleLoadEntry[], now = Date.now()): WeeklyReport {
  return {
    generatedAt: now,
    balance: muscleBalance(entries, now),
    volume: volumeProgression(entries, 4, now),
    nutrition: nutritionSeries(7, now),
    nutritionPct: nutritionConsistency(7, now),
    protocolPct: protocolConsistency(7, now),
    caloriePct: calorieAdherence(7, now),
    records: personalRecords(entries, now),
    recommendations: recommendations(entries, now),
    muscleCount: MUSCLE_IDS.length,
  };
}
