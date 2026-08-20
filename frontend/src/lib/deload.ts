// ═══════════════════════════════════════════════════════════════════
//  ◈ DELOAD-SCHUTZ
//
//  Warnt, wenn dieselben Muskeln über Tage hinweg stark belastet
//  bleiben, und schlägt eine leichtere Einheit vor. Rechnet auf
//  denselben Zahlen wie die Heatmap (calculateMuscleLoads), damit
//  Anzeige und Warnung nie auseinanderlaufen.
//
//  Reine Logik: alle Funktionen nehmen Einträge und "jetzt" entgegen.
// ═══════════════════════════════════════════════════════════════════
import {
  MUSCLE_IDS,
  calculateMuscleLoads,
  calculateTrainingLoad,
  getMuscleLoadBand,
  type MuscleId,
  type MuscleLoadEntry,
} from './muscleLoad';

const DAY = 86_400_000;

/** Tage, über die zurückgeblickt wird. */
export const DELOAD_LOOKBACK_DAYS = 5;
/** Ab so vielen belasteten Tagen gilt ein Muskel als dauerhaft strapaziert. */
export const DELOAD_STRAINED_DAYS = 3;
/** Ganzkörper-Durchschnitt, ab dem ein Tag als schwer zählt. */
export const DELOAD_BODY_THRESHOLD = 40;
/** Volumensprung gegenüber der Vorwoche, ab dem gewarnt wird (Prozent). */
export const DELOAD_SPIKE_PCT = 40;

export type DeloadLevel = 'none' | 'watch' | 'advised' | 'urgent';

/** i18n-freie Kennungen; die Oberfläche übersetzt sie. */
export type DeloadReason = 'persistent-strain' | 'sustained-body-load' | 'volume-spike';

export interface DeloadSignal {
  level: DeloadLevel;
  /** Muskeln, die über mehrere Tage im belasteten Band lagen. */
  strained: MuscleId[];
  /** Aufeinanderfolgende Tage mit hoher Ganzkörperlast. */
  sustainedDays: number;
  /** Volumenänderung Woche über Woche in Prozent (0 ohne Vorwoche). */
  volumeTrendPct: number;
  reasons: DeloadReason[];
}

export interface LighterSession {
  muscleId: MuscleId;
  /** Empfohlene Sätze — reduziert gegenüber dem zuletzt Geleisteten. */
  sets: number;
  reps: number;
  load: number;
}

/** Trainingsvolumen in einem Zeitfenster. */
export function volumeBetween(entries: MuscleLoadEntry[], from: number, to: number): number {
  return entries
    .filter(entry => entry.createdAt >= from && entry.createdAt < to)
    .reduce((total, entry) => total + calculateTrainingLoad(entry), 0);
}

/** Auslastung, wie sie vor `daysAgo` Tagen ausgesehen hätte. */
export function loadsAtDaysAgo(
  entries: MuscleLoadEntry[], daysAgo: number, now = Date.now(),
): Record<MuscleId, number> {
  return calculateMuscleLoads(entries, now - daysAgo * DAY);
}

export function detectDeload(entries: MuscleLoadEntry[], now = Date.now()): DeloadSignal {
  const reasons: DeloadReason[] = [];

  // 1) Muskeln, die an mehreren der letzten Tage im belasteten Band lagen.
  const strainedDays = Object.fromEntries(MUSCLE_IDS.map(id => [id, 0])) as Record<MuscleId, number>;
  for (let day = 0; day < DELOAD_LOOKBACK_DAYS; day++) {
    const loads = loadsAtDaysAgo(entries, day, now);
    MUSCLE_IDS.forEach(id => {
      if (getMuscleLoadBand(loads[id]) === 'strained') strainedDays[id] += 1;
    });
  }
  const strained = MUSCLE_IDS.filter(id => strainedDays[id] >= DELOAD_STRAINED_DAYS);

  // 2) Ganzkörperlast über aufeinanderfolgende Tage.
  let sustainedDays = 0;
  for (let day = 0; day < 7; day++) {
    const loads = loadsAtDaysAgo(entries, day, now);
    const average = MUSCLE_IDS.reduce((sum, id) => sum + loads[id], 0) / MUSCLE_IDS.length;
    if (average >= DELOAD_BODY_THRESHOLD) sustainedDays += 1; else break;
  }

  // 3) Volumen gegenüber der Vorwoche.
  const thisWeek = volumeBetween(entries, now - 7 * DAY, now + 1);
  const lastWeek = volumeBetween(entries, now - 14 * DAY, now - 7 * DAY);
  const volumeTrendPct = lastWeek > 0
    ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    : 0;

  if (strained.length >= 2) reasons.push('persistent-strain');
  if (sustainedDays >= 3) reasons.push('sustained-body-load');
  if (lastWeek > 0 && volumeTrendPct >= DELOAD_SPIKE_PCT) reasons.push('volume-spike');

  let level: DeloadLevel = 'none';
  if (reasons.length >= 3 || (strained.length >= 4 && sustainedDays >= 3)) level = 'urgent';
  else if (reasons.length === 2) level = 'advised';
  else if (reasons.length === 1) level = 'watch';

  return { level, strained, sustainedDays, volumeTrendPct, reasons };
}

/** Um wie viel die Sätze gekürzt werden — je dringlicher, desto stärker. */
export function deloadFactor(level: DeloadLevel): number {
  if (level === 'urgent') return 0.4;
  if (level === 'advised') return 0.6;
  return 1;
}

/**
 * Leichtere Variante für die belasteten Muskeln: gleiche Bewegungen,
 * weniger Sätze. Basis ist der zuletzt tatsächlich geleistete Umfang —
 * so bleibt der Vorschlag an der realen Gewohnheit statt an einer Norm.
 */
export function lighterSession(
  entries: MuscleLoadEntry[], signal: DeloadSignal, now = Date.now(),
): LighterSession[] {
  const factor = deloadFactor(signal.level);
  if (factor >= 1 || signal.strained.length === 0) return [];

  const loads = calculateMuscleLoads(entries, now);
  return signal.strained.map(muscleId => {
    const recent = entries
      .filter(entry => entry.muscleId === muscleId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const baseSets = recent?.sets ?? 3;
    const reps = recent?.reps ?? 10;
    return {
      muscleId,
      sets: Math.max(1, Math.round(baseSets * factor)),
      reps,
      load: loads[muscleId],
    };
  });
}
