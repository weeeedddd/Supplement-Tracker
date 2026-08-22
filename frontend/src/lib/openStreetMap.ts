import type { NearbyStoresEnvelope, NearbyStoresRequest, StoreLocation } from './integrations';
import { timeoutSignal } from './storage';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_INTERPRETER_URLS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
] as const;
const MAX_RESPONSE_BYTES = 768 * 1024;
const GEOCODE_CACHE_MS = 15 * 60 * 1000;
const GEOCODE_INTERVAL_MS = 1100;
const MAX_GEOCODE_CACHE_ENTRIES = 40;

type Coordinates = { latitude: number; longitude: number };
type GeocodeCacheEntry = { coordinates: Coordinates; expiresAt: number };

const geocodeCache = new Map<string, GeocodeCacheEntry>();
let lastGeocodeAt = 0;
let geocodeQueue: Promise<void> = Promise.resolve();

export function freeLocationSearchAvailable(): boolean {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  return window.isSecureContext === true || window.location.protocol === 'https:';
}

async function readProviderResponse(
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      referrerPolicy: 'origin',
      signal: timeoutSignal(15_000),
    });
  } catch {
    throw new Error('The free location service could not be reached. Please try again.');
  }

  if (response.status === 429) {
    throw new Error('The free location service is busy. Please wait a moment and try again.');
  }
  if (!response.ok) {
    throw new Error('The free location service is temporarily unavailable.');
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('The map response was too large. Try a smaller search radius.');
  }

  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('The map response was too large. Try a smaller search radius.');
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid response');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('The free location service returned an unusable response.');
  }
}

async function geocodeAddress(request: NearbyStoresRequest): Promise<Coordinates> {
  const normalizedAddress = request.address?.trim() ?? '';
  const cacheKey = `${request.country}:${request.language_code ?? 'en'}:${normalizedAddress.toLocaleLowerCase()}`;

  let releaseQueue!: () => void;
  const precedingRequest = geocodeQueue;
  geocodeQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await precedingRequest;

  try {
    const cached = geocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.coordinates;

    const waitFor = Math.max(0, GEOCODE_INTERVAL_MS - (Date.now() - lastGeocodeAt));
    if (waitFor > 0) await new Promise<void>((resolve) => { setTimeout(resolve, waitFor); });
    lastGeocodeAt = Date.now();

    const query = new URLSearchParams({
      format: 'geojson',
      q: normalizedAddress,
      countrycodes: request.country.toLowerCase(),
      addressdetails: '1',
      limit: '1',
      'accept-language': request.language_code ?? 'en',
    });
    const response = await readProviderResponse(`${NOMINATIM_SEARCH_URL}?${query}`, { method: 'GET' });
    const features = response.features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('This address could not be found in the selected country.');
    }

    const feature = features[0] as Record<string, unknown>;
    const geometry = feature.geometry as Record<string, unknown> | undefined;
    const properties = feature.properties as Record<string, unknown> | undefined;
    const address = properties?.address as Record<string, unknown> | undefined;
    const countryCode = String(address?.country_code ?? '').toUpperCase();
    const point = geometry?.coordinates;
    if (countryCode !== request.country || !Array.isArray(point) || point.length < 2) {
      throw new Error('This address could not be verified in the selected country.');
    }

    const coordinates = { latitude: Number(point[1]), longitude: Number(point[0]) };
    if (!validCoordinates(coordinates)) {
      throw new Error('The free location service returned invalid coordinates.');
    }

    if (geocodeCache.size >= MAX_GEOCODE_CACHE_ENTRIES) {
      const oldest = geocodeCache.keys().next().value;
      if (oldest !== undefined) geocodeCache.delete(oldest);
    }
    geocodeCache.set(cacheKey, { coordinates, expiresAt: Date.now() + GEOCODE_CACHE_MS });
    return coordinates;
  } finally {
    releaseQueue();
  }
}

function validCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && value.longitude >= -180
    && value.longitude <= 180;
}

