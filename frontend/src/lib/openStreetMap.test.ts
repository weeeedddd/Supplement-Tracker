import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  freeLocationSearchAvailable,
  requestOpenStreetMapStores,
} from './openStreetMap';
import type { NearbyStoresRequest } from './integrations';

const baseRequest: NearbyStoresRequest = {
  location_consent: true,
  country: 'DE',
  budget: 40,
  currency: 'EUR',
  radius_meters: 5000,
  max_results: 5,
  language_code: 'de',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function berlinFeature(country = 'de') {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.4132, 52.5219] },
      properties: { address: { country_code: country } },
    }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('free OpenStreetMap location search', () => {
  it('is available in a secure browser without an account or paid API key', () => {
    vi.stubGlobal('window', { isSecureContext: true, location: { protocol: 'https:' } });
    vi.stubGlobal('fetch', vi.fn());

    expect(freeLocationSearchAvailable()).toBe(true);

    vi.stubGlobal('window', { isSecureContext: false, location: { protocol: 'http:' } });
    expect(freeLocationSearchAvailable()).toBe(false);
  });

  it('geocodes the selected country and returns only verified nearby shops', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(berlinFeature()))
      .mockResolvedValueOnce(jsonResponse({
        elements: [
          {
            type: 'node',
            id: 100,
            lat: 52.524,
            lon: 13.417,
            tags: { name: 'Farther Market', shop: 'supermarket' },
          },
          {
            type: 'way',
            id: 200,
            center: { lat: 52.522, lon: 13.4134 },
            tags: {
              name: 'Protein Shop',
              shop: 'nutrition_supplements',
              'addr:street': 'Alexanderstraße',
              'addr:housenumber': '2',
              'addr:postcode': '10178',
              'addr:city': 'Berlin',
            },
          },
          { type: 'node', id: 300, lat: 99, lon: 13, tags: { name: 'Invalid' } },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestOpenStreetMapStores({
      ...baseRequest,
      address: 'Alexanderplatz 1, Berlin',
    });

    const geocodeUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(geocodeUrl.hostname).toBe('nominatim.openstreetmap.org');
    expect(geocodeUrl.searchParams.get('countrycodes')).toBe('de');
    expect(geocodeUrl.searchParams.get('addressdetails')).toBe('1');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ referrerPolicy: 'origin' });

    const overpassRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const query = String(overpassRequest.body);
    expect(query).toContain('nutrition_supplements');
    expect(query).not.toContain('Alexanderplatz');
    expect(query).not.toContain('budget');

    expect(result.provider).toBe('openstreetmap');
    expect(result.location_source).toBe('address');
    expect(result.results.map((store) => store.name)).toEqual(['Protein Shop', 'Farther Market']);
    expect(result.results[0]).toMatchObject({
      provider: 'openstreetmap',
      provider_id: 'way/200',
      maps_uri: 'https://www.openstreetmap.org/way/200',
      formatted_address: 'Alexanderstraße 2, 10178 Berlin',
    });
    expect(result.budget_context.price_comparison_available).toBe(false);
    expect(result.notice.toLowerCase()).toContain('prices');
  });

  it('uses current coordinates without sending an address to geocoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      elements: [{
        type: 'node',
        id: 42,
        lat: 41.998,
        lon: 21.425,
        tags: { name: 'Skopje Pharmacy', amenity: 'pharmacy' },
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestOpenStreetMapStores({
      ...baseRequest,
      country: 'MK',
      currency: 'MKD',
      coordinates: { latitude: 41.9981, longitude: 21.4251 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass.private.coffee');
    expect(result.location_source).toBe('coordinates');
    expect(result.results[0].primary_type).toBe('pharmacy');
    expect(result.budget_context.currency).toBe('MKD');
  });

  it('rejects invalid current coordinates before making any provider request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestOpenStreetMapStores({
      ...baseRequest,
      coordinates: { latitude: 120, longitude: 13 },
    })).rejects.toThrow('selected location is invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains temporary fair-use throttling without inventing store data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 429)));

    await expect(requestOpenStreetMapStores({
      ...baseRequest,
      coordinates: { latitude: 52.52, longitude: 13.405 },
    })).rejects.toThrow('location service is busy');
  });

  it('switches to the second free provider when the first one is overloaded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({
        elements: [{
          type: 'node',
          id: 51,
          lat: 52.5201,
          lon: 13.4051,
          tags: { name: 'Fallback Market', shop: 'supermarket' },
        }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestOpenStreetMapStores({
      ...baseRequest,
      coordinates: { latitude: 52.52, longitude: 13.405 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass.private.coffee');
    expect(String(fetchMock.mock.calls[1][0])).toContain('overpass-api.de');
    expect(result.results[0].name).toBe('Fallback Market');
  });
});
