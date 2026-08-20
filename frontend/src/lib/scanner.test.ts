import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeImageLocally, analyzeTextLocally, macrosFromOFF, simulateVisionScan } from './scanner';

describe('image scanning failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not turn an unrecognized image into a canned food detection', () => {
    expect(simulateVisionScan('data:image/jpeg;base64,not-a-real-meal')).toBeNull();
  });

  it('returns an explicit null result when no image analyzer can identify food', async () => {
    vi.stubGlobal('window', {});

    await expect(analyzeImageLocally('data:image/jpeg;base64,unknown', '')).resolves.toBeNull();
  });

  it('does not convert a text hint into a successful image detection', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(analyzeImageLocally('data:image/jpeg;base64,unknown', 'pizza')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps known text estimates deterministic and rejects unknown defaults', async () => {
    await expect(analyzeTextLocally('pizza')).resolves.toEqual(await analyzeTextLocally('pizza'));
    await expect(analyzeTextLocally('unrecognized meal description')).resolves.toBeNull();
  });

  it('adds explicitly quantified reference ingredients instead of returning one canned meal', async () => {
    const result = await analyzeTextLocally('250 g skyr with 100 g berries');

    expect(result?.macros).toEqual({ kcal: 208, prot: 28.5, carb: 19, fat: 1, sug: 16 });
    expect(result?.details).toMatchObject({ source: 'local-reference', servingGrams: 350, components: 2 });
  });

  it('matches short aliases as whole words and avoids false egg matches', async () => {
    await expect(analyzeTextLocally('protein')).resolves.toBeNull();
    expect((await analyzeTextLocally('2 eggs'))?.macros.prot).toBeCloseTo(15.1, 1);
    expect((await analyzeTextLocally('protein shake'))?.macros.kcal).toBe(180);
  });

  it('uses the selected serving and preserves decimal database nutrients', () => {
    const parsed = macrosFromOFF({
      serving_quantity: 30,
      nutriments: {
        'energy-kcal_100g': 380,
        proteins_100g: 82.4,
        carbohydrates_100g: 7.2,
        fat_100g: 4.1,
        sugars_100g: 3.8,
        fiber_100g: 2,
        'saturated-fat_100g': 1.2,
        sodium_100g: .18,
      },
    }, null);

    expect(parsed).toMatchObject({
      grams: 30,
      macros: { kcal: 114, prot: 24.7, carb: 2.2, fat: 1.2, sug: 1.1 },
      details: { fiber: .6, saturatedFat: .4, sodiumMg: 54 },
    });
  });
});
