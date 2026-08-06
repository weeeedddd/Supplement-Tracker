import { describe, expect, it } from 'vitest';

import { dateKey, prevKey } from './storage';

describe('local calendar day keys', () => {
  it('uses the local date when UTC is still on the previous day', () => {
    const afterLocalMidnight = new Date(2031, 0, 15, 0, 30);

    expect(dateKey(afterLocalMidnight)).toBe('2031-01-15');
  });

  it('calculates yesterday from the same local-calendar instant', () => {
    const afterLocalMidnight = new Date(2031, 0, 15, 0, 30);

    expect(prevKey(afterLocalMidnight)).toBe('2031-01-14');
  });
});
