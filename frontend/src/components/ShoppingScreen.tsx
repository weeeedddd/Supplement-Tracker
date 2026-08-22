import { useState, type FormEvent } from 'react';

import {
  requestNearbyStores,
  type NearbyStoreKind,
  type NearbyStoresEnvelope,
} from '../lib/integrations';
import { getBackendUrl } from '../lib/backend';
import { S } from '../lib/storage';
import { lang } from '../lib/i18n';
import { SystemIcon } from './SystemIcon';

type LocationChoice =
  | { kind: 'address' }
  | { kind: 'coordinates'; latitude: number; longitude: number };

const copy = (de: string, en: string) => lang === 'de' ? de : en;
const COUNTRY_LABELS: Record<string, { de: string; en: string }> = {
  DE: { de: 'Deutschland', en: 'Germany' },
  AT: { de: 'Österreich', en: 'Austria' },
  CH: { de: 'Schweiz', en: 'Switzerland' },
  NL: { de: 'Niederlande', en: 'Netherlands' },
  BE: { de: 'Belgien', en: 'Belgium' },
  FR: { de: 'Frankreich', en: 'France' },
};

function formatDistance(meters: number): string {
  return meters < 1_000 ? `${Math.max(0, Math.round(meters))} m` : `${(meters / 1_000).toFixed(1)} km`;
}

function safeMapsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

interface ShoppingScreenProps {
  providerAvailable?: boolean;
  addressSearchAvailable?: boolean;
}

