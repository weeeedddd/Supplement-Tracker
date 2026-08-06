import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeImageLocally, simulateVisionScan } from './scanner';

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
});
