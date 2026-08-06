import { describe, expect, it } from 'vitest';
import { SAFE_SUPPLEMENT_CATALOG, sanitizeRoutineSelection } from './supplements';

describe('supplement routine safety boundary', () => {
  it('never publishes autonomous dose fields', () => {
    for (const item of SAFE_SUPPLEMENT_CATALOG) {
      expect(item).not.toHaveProperty('dose');
      expect(item).not.toHaveProperty('dosage');
      expect(item.guidance).toMatch(/label|clinician/i);
    }
  });

  it('keeps only known, unique user-selected items', () => {
    expect(sanitizeRoutineSelection(['kreatin', 'unknown', 'kreatin', 'protein'])).toEqual([
      'kreatin',
      'protein',
    ]);
  });
});
