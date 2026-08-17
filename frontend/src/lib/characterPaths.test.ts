import { describe, expect, it } from 'vitest';

import type { Workout } from './fitness';
import {
  CHARACTER_PATHS,
  filterCharacterWorkouts,
  getCharacterPath,
} from './characterPaths';

const workout = (id: string, source: Workout['source'], inspirationProfile?: Workout['inspirationProfile']): Workout => ({
  id,
  name: id,
  kind: 'fullbody',
  focus: 'test',
  exercises: [{ name: 'Squat', sets: 3, reps: '8', weight: 'bodyweight', rest: 60 }],
  icon: '',
  source,
  inspirationProfile,
});

describe('character paths', () => {
  it('provides a complete exclusive definition for every inspiration profile', () => {
    expect(Object.keys(CHARACTER_PATHS)).toEqual(['toji', 'goku', 'tanjiro']);
    for (const path of Object.values(CHARACTER_PATHS)) {
      expect(path.tags.length).toBeGreaterThanOrEqual(3);
      expect(path.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(new Set(path.recommendations.map(item => item.id)).size).toBe(path.recommendations.length);
    }
    expect(getCharacterPath('toji')?.recommendations.map(item => item.id)).toEqual(
      expect.arrayContaining(['protein', 'kreatin', 'eaa', 'zinc', 'magnesium']),
    );
  });

  it('removes presets and other character plans from an exclusive path', () => {
    const result = filterCharacterWorkouts([
      workout('w-full', 'preset'),
      workout('starter-toji-1', 'generated', 'toji'),
      workout('starter-goku-1', 'generated', 'goku'),
      workout('starter-1', 'generated'),
      workout('manual-1', 'manual'),
    ], 'toji');

    expect(result.map(item => item.id)).toEqual(['starter-toji-1', 'starter-1']);
  });
});
