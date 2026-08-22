import { useEffect, useState } from 'react';

import { getBackendUrl } from '../lib/backend';
import { lang } from '../lib/i18n';
import { S } from '../lib/storage';
import { showScreen } from '../lib/store';
import {
  getSupplementStockState,
  nearbyShopLinks,
  onlineOrderLinks,
  setSupplementStockState,
  SUPPLEMENT_STOCK_UPDATED_EVENT,
  type SupplementStockState,
} from '../lib/supplementSourcing';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

interface SupplementSourcingProps {
  id: string;
  /** Compact renders the inline variant used on recommendation cards. */
  compact?: boolean;
}

/**
 * "Do you already have it, and if not, where do you get it?" — map searches for
 * shop categories that commonly stock the product plus online search links.
 * CORELINE checks no price, no stock and no seller, and orders nothing.
 */
export function SupplementSourcingBlock({ id, compact = false }: SupplementSourcingProps) {
  const [stock, setStock] = useState<SupplementStockState | null>(() => getSupplementStockState(id));

  useEffect(() => {
    const sync = () => setStock(getSupplementStockState(id));
    sync();
    window.addEventListener(SUPPLEMENT_STOCK_UPDATED_EVENT, sync);
    return () => window.removeEventListener(SUPPLEMENT_STOCK_UPDATED_EVENT, sync);
  }, [id]);

  const choose = (next: SupplementStockState) => {
    setStock(setSupplementStockState(id, stock === next ? null : next)[id] ?? null);
  };

  const shops = nearbyShopLinks(id, lang);
  const online = onlineOrderLinks(id, lang);
  const showSources = stock === 'need' || (!compact && stock !== 'have');

  const openShoppingRadar = () => {
    S.set('shopping_store_kind', 'supplement');
    showScreen('shopping');
  };

  return (
    <div className={compact ? 'supplement-sourcing compact' : 'supplement-sourcing'}>
      <div className="supplement-stock-toggle" role="group" aria-label={copy('Bestand', 'Stock')}>
        <span>{copy('Hast du das schon?', 'Do you already have it?')}</span>
        <button
          type="button"
          className={stock === 'have' ? 'system-button selected' : 'system-button quiet'}
          aria-pressed={stock === 'have'}
          onClick={() => choose('have')}
        >
          <SystemIcon name="check" />{copy('Habe ich', 'I have it')}
        </button>
        <button
          type="button"
          className={stock === 'need' ? 'system-button selected' : 'system-button quiet'}
          aria-pressed={stock === 'need'}
          onClick={() => choose('need')}
        >
          <SystemIcon name="store" />{copy('Brauche ich', 'I need it')}
        </button>
      </div>

      {showSources && (
        <>
          <div className="supplement-sourcing-group">
            <h4><SystemIcon name="location" />{copy('Geschäft in der Nähe', 'Shop nearby')}</h4>
            <div className="supplement-sourcing-links">
              {shops.map(shop => (
                <a key={shop.id} href={shop.url} target="_blank" rel="noopener noreferrer">
                  {shop.label}<SystemIcon name="external" />
                </a>
              ))}
            </div>
            {getBackendUrl() && (
              <button type="button" className="system-button quiet" onClick={openShoppingRadar}>
                <SystemIcon name="search" />{copy('Filialen mit Entfernung suchen', 'Search branches with distance')}
              </button>
            )}
          </div>

          <div className="supplement-sourcing-group">
            <h4><SystemIcon name="store" />{copy('Online bestellen', 'Order online')}</h4>
            <div className="supplement-sourcing-links">
              {online.map(option => (
                <a key={option.id} href={option.url} target="_blank" rel="noopener noreferrer">
                  {option.label}<SystemIcon name="external" />
                </a>
              ))}
            </div>
          </div>

          <p className="supplement-sourcing-note">
            <SystemIcon name="shield" />
            <span>{copy(
              'Nur Suchlinks: CORELINE prüft weder Preis noch Verfügbarkeit oder Anbieter, empfiehlt keine Marke und bestellt nichts. Lebensmittel bleiben die erste Quelle.',
              'Search links only: CORELINE verifies no price, availability, or seller, recommends no brand, and orders nothing. Food remains the first source.',
            )}</span>
          </p>
        </>
      )}
    </div>
  );
}
