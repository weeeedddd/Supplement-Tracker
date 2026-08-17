import { describe, expect, it } from 'vitest';

import type { Macros } from './engine';
import { assessFoodForGoal } from './nutritionScoring';
import type { ScanResult } from './scanner';

const targets: Macros = { kcal: 2_000, prot: 140, carb: 220, fat: 65, sug: 50 };
const empty: Macros = { kcal: 0, prot: 0, carb: 0, fat: 0, sug: 0 };

const skyr: ScanResult = {
  name: 'Skyr bowl',
  macros: { kcal: 260, prot: 35, carb: 28, fat: 2, sug: 16 },
  details: { source: 'local-reference', confidence: 'estimated', fiber: 4 },
};

const soda: ScanResult = {
  name: 'Soda',
  macros: { kcal: 139, prot: 0, carb: 35, fat: 0, sug: 35 },
  details: { source: 'barcode-database', confidence: 'database' },
};

describe('goal-adaptive scan assessment', () => {
  it('rates protein-dense food above a high-sugar drink for a fat-loss target', () => {
    const proteinScore = assessFoodForGoal(skyr, targets, empty, 'fat_loss');
    const sodaScore = assessFoodForGoal(soda, targets, empty, 'fat_loss');

    expect(proteinScore.score).toBeGreaterThan(sodaScore.score + 25);
    expect(proteinScore.verdict).toContain('muscle retention');
    expect(sodaScore.verdict).toContain('sugar');
  });

  it('uses remaining daily energy and lowers the rating when a serving overflows it', () => {
    const almostFull: Macros = { kcal: 1_900, prot: 130, carb: 200, fat: 60, sug: 40 };
    const early = assessFoodForGoal(skyr, targets, empty, 'build_muscle');
    const late = assessFoodForGoal(skyr, targets, almostFull, 'build_muscle');

    expect(late.score).toBeLessThan(early.score);
    expect(late.verdict).toContain('remaining 100 kcal');
  });

  it('returns a bounded score and target-specific label', () => {
    const assessment = assessFoodForGoal(skyr, targets, empty, 'build_muscle', 'de');

    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
    expect(assessment.goalLabel).toContain('Muskelaufbau');
  });
});
