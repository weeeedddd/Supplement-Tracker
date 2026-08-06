import { describe, expect, it } from 'vitest';
import { collectExportableLocalData, resolveInitialScreen } from './localMode';

describe('offline-first app bootstrap', () => {
  it('starts onboarding when no local profile exists', () => {
    expect(resolveInitialScreen(() => null)).toBe('onboard');
  });

  it('opens the dashboard for an existing local profile without requiring a fake session', () => {
    expect(resolveInitialScreen((key) => key === 'profile' ? { firstName: 'Mina' } : null)).toBe('dashboard');
  });
});

describe('local export boundary', () => {
  it('exports app data but excludes obsolete pseudo-auth material', () => {
    const storage = new Map<string, string>([
      ['sg_profile', JSON.stringify({ firstName: 'Mina' })],
      ['sg_food_2026-08-05', JSON.stringify([{ name: 'Tofu' }])],
      ['sg_auth', JSON.stringify({ email: 'private@example.test', pw: 'not-a-hash' })],
      ['sg_session', JSON.stringify({ email: 'private@example.test' })],
      ['unrelated', 'leave-me-alone'],
    ]);

    const result = collectExportableLocalData({
      length: storage.size,
      key: (index) => [...storage.keys()][index] ?? null,
      getItem: (key) => storage.get(key) ?? null,
    });

    expect(result.data).toEqual({
      profile: { firstName: 'Mina' },
      'food_2026-08-05': [{ name: 'Tofu' }],
    });
    expect(result.excludedLegacyKeys).toEqual(['auth', 'session']);
  });
});
