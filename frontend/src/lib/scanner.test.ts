import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeImageLocally, analyzeTextLocally, simulateVisionScan } from './scanner';

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
});
