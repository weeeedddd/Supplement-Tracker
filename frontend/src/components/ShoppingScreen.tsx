import { useState, type FormEvent } from 'react';

import { requestNearbyStores, type NearbyStoresEnvelope } from '../lib/integrations';
import { getBackendUrl } from '../lib/backend';
import { SystemIcon } from './SystemIcon';

type LocationChoice =
  | { kind: 'address' }
  | { kind: 'coordinates'; latitude: number; longitude: number };

const COUNTRY_LABELS: Record<string, string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  NL: 'Niederlande',
  BE: 'Belgien',
  FR: 'Frankreich',
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

export function ShoppingScreen() {
  const [country, setCountry] = useState('DE');
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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Dein Browser unterstützt die Standortfreigabe nicht. Nutze stattdessen eine Adresse.');
      return;
    }
    setLocating(true);
    setStatus('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ kind: 'coordinates', latitude: coords.latitude, longitude: coords.longitude });
        setAddress('');
        setLocating(false);
        setStatus('Standort für diese Suche übernommen. Er wird nicht lokal gespeichert.');
      },
      () => {
        setLocation({ kind: 'address' });
        setLocating(false);
        setStatus('Standort wurde nicht freigegeben. Du kannst eine Adresse eingeben.');
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
      setStatus('Bitte bestätige zuerst die einmalige Standortfreigabe für diese Suche.');
      return;
    }
    if (!/^[A-Z]{2}$/.test(normalizedCountry) || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setStatus('Prüfe Länder- und Währungscode. Erwartet werden z. B. DE und EUR.');
      return;
    }
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0 || parsedBudget > 100_000) {
      setStatus('Das Budget muss zwischen 1 und 100.000 liegen.');
      return;
    }
    if (!Number.isInteger(parsedRadius) || parsedRadius < 500 || parsedRadius > 25_000) {
      setStatus('Der Suchradius muss zwischen 500 m und 25 km liegen.');
      return;
    }
    if (location.kind === 'address' && (address.trim().length < 5 || address.trim().length > 200)) {
      setStatus('Gib eine vollständige Adresse oder mindestens Ort und Postleitzahl ein.');
      return;
    }

    setPending(true);
    setStatus('Supermärkte werden über den konfigurierten Kartenanbieter gesucht …');
    try {
      const response = await requestNearbyStores({
        location_consent: true,
        country: normalizedCountry,
        budget: parsedBudget,
        currency: normalizedCurrency,
        radius_meters: parsedRadius,
        max_results: 10,
        language_code: 'de',
        ...(location.kind === 'coordinates'
          ? { coordinates: { latitude: location.latitude, longitude: location.longitude } }
          : { address: address.trim() }),
      });
      setResult(response);
      setStatus(response.results.length ? `${response.results.length} echte Standorte gefunden.` : 'Keine passenden Standorte im Suchradius gefunden.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Die Standortsuche ist momentan nicht verfügbar.');
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
            <h1 id="shopping-title">Einkaufsradar</h1>
            <p>Finde echte Supermärkte in deiner Nähe. Budget und Standort gehen ausschließlich an den separaten Karten-Endpunkt – niemals an die KI.</p>
          </div>
        </header>

        <div className="system-notice" role="note">
          <SystemIcon name={backendConfigured ? 'shield' : 'warning'} />
          <div>
            <strong>{backendConfigured ? 'Sichere Verbindung vorbereitet' : 'Backend noch nicht verbunden'}</strong>
            <span>{backendConfigured
              ? 'Adressen werden nur für die einzelne Suche verarbeitet und weder im Browserprofil noch im KI-Kontext gespeichert.'
              : 'GitHub Pages kann keinen geheimen Karten-Schlüssel hosten. Hinterlege in den Einstellungen die URL eines sicheren CORELINE-Backends.'}</span>
          </div>
        </div>

        <div className="shopping-layout">
          <form className="shopping-form" onSubmit={submit} noValidate>
            <div className="shopping-field-grid">
              <label className="system-field">
                Land
                <select value={country} onChange={(event) => setCountry(event.target.value)}>
                  {Object.entries(COUNTRY_LABELS).map(([code, label]) => <option value={code} key={code}>{label} ({code})</option>)}
                </select>
              </label>
              <label className="system-field">
                Suchradius
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
                Währung
                <input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Dreistelliger Währungscode" />
              </label>
              <label className="system-field wide">
                Adresse oder Ort
                <input
                  autoComplete="street-address"
                  maxLength={200}
                  value={address}
                  disabled={location.kind === 'coordinates'}
                  placeholder="z. B. 10115 Berlin"
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setLocation({ kind: 'address' });
                  }}
                />
              </label>
            </div>

            <div className="shopping-location-actions">
              <button className="system-button quiet" type="button" onClick={useCurrentLocation} disabled={locating}>
                <SystemIcon name="location" /> {locating ? 'Standort wird gelesen …' : 'Aktuellen Standort nutzen'}
              </button>
              {location.kind === 'coordinates' && (
                <button className="system-button quiet" type="button" onClick={() => setLocation({ kind: 'address' })}>Adresse verwenden</button>
              )}
            </div>

            <label className="shopping-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Ich stimme zu, dass Standort oder Adresse einmalig an den konfigurierten Kartenanbieter gesendet werden, um Supermärkte zu finden. Die Angabe wird nicht im Profil gespeichert.</span>
            </label>

            <button className="system-primary-action" type="submit" disabled={pending || !backendConfigured}>
              <SystemIcon name="search" /> {pending ? 'Suche läuft' : 'Supermärkte finden'}
            </button>
            {status && <p className="shopping-budget-note" role="status">{status}</p>}
          </form>

          <section className="shopping-results" aria-label="Gefundene Supermärkte" aria-busy={pending}>
            {!result ? (
              <div className="shopping-state">
                <div>
                  <SystemIcon name="location" />
                  <h2>Noch keine Suche</h2>
                  <p>Wir zeigen nur live vom Kartenanbieter bestätigte Standorte. Keine erfundenen Läden, Preise oder Produktlinks.</p>
                </div>
              </div>
            ) : result.results.length === 0 ? (
              <div className="shopping-state">
                <div><SystemIcon name="search" /><h2>Nichts gefunden</h2><p>Erhöhe den Radius oder prüfe die Ortsangabe.</p></div>
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
                          <a className="system-icon-button" href={mapsUrl} target="_blank" rel="noreferrer" aria-label={`${store.name} in Karten öffnen`}>
                            <SystemIcon name="external" />
                          </a>
                        )}
                      </article>
                    );
                  })}
                </div>
                <p className="shopping-budget-note">{result.notice} Dein Budget von {result.budget_context.amount.toLocaleString('de-DE')} {result.budget_context.currency} dient momentan nur als Planungskontext; Live-Preise und Lagerbestände sind noch nicht angebunden.</p>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
