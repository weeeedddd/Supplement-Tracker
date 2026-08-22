import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { S } from '../lib/storage';
import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { showScreen } from '../lib/store';
import { loadUserProfile } from '../lib/profile';
import { getCharacterPath, localizedCharacterCopy } from '../lib/characterPaths';
import {
  SAFE_SUPPLEMENT_CATALOG,
  localizeSupplement,
  sanitizeRoutineSelection,
  toProtocol,
  type SafeSupplementCatalogItem,
} from '../lib/supplements';
import type { ProtocolItem } from '../lib/engine';
import { PerformanceHero } from './PerformanceHero';
import { SupplementSourcingBlock } from './SupplementSourcing';
import { SystemIcon, type SystemIconName } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const evidenceLabel: Record<SafeSupplementCatalogItem['evidenceLevel'], { de: string; en: string }> = {
  supported_for_specific_use: { de: 'Für bestimmten Einsatz gestützt', en: 'Supported for a specific use' },
  context_dependent: { de: 'Kontextabhängig', en: 'Context dependent' },
  food_first: { de: 'Lebensmittel zuerst', en: 'Food first' },
};

const supplementIcons: Record<string, SystemIconName> = {
  protein: 'food',
  kreatin: 'training',
  omega: 'water',
  vitd: 'sun',
  magnesium: 'moon',
  eaa: 'food',
  zinc: 'shield',
  'mass-gainer': 'food',
  preworkout: 'spark',
};

export function KiScreen() {
  const character = useMemo(() => {
    const profile = loadUserProfile();
    return profile?.mode === 'inspiration' ? getCharacterPath(profile.inspirationProfile) : null;
  }, []);
  const recommendedIds = useMemo(() => character?.recommendations.map(item => item.id) || [], [character]);
  const catalog = useMemo(() => [...SAFE_SUPPLEMENT_CATALOG].sort((a, b) => {
    const aIndex = recommendedIds.indexOf(a.id);
    const bIndex = recommendedIds.indexOf(b.id);
    if (aIndex < 0 && bIndex < 0) return 0;
    if (aIndex < 0) return 1;
    if (bIndex < 0) return -1;
    return aIndex - bIndex;
  }), [recommendedIds]);
  const initial = useMemo(() => {
    const current = S.get<ProtocolItem[]>('protocol') || [];
    return sanitizeRoutineSelection(current.map(item => item.id));
  }, []);
  const [selected, setSelected] = useState<string[]>(initial);
  const [details, setDetails] = useState<SafeSupplementCatalogItem | null>(null);

  useModalIsolation(Boolean(details), {
    backgroundSelectors: ['.supplement-page', '.system-topbar', '.system-bottom-nav'],
    onEscape: () => setDetails(null),
  });

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
        <PerformanceHero
          variant="supplements"
          icon="supplements"
          title={copy('Supplement-Wissen', 'Supplement knowledge')}
          description={copy(
            'Verstehe, was verbreitete Supplements leisten können – und wo die Evidenz endet. Du wählst selbst, was du bereits nutzt.',
            'Understand what common supplements may support and where the evidence stops. You choose what you already use.',
          )}
          status={(
            <>
              <span><small>{copy('Ausgewählt', 'Selected')}</small><strong>{selected.length}</strong></span>
              <span><small>{copy('Einträge', 'Entries')}</small><strong>{SAFE_SUPPLEMENT_CATALOG.length}</strong></span>
              <span><small>{copy('Prinzip', 'Principle')}</small><strong>{copy('Food first', 'Food first')}</strong></span>
            </>
          )}
        />

        {character && <section className="character-supplement-match" aria-labelledby="character-match-title">
          <header>
            <span><SystemIcon name="spark" />{copy('CHARAKTER-MATCH AKTIV', 'CHARACTER MATCH ACTIVE')}</span>
            <strong>{character.name}</strong>
          </header>
          <div className="character-match-copy">
            <h2 id="character-match-title">{localizedCharacterCopy(character.title, lang)}</h2>
            <p>{copy(
              'Diese Einträge passen zu den Tags deines ausgerüsteten Trainingspfads und stehen deshalb zuerst. Sie sind Optionen, keine Pflichtkäufe.',
              'These entries match the tags on your equipped training path, so they appear first. They are options, not required purchases.',
            )}</p>
          </div>
          <div className="character-match-list">
            {character.recommendations.map(item => <article key={item.id}>
              <SystemIcon name={supplementIcons[item.id] || 'supplements'} />
              <span>
                <strong>{localizedCharacterCopy(item.label, lang)}</strong>
                <small>{localizedCharacterCopy(item.reason, lang)}</small>
                <SupplementSourcingBlock id={item.id} compact />
              </span>
              <b>{copy('MATCH', 'MATCH')}</b>
            </article>)}
          </div>
          <button type="button" onClick={() => setSelected(current => [...new Set([...current, ...recommendedIds])])}>
            <SystemIcon name="check" />{copy('Empfehlungen zum Tracker hinzufügen', 'Add recommendations to tracker')}
          </button>
        </section>}

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
          {catalog.map(catalogItem => {
            const item = localizeSupplement(catalogItem, lang);
            const active = selected.includes(item.id);
            const label = evidenceLabel[item.evidenceLevel];
            return (
              <article className={active ? 'supplement-entry selected' : 'supplement-entry'} key={item.id}>
                <div className="supplement-entry-icon" aria-hidden="true"><SystemIcon name={supplementIcons[item.id] || 'supplements'} /></div>
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

        <footer className="system-action-bar supplement-actions">
          <button className="system-button quiet" type="button" onClick={skip}>{copy('Ohne Supplements fortfahren', 'Continue without supplements')}</button>
          <button className="system-primary-action" type="button" onClick={save}>
            <span>{copy('Routine speichern', 'Save routine')}</span>
            <small>{selected.length} {copy('ausgewählt', 'selected')}</small>
          </button>
        </footer>
      </div>
      {details && createPortal(
        <div className="supplement-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDetails(null); }}>
          <section className="supplement-detail-panel" role="dialog" aria-modal="true" aria-labelledby="supplement-detail-title" onMouseDown={event => event.stopPropagation()}>
            <header>
              <div><h2 id="supplement-detail-title">{details.label}</h2><p>{details.whatItIs}</p></div>
              <button type="button" className="system-icon-button" onClick={() => setDetails(null)} aria-label={copy('Details schließen', 'Close details')}><SystemIcon name="close" /></button>
            </header>
            <div className="supplement-detail-grid">
              <section><h3>{copy('Was die Evidenz stützt', 'What evidence supports')}</h3><p>{details.supportedUse}</p></section>
              <section><h3>{copy('Grenzen', 'Limits')}</h3><p>{details.evidenceLimits}</p></section>
              <section><h3>{copy('Lebensmittelquellen', 'Food sources')}</h3><ul>{details.foodSources.map(source => <li key={source}>{source}</li>)}</ul></section>
              <section><h3>{copy('Vorher prüfen', 'Check first')}</h3><p>{details.interactionPrompt}</p><ul>{details.cautions.map(caution => <li key={caution}>{caution}</li>)}</ul></section>
              <section className="supplement-detail-sourcing">
                <h3>{copy('Woher bekommen', 'Where to get it')}</h3>
                <SupplementSourcingBlock id={details.id} />
              </section>
            </div>
            <footer>
              <span>{copy('Geprüft', 'Reviewed')}: {details.reviewedAt}</span>
              <div>{details.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.authority}<SystemIcon name="external" /></a>)}</div>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