function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const halfChord = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord)));
}

function storeFromElement(element: unknown, center: Coordinates): StoreLocation | null {
  if (!element || typeof element !== 'object') return null;
  const place = element as Record<string, unknown>;
  const tags = place.tags as Record<string, unknown> | undefined;
  const name = String(tags?.name ?? tags?.brand ?? '').trim();
  const type = String(place.type ?? '');
  const id = Number(place.id);
  const point = place.center && typeof place.center === 'object'
    ? place.center as Record<string, unknown>
    : place;
  const coordinates = { latitude: Number(point.lat), longitude: Number(point.lon) };

  if (!name || !Number.isSafeInteger(id) || id <= 0 || !['node', 'way', 'relation'].includes(type) || !validCoordinates(coordinates)) {
    return null;
  }

  const street = [tags?.['addr:street'], tags?.['addr:housenumber']].filter(Boolean).join(' ');
  const town = [tags?.['addr:postcode'], tags?.['addr:city']].filter(Boolean).join(' ');
  const formattedAddress = [street, town].filter(Boolean).join(', ');

  return {
    provider_id: `${type}/${id}`,
    name: name.slice(0, 160),
    formatted_address: formattedAddress.slice(0, 300),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    distance_meters: distanceMeters(center, coordinates),
    maps_uri: `https://www.openstreetmap.org/${type}/${id}`,
    primary_type: String(tags?.shop ?? tags?.amenity ?? 'store').slice(0, 80),
    provider: 'openstreetmap',
  };
}

export async function requestOpenStreetMapStores(
  request: NearbyStoresRequest,
): Promise<NearbyStoresEnvelope> {
  if (request.location_consent !== true) {
    throw new Error('Location consent is required before searching.');
  }

  const center = request.coordinates ?? await geocodeAddress(request);
  if (!validCoordinates(center)) throw new Error('The selected location is invalid.');

  const radius = Math.max(500, Math.min(25_000, Math.round(request.radius_meters ?? 5_000)));
  const maxResults = Math.max(1, Math.min(20, Math.round(request.max_results ?? 10)));
  const around = `${radius},${center.latitude.toFixed(6)},${center.longitude.toFixed(6)}`;
  const categories = 'supermarket|convenience|greengrocer|health_food|nutrition_supplements|sports_nutrition|organic|chemist';
  const query = `[out:json][timeout:10];(nwr["shop"~"^(${categories})$"]["name"](around:${around});nwr["amenity"="pharmacy"]["name"](around:${around}););out center ${Math.min(maxResults * 8, 100)};`;

  let response: Record<string, unknown> | undefined;
  let lastError: unknown;
  for (const endpoint of OVERPASS_INTERPRETER_URLS) {
    try {
      const candidate = await readProviderResponse(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
      });
      if (!Array.isArray(candidate.elements)) {
        throw new Error('The free location service returned an invalid store list.');
      }
      if (candidate.elements.length === 0 && typeof candidate.remark === 'string' && candidate.remark.trim()) {
        throw new Error('The free location service is busy. Please wait a moment and try again.');
      }
      response = candidate;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!response || !Array.isArray(response.elements)) {
    throw lastError instanceof Error
      ? lastError
      : new Error('The free location service is temporarily unavailable.');
  }

  const results = response.elements
    .map((element) => storeFromElement(element, center))
    .filter((store): store is StoreLocation => store !== null && store.distance_meters <= radius)
    .sort((left, right) => left.distance_meters - right.distance_meters)
    .slice(0, maxResults);

  return {
    provider: 'openstreetmap',
    fetched_at: new Date().toISOString(),
    location_source: request.coordinates ? 'coordinates' : 'address',
    results,
    budget_context: {
      amount: request.budget,
      currency: request.currency,
      price_comparison_available: false,
    },
    notice: 'OpenStreetMap data identifies nearby locations only. Live prices, stock, and opening times are not verified.',
  };
}