export function ShoppingScreen({
  providerAvailable = false,
  addressSearchAvailable = false,
}: ShoppingScreenProps) {
  const [country, setCountry] = useState('DE');
  const [storeKind, setStoreKind] = useState<NearbyStoreKind>(
    () => S.get<string>('shopping_store_kind') === 'supplement' ? 'supplement' : 'grocery',
  );
  const [budget, setBudget] = useState('40');
  const [currency, setCurrency] = useState('EUR');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState('5000');
  const [location, setLocation] = useState<LocationChoice>({ kind: 'address' });
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<NearbyStoresEnvelope | null>(null);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const backendConfigured = Boolean(getBackendUrl());
  const currentLocationCanSearch = providerAvailable;
  const selectedLocationCanSearch = location.kind === 'coordinates'
    ? currentLocationCanSearch
    : providerAvailable && addressSearchAvailable;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus(copy('Dein Browser unterstützt die Standortfreigabe nicht. Nutze stattdessen eine Adresse.', 'Your browser does not support location sharing. Use an address instead.'));
      return;
    }
    setLocating(true);
    setStatus('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ kind: 'coordinates', latitude: coords.latitude, longitude: coords.longitude });
        setAddress('');
        setLocating(false);
        setStatus(copy('Standort für diese Suche übernommen. Er wird nicht lokal gespeichert.', 'Location accepted for this search. It is not stored locally.'));
      },
      () => {
        setLocation({ kind: 'address' });
        setLocating(false);
        setStatus(copy('Standort wurde nicht freigegeben. Du kannst eine Adresse eingeben.', 'Location was not shared. You can enter an address.'));
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setResult(null);

    const normalizedCountry = country.trim().toUpperCase();
    const normalizedCurrency = currency.trim().toUpperCase();
    const parsedBudget = Number(budget);
    const parsedRadius = Number(radius);

    if (!consent) {
      setStatus(copy('Bitte bestätige zuerst die einmalige Standortfreigabe für diese Suche.', 'Confirm the one-time location consent for this search first.'));
      return;
    }
    if (!providerAvailable) {
      setStatus(copy('Der Kartenanbieter ist serverseitig noch nicht freigegeben.', 'The maps provider is not enabled server-side yet.'));
      return;
    }
    if (location.kind === 'address' && !addressSearchAvailable) {
      setStatus(copy('Die Adresssuche ist nicht freigegeben. Nutze den aktuellen Standort oder ergänze den Geocoding-Zugang im Backend.', 'Address search is not enabled. Use your current location or configure geocoding on the backend.'));
      return;
    }
    if (!/^[A-Z]{2}$/.test(normalizedCountry) || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setStatus(copy('Prüfe Länder- und Währungscode. Erwartet werden z. B. DE und EUR.', 'Check the country and currency codes, for example DE and EUR.'));
      return;
    }
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0 || parsedBudget > 100_000) {
      setStatus(copy('Das Budget muss zwischen 1 und 100.000 liegen.', 'Budget must be between 1 and 100,000.'));
      return;
    }
    if (!Number.isInteger(parsedRadius) || parsedRadius < 500 || parsedRadius > 25_000) {
      setStatus(copy('Der Suchradius muss zwischen 500 m und 25 km liegen.', 'Search radius must be between 500 m and 25 km.'));
      return;
    }
    if (location.kind === 'address' && (address.trim().length < 5 || address.trim().length > 200)) {
      setStatus(copy('Gib eine vollständige Adresse oder mindestens Ort und Postleitzahl ein.', 'Enter a full address or at least a town and postal code.'));
      return;
    }

    setPending(true);
    setStatus(storeKind === 'supplement'
      ? copy('Apotheken, Drogerien und Sportgeschäfte werden über den konfigurierten Kartenanbieter gesucht …', 'Searching pharmacies, drugstores, and sports shops through the configured maps provider …')
      : copy('Supermärkte werden über den konfigurierten Kartenanbieter gesucht …', 'Searching supermarkets through the configured maps provider …'));
    try {
      const response = await requestNearbyStores({
        location_consent: true,
        country: normalizedCountry,
        store_kind: storeKind,
        budget: parsedBudget,
        currency: normalizedCurrency,
        radius_meters: parsedRadius,
        max_results: 10,
        language_code: lang === 'de' ? 'de' : 'en',
        ...(location.kind === 'coordinates'
          ? { coordinates: { latitude: location.latitude, longitude: location.longitude } }
          : { address: address.trim() }),
      });
      setResult(response);
      setStatus(response.results.length
        ? copy(`${response.results.length} Standorte gefunden.`, `${response.results.length} locations found.`)
        : copy('Keine passenden Standorte im Suchradius gefunden.', 'No matching locations found within the search radius.'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy('Die Standortsuche ist momentan nicht verfügbar.', 'Location search is currently unavailable.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="screen active system-screen">
      <section className="system-page" aria-labelledby="shopping-title">
        <header className="system-page-header">
          <span className="system-heading-mark"><SystemIcon name="store" /></span>
          <div>
            <h1 id="shopping-title">{copy('Einkaufsradar', 'Shopping radar')}</h1>
            <p>{copy('Finde echte Supermärkte in deiner Nähe. Budget und Standort gehen ausschließlich an den separaten Karten-Endpunkt – niemals an die KI.', 'Find real supermarkets nearby. Budget and location go only to the separate maps endpoint — never to AI.')}</p>
          </div>
        </header>

        <div className="system-notice" role="note">
          <SystemIcon name={providerAvailable ? 'shield' : 'warning'} />
          <div>
            <strong>{providerAvailable
              ? copy('Kartenanbieter freigegeben', 'Maps provider enabled')
              : backendConfigured
                ? copy('Kartenanbieter nicht freigegeben', 'Maps provider not enabled')
                : copy('Backend noch nicht verbunden', 'Backend not connected yet')}</strong>
            <span>{providerAvailable
              ? addressSearchAvailable
                ? copy('Adresse und Standort sind verfügbar. Angaben werden nur für die einzelne Suche verarbeitet und nie im KI-Kontext gespeichert.', 'Address and current-location search are available. Details are processed only for the individual search and never enter AI context.')
                : copy('Die Standortsuche ist verfügbar; für Adressen fehlt serverseitig noch Geocoding.', 'Current-location search is available; server-side geocoding is still missing for addresses.')
              : backendConfigured
                ? copy('Das Backend antwortet, hat Google Maps aber nicht serverseitig freigegeben. Die Suche bleibt deshalb gesperrt.', 'The backend responds but Google Maps is not enabled server-side, so search remains locked.')
                : copy('GitHub Pages kann keinen geheimen Karten-Schlüssel hosten. Hinterlege in den Einstellungen die URL eines sicheren CORELINE-Backends.', 'GitHub Pages cannot host a secret maps key. Add the URL of a secure CORELINE backend in settings.')}</span>
          </div>
        </div>

        <div className="shopping-layout">
          <form className="shopping-form" onSubmit={submit} noValidate>
            <div className="shopping-field-grid">
              <label className="system-field">
                {copy('Land', 'Country')}
                <select value={country} onChange={(event) => setCountry(event.target.value)}>
                  {Object.entries(COUNTRY_LABELS).map(([code, label]) => <option value={code} key={code}>{lang === 'de' ? label.de : label.en} ({code})</option>)}
                </select>
              </label>
              <label className="system-field">
                {copy('Geschäftsart', 'Shop type')}
                <select value={storeKind} onChange={(event) => setStoreKind(event.target.value as NearbyStoreKind)}>
                  <option value="grocery">{copy('Lebensmittel & Supermärkte', 'Groceries & supermarkets')}</option>
                  <option value="supplement">{copy('Supplements: Apotheke, Drogerie, Sport', 'Supplements: pharmacy, drugstore, sports')}</option>
                </select>
              </label>
              <label className="system-field">
                {copy('Suchradius', 'Search radius')}
                <select value={radius} onChange={(event) => setRadius(event.target.value)}>
                  <option value="2000">2 km</option>
                  <option value="5000">5 km</option>
                  <option value="10000">10 km</option>
                  <option value="25000">25 km</option>
                </select>
              </label>
              <label className="system-field">
                Budget
                <input type="number" inputMode="decimal" min="1" max="100000" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} />
              </label>
              <label className="system-field">
                {copy('Währung', 'Currency')}
                <input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label={copy('Dreistelliger Währungscode', 'Three-letter currency code')} />
              </label>
              <label className="system-field wide">
                {copy('Adresse oder Ort', 'Address or town')}
                <input
                  autoComplete="street-address"
                  maxLength={200}
                  value={address}
                  disabled={location.kind === 'coordinates'}
                  placeholder={copy('z. B. 10115 Berlin', 'e.g. 10115 Berlin')}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setLocation({ kind: 'address' });
                  }}
                />
              </label>
            </div>

            <div className="shopping-location-actions">
              <button className="system-button quiet" type="button" onClick={useCurrentLocation} disabled={locating || !currentLocationCanSearch}>
                <SystemIcon name="location" /> {locating ? copy('Standort wird gelesen …', 'Reading location …') : copy('Aktuellen Standort nutzen', 'Use current location')}
              </button>
              {location.kind === 'coordinates' && (
                <button className="system-button quiet" type="button" onClick={() => setLocation({ kind: 'address' })}>{copy('Adresse verwenden', 'Use address')}</button>
              )}
            </div>

            <label className="shopping-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{copy('Ich stimme zu, dass Standort oder Adresse einmalig an den konfigurierten Kartenanbieter gesendet werden, um Supermärkte zu finden. Die Angabe wird nicht im Profil gespeichert.', 'I consent to sending the location or address once to the configured maps provider to find supermarkets. It is not stored in the profile.')}</span>
            </label>

            <button className="system-primary-action" type="submit" disabled={pending || !selectedLocationCanSearch}>
              <SystemIcon name="search" /> {pending ? copy('Suche läuft', 'Searching') : copy('Supermärkte finden', 'Find supermarkets')}
            </button>
            {status && <p className="shopping-budget-note" role="status">{status}</p>}
          </form>

          <section className="shopping-results" aria-label={copy('Gefundene Supermärkte', 'Found supermarkets')} aria-busy={pending}>
            {!result ? (
              <div className="shopping-state">
                <div>
                  <SystemIcon name="location" />
                  <h2>{copy('Noch keine Suche', 'No search yet')}</h2>
                  <p>{copy('Wir zeigen nur live vom Kartenanbieter bestätigte Standorte. Keine erfundenen Läden, Preise oder Produktlinks.', 'Only locations confirmed live by the maps provider are shown. No invented stores, prices, or product links.')}</p>
                </div>
              </div>
            ) : result.results.length === 0 ? (
              <div className="shopping-state">
                <div><SystemIcon name="search" /><h2>{copy('Nichts gefunden', 'Nothing found')}</h2><p>{copy('Erhöhe den Radius oder prüfe die Ortsangabe.', 'Increase the radius or check the location.')}</p></div>
              </div>
            ) : (
              <>
                <div className="store-results-list">
                  {result.results.map((store) => {
                    const mapsUrl = safeMapsUrl(store.maps_uri);
                    return (
                      <article className="store-result" key={store.provider_id}>
                        <SystemIcon name="store" />
                        <div>
                          <strong>{store.name}</strong>
                          <span>{formatDistance(store.distance_meters)} · {store.formatted_address}</span>
                        </div>
                        {mapsUrl && (
                          <a className="system-icon-button" href={mapsUrl} target="_blank" rel="noreferrer" aria-label={copy(`${store.name} in Karten öffnen`, `Open ${store.name} in maps`)}>
                            <SystemIcon name="external" />
                          </a>
                        )}
                      </article>
                    );
                  })}
                </div>
                <p className="shopping-budget-note">{result.notice} {copy(
                  `Dein Budget von ${result.budget_context.amount.toLocaleString('de-DE')} ${result.budget_context.currency} dient momentan nur als Planungskontext; Live-Preise und Lagerbestände sind noch nicht angebunden.`,
                  `Your budget of ${result.budget_context.amount.toLocaleString('en-GB')} ${result.budget_context.currency} is currently planning context only; live prices and inventory are not connected yet.`,
                )}</p>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
