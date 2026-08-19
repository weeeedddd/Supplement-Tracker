// ═══════════════════════════════════════════════════════════════════
//  ◈ SCAN-GENAUIGKEIT
//
//  Der Scanner unterscheidet bereits Datenbank von Schätzung. Was fehlt,
//  ist die zweite Dimension: die Portionsgrösse. Ein Barcode-Treffer mit
//  angenommenen 100 g ist deutlich unsicherer als derselbe Treffer mit
//  angegebener Menge — bisher sahen beide gleich aus.
//
//  Diese Datei leitet daraus einen abgestuften Wert ab und rechnet eine
//  korrigierte Portion um. Sie erfindet keine Sicherheit: schwache
//  Quellen bleiben schwach, auch wenn die Menge stimmt.
// ═══════════════════════════════════════════════════════════════════
import type { Macros } from './engine';
import type { ScanDetails, ServingBasis } from './scanner';

export type AccuracyTier = 'verified' | 'likely' | 'rough' | 'guess';

/** Grundwert je Quelle — Reihenfolge entspricht der Kaskade im Scanner. */
const SOURCE_BASE: Record<ScanDetails['source'], number> = {
  'barcode-database': 88,
  'local-reference': 52,
  'legacy-estimate': 24,
};

/** Die Portionsgrösse ist die grösste Einzelfehlerquelle. */
const BASIS_ADJUSTMENT: Record<ServingBasis, number> = {
  stated: 6,
  manufacturer: 0,
  assumed: -16,
};

/** Eine bestätigte Menge beseitigt diese Fehlerquelle. */
const CONFIRMED_BONUS = 18;

export function accuracyScore(details?: ScanDetails): number {
  if (!details) return 0;
  const base = SOURCE_BASE[details.source] ?? SOURCE_BASE['legacy-estimate'];
  const basis = BASIS_ADJUSTMENT[details.servingBasis ?? 'assumed'];
  const confirmed = details.servingConfirmed ? CONFIRMED_BONUS : 0;
  return Math.max(5, Math.min(99, Math.round(base + basis + confirmed)));
}

export function accuracyTier(score: number): AccuracyTier {
  if (score >= 85) return 'verified';
  if (score >= 62) return 'likely';
  if (score >= 35) return 'rough';
  return 'guess';
}

/** Dieselbe Semantik-Rampe wie die Muskel-Heatmap. */
export function accuracyColor(score: number): string {
  const tier = accuracyTier(score);
  if (tier === 'verified') return '#83d8b2';
  if (tier === 'likely') return '#b7d68f';
  if (tier === 'rough') return '#e9c36a';
  return '#ef6675';
}

export interface RescaledScan { macros: Macros; details: ScanDetails; }

/**
 * Portion korrigieren: Makros linear umrechnen und die Menge als
 * bestätigt markieren. Die Quelle bleibt unverändert — eine korrigierte
 * Menge macht aus einer Schätzung keine Messung.
 */
export function rescaleServing(
  macros: Macros, details: ScanDetails, newGrams: number,
): RescaledScan {
  const from = details.servingGrams && details.servingGrams > 0 ? details.servingGrams : 100;
  const grams = Math.max(1, Math.min(5_000, Math.round(newGrams)));
  const factor = grams / from;
  const scale = (value: number) => Math.round((value || 0) * factor * 10) / 10;
  return {
    macros: {
      kcal: Math.round((macros.kcal || 0) * factor),
      prot: scale(macros.prot),
      carb: scale(macros.carb),
      fat: scale(macros.fat),
      sug: scale(macros.sug),
    },
    details: {
      ...details,
      servingGrams: grams,
      servingBasis: 'stated',
      servingConfirmed: true,
      fiber: details.fiber === undefined ? undefined : scale(details.fiber),
      saturatedFat: details.saturatedFat === undefined ? undefined : scale(details.saturatedFat),
      sodiumMg: details.sodiumMg === undefined ? undefined : Math.round(details.sodiumMg * factor),
    },
  };
}
