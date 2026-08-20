import { describe, expect, it } from 'vitest';

import { accuracyColor, accuracyScore, accuracyTier, rescaleServing } from './scanAccuracy';
import type { ScanDetails } from './scanner';
import { compareNutritionLabel } from './scanner';

const details = (over: Partial<ScanDetails> = {}): ScanDetails => ({
  source: 'barcode-database', confidence: 'database', servingGrams: 100, ...over,
});

describe('nutrition label verification', () => {
  const scan = {
    name: 'Protein yoghurt (200 g)',
    macros: { kcal: 200, prot: 20, carb: 16, fat: 5, sug: 7 },
    details: details({ servingGrams: 200 }),
  };

  it('matches per-100g OCR values after normalizing the serving', () => {
    const verification = compareNutritionLabel(scan, {
      found: true, basis: 'per100g', confidence: 91,
      values: { kcal: 100, prot: 10, carb: 8, fat: 2.5, sug: 3.5 },
    });
    expect(verification.state).toBe('matched');
    expect(verification.comparedFields).toBe(5);
    expect(verification.averageDifferencePct).toBe(0);
  });

  it('makes a material database/label disagreement visible', () => {
    const verification = compareNutritionLabel(scan, {
      found: true, basis: 'per100g', confidence: 88,
      values: { kcal: 180, prot: 4, carb: 24, fat: 9, sug: 15 },
    });
    expect(verification.state).toBe('mismatch');
    expect(verification.averageDifferencePct).toBeGreaterThan(15);
    expect(accuracyScore({ ...scan.details, labelVerification: verification }))
      .toBeLessThan(accuracyScore(scan.details));
  });
});

describe('scan accuracy', () => {
  it('separates a barcode hit with a stated serving from one with an assumed serving', () => {
    const stated = accuracyScore(details({ servingBasis: 'stated' }));
    const assumed = accuracyScore(details({ servingBasis: 'assumed' }));

    // Genau der Fall, den die binäre Einstufung vorher gleich behandelt hat.
    expect(stated).toBeGreaterThan(assumed);
    expect(accuracyTier(stated)).toBe('verified');
    expect(accuracyTier(assumed)).not.toBe('verified');
  });

  it('ranks the cascade in the order of its own reliability', () => {
    const barcode = accuracyScore(details({ source: 'barcode-database', servingBasis: 'manufacturer' }));
    const reference = accuracyScore(details({ source: 'local-reference', servingBasis: 'manufacturer' }));
    const estimate = accuracyScore(details({ source: 'legacy-estimate', servingBasis: 'manufacturer' }));

    expect(barcode).toBeGreaterThan(reference);
    expect(reference).toBeGreaterThan(estimate);
  });

  it('never claims certainty it does not have', () => {
    expect(accuracyScore(undefined)).toBe(0);
    expect(accuracyScore(details({ source: 'legacy-estimate', servingBasis: 'assumed' })))
      .toBeLessThan(35);
    expect(accuracyTier(accuracyScore(details({ source: 'legacy-estimate', servingBasis: 'assumed' }))))
      .toBe('guess');
  });

  it('caps the score below certainty even at its best', () => {
    const best = accuracyScore(details({ servingBasis: 'stated', servingConfirmed: true }));

    expect(best).toBeLessThanOrEqual(99);
  });

  it('lifts a weak scan without turning it into a measurement', () => {
    const weak = details({ source: 'legacy-estimate', servingBasis: 'assumed' });
    const confirmed = { ...weak, servingBasis: 'stated' as const, servingConfirmed: true };

    expect(accuracyScore(confirmed)).toBeGreaterThan(accuracyScore(weak));
    // Die Quelle bleibt schwach — kein Sprung in "verifiziert".
    expect(accuracyTier(accuracyScore(confirmed))).not.toBe('verified');
  });

  it('gives every tier its own colour', () => {
    const colours = new Set([90, 70, 45, 20].map(score => accuracyColor(score)));
    expect(colours.size).toBe(4);
  });
});

describe('serving correction', () => {
  const macros = { kcal: 200, prot: 10, carb: 20, fat: 5, sug: 3 };

  it('scales the macros linearly and records the new amount', () => {
    const result = rescaleServing(macros, details({ servingGrams: 100 }), 250);

    expect(result.macros.kcal).toBe(500);
    expect(result.macros.prot).toBe(25);
    expect(result.details.servingGrams).toBe(250);
    expect(result.details.servingBasis).toBe('stated');
    expect(result.details.servingConfirmed).toBe(true);
  });

  it('scales the extra nutrients along with the macros', () => {
    const result = rescaleServing(macros, details({ servingGrams: 100, fiber: 4, sodiumMg: 300 }), 50);

    expect(result.details.fiber).toBe(2);
    expect(result.details.sodiumMg).toBe(150);
  });

  it('leaves absent nutrients absent instead of inventing zeros', () => {
    const result = rescaleServing(macros, details({ servingGrams: 100 }), 200);

    expect(result.details.fiber).toBeUndefined();
    expect(result.details.sodiumMg).toBeUndefined();
  });

  it('keeps the correction inside sane bounds', () => {
    expect(rescaleServing(macros, details(), 0).details.servingGrams).toBe(1);
    expect(rescaleServing(macros, details(), 99_999).details.servingGrams).toBe(5_000);
  });

  it('falls back to 100 g when the original amount is unknown', () => {
    const result = rescaleServing(macros, details({ servingGrams: undefined }), 200);

    expect(result.macros.kcal).toBe(400);
  });
});
