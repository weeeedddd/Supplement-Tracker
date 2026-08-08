import { useMemo, useState } from 'react';
import { S } from '../lib/storage';
import { lang } from '../lib/i18n';
import { showScreen } from '../lib/store';
import {
  SAFE_SUPPLEMENT_CATALOG,
  sanitizeRoutineSelection,
  toProtocol,
  type SafeSupplementCatalogItem,
} from '../lib/supplements';
import type { ProtocolItem } from '../lib/engine';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const evidenceLabel: Record<SafeSupplementCatalogItem['evidenceLevel'], { de: string; en: string }> = {
  supported_for_specific_use: { de: 'Für bestimmten Einsatz gestützt', en: 'Supported for a specific use' },
  context_dependent: { de: 'Kontextabhängig', en: 'Context dependent' },
  food_first: { de: 'Lebensmittel zuerst', en: 'Food first' },
};

export function KiScreen() {
  const initial = useMemo(() => {
    const current = S.get<ProtocolItem[]>('protocol') || [];
    return sanitizeRoutineSelection(current.map(item => item.id));
  }, []);
  const [selected, setSelected] = useState<string[]>(initial);
  const [details, setDetails] = useState<SafeSupplementCatalogItem | null>(null);

  const toggle = (id: string) => {
    setSelected(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  const save = () => {
    S.set('protocol', toProtocol(selected));
    showScreen('dashboard');
  };

  const skip = () => {
    S.set('protocol', []);
    showScreen('dashboard');
  };

  return (
    <section className="screen active system-screen" id="screen-ki">
      <div className="system-page supplement-page">
        <header className="system-page-header supplement-header">
          <div className="system-heading-mark" aria-hidden="true"><SystemIcon name="supplements" /></div>
          <div>
            <h1>{copy('Supplement-Wissen', 'Supplement knowledge')}</h1>
            <p>{copy(
              'Verstehe, was verbreitete Supplements leisten können – und wo die Evidenz endet. Du wählst selbst, was du bereits nutzt.',
              'Understand what common supplements may support and where the evidence stops. You choose what you already use.',
            )}</p>
          </div>
        </header>

        <aside className="system-notice" role="note">
          <SystemIcon name="shield" />
          <div>
            <strong>{copy('Keine automatische Dosierung', 'No autonomous dosing')}</strong>
            <span>{copy(
              'CORELINE diagnostiziert keinen Mangel und erstellt keinen medizinischen Stack. Etikett, Ernährung und qualifizierte Beratung bleiben maßgeblich.',
              'CORELINE does not diagnose a deficiency or create a medical stack. The label, food pattern, and qualified advice remain decisive.',
            )}</span>
          </div>
        </aside>

        <section className="supplement-library" aria-label={copy('Supplement-Bibliothek', 'Supplement library')}>
          {SAFE_SUPPLEMENT_CATALOG.map(item => {
            const active = selected.includes(item.id);
            const label = evidenceLabel[item.evidenceLevel];
            return (
              <article className={active ? 'supplement-entry selected' : 'supplement-entry'} key={item.id}>
                <div className="supplement-entry-icon" aria-hidden="true"><SystemIcon name="supplements" /></div>
                <div className="supplement-entry-copy">
                  <div className="supplement-entry-title">
                    <h2>{item.label}</h2>
                    <span>{lang === 'de' ? label.de : label.en}</span>
                  </div>
                  <p>{item.supportedUse}</p>
                  <small>{item.evidenceLimits}</small>
                </div>
                <div className="supplement-entry-actions">
                  <button type="button" className="system-button quiet" onClick={() => setDetails(item)}>
                    <SystemIcon name="info" />{copy('Details', 'Details')}
                  </button>
                  <button
                    type="button"
                    className={active ? 'system-button selected' : 'system-button'}
                    onClick={() => toggle(item.id)}
                    aria-pressed={active}
                  >
                    <SystemIcon name={active ? 'check' : 'plus'} />
                    {active ? copy('Wird getrackt', 'Tracking') : copy('Tracken', 'Track')}
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        {details && (
          <section className="supplement-detail-panel" aria-labelledby="supplement-detail-title">
            <header>
              <div>
                <h2 id="supplement-detail-title">{details.label}</h2>
                <p>{details.whatItIs}</p>
              </div>
              <button type="button" className="system-icon-button" onClick={() => setDetails(null)} aria-label={copy('Details schließen', 'Close details')}>
                <SystemIcon name="close" />
              </button>
            </header>
            <div className="supplement-detail-grid">
              <section>
                <h3>{copy('Was die Evidenz stützt', 'What evidence supports')}</h3>
                <p>{details.supportedUse}</p>
              </section>
              <section>
                <h3>{copy('Grenzen', 'Limits')}</h3>
                <p>{details.evidenceLimits}</p>
              </section>
              <section>
                <h3>{copy('Lebensmittelquellen', 'Food sources')}</h3>
                <ul>{details.foodSources.map(source => <li key={source}>{source}</li>)}</ul>
              </section>
              <section>
                <h3>{copy('Vorher prüfen', 'Check first')}</h3>
                <p>{details.interactionPrompt}</p>
                <ul>{details.cautions.map(caution => <li key={caution}>{caution}</li>)}</ul>
              </section>
            </div>
            <footer>
              <span>{copy('Geprüft', 'Reviewed')}: {details.reviewedAt}</span>
              <div>
                {details.sources.map(source => (
                  <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.authority}<SystemIcon name="external" />
                  </a>
                ))}
              </div>
            </footer>
          </section>
        )}

        <footer className="system-action-bar supplement-actions">
          <button className="system-button quiet" type="button" onClick={skip}>{copy('Ohne Supplements fortfahren', 'Continue without supplements')}</button>
          <button className="system-primary-action" type="button" onClick={save}>
            <span>{copy('Routine speichern', 'Save routine')}</span>
            <small>{selected.length} {copy('ausgewählt', 'selected')}</small>
          </button>
        </footer>
      </div>
    </section>
  );
}
