import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkBackendCapabilities,
  checkCurrentBackendCapabilities,
  parseBackendCapabilities,
} from './backend';

function storageWithBackend(url: string): Storage {
  const values = new Map<string, string>([['sg_backend_url', JSON.stringify(url)]]);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('backend capability status', () => {
  it('enables only capabilities explicitly confirmed by the server', () => {
    expect(parseBackendCapabilities({
      ai: { available: true },
      stores: {
        available: true,
        address_search_available: false,
      },
    })).toEqual({
      configured: true,
      reachable: true,
      ai: true,
      nearbyStores: true,
      addressSearch: false,
    });
  });

  it('keeps malformed or incomplete provider claims disabled', () => {
    expect(parseBackendCapabilities({ ai: { available: 'yes' }, stores: null })).toEqual({
      configured: true,
      reachable: true,
      ai: false,
      nearbyStores: false,
      addressSearch: false,
    });
  });

  it('requires both a reachable health route and an explicit capability response', async () => {
    vi.stubGlobal('localStorage', storageWithBackend('https://api.example.test'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ai: { available: true },
        stores: { available: false, address_search_available: false },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkBackendCapabilities()).resolves.toEqual({
      configured: true,
      reachable: true,
      ai: true,
      nearbyStores: false,
      addressSearch: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not treat a saved but unreachable URL as an active provider', async () => {
    vi.stubGlobal('localStorage', storageWithBackend('https://offline.example.test'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(checkBackendCapabilities()).resolves.toEqual({
      configured: true,
      reachable: false,
      ai: false,
      nearbyStores: false,
      addressSearch: false,
    });
  });

  it('keeps the server reachable but providers disabled for an invalid status body', async () => {
    vi.stubGlobal('localStorage', storageWithBackend('https://api.example.test'));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 })));

    await expect(checkBackendCapabilities()).resolves.toEqual({
      configured: true,
      reachable: true,
      ai: false,
      nearbyStores: false,
      addressSearch: false,
    });
  });

  it('ignores an out-of-order result after the configured URL changes', async () => {
    vi.stubGlobal('localStorage', storageWithBackend('https://a.example.test'));
    let releaseFirstHealth: ((response: Response) => void) | undefined;
    const firstHealth = new Promise<Response>((resolve) => { releaseFirstHealth = resolve; });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://a.example.test/api/health') return firstHealth;
      if (url === 'https://a.example.test/api/v1/integrations/status') {
        return Promise.resolve(new Response(JSON.stringify({
          ai: { available: true },
          stores: { available: false, address_search_available: false },
        }), { status: 200 }));
      }
      if (url === 'https://b.example.test/api/health') {
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        ai: { available: false },
        stores: { available: false, address_search_available: false },
      }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const staleCheck = checkCurrentBackendCapabilities();
    localStorage.setItem('sg_backend_url', JSON.stringify('https://b.example.test'));
    const currentCheck = checkCurrentBackendCapabilities();

    await expect(currentCheck).resolves.toEqual({
      configured: true,
      reachable: true,
      ai: false,
      nearbyStores: false,
      addressSearch: false,
    });
    releaseFirstHealth?.(new Response('{"ok":true}', { status: 200 }));
    await expect(staleCheck).resolves.toBeNull();
  });
});
