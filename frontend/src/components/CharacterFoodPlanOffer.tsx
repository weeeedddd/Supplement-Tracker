import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getCharacterPath, localizedCharacterCopy } from '../lib/characterPaths';
import {
  acceptFoodPlanOffer,
  declineFoodPlanOffer,
  formatOfferRemaining,
  formatPortions,
  foodPlanOfferRemainingMs,
  type CharacterFoodPlan,
  type CharacterFoodPlanOffer as FoodPlanOffer,
  type FoodPlanSlot,
} from '../lib/foodPlan';
import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const SLOT_LABELS: Record<FoodPlanSlot, { de: string; en: string }> = {
  breakfast: { de: 'Frühstück', en: 'Breakfast' },
  lunch: { de: 'Mittag', en: 'Lunch' },
  dinner: { de: 'Abend', en: 'Dinner' },
  snack: { de: 'Snack', en: 'Snack' },
};

interface CharacterFoodPlanOfferProps {
  offer: FoodPlanOffer;
  onAccept: (plan: CharacterFoodPlan) => void;
  onDecline: () => void;
  onDismiss: () => void;
}

/**
 * Shown right after a character path is equipped: a drafted day of meals the
 * user can accept while the offer is open, or turn down because they already
 * follow their own plan. Closing without deciding leaves the offer pending
 * until it expires.
 */
export function CharacterFoodPlanOfferDialog({
  offer,
  onAccept,
  onDecline,
  onDismiss,
}: CharacterFoodPlanOfferProps) {
  const path = getCharacterPath(offer.pathId);
  const [remaining, setRemaining] = useState(() => foodPlanOfferRemainingMs(offer));

  useModalIsolation(true, {
    backgroundSelectors: ['.onboarding-shell', '.system-page', '.system-topbar', '.system-bottom-nav'],
    onEscape: onDismiss,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(foodPlanOfferRemainingMs(offer)), 30_000);
    return () => window.clearInterval(timer);
  }, [offer]);

  useEffect(() => {
    if (remaining <= 0) onDismiss();
  }, [remaining, onDismiss]);

  if (!path) return null;
  const { plan } = offer;
  const kcalDelta = plan.totals.kcal - plan.targets.kcal;

  const accept = () => {
    const accepted = acceptFoodPlanOffer();
    if (accepted) onAccept(accepted);
  };

  const decline = () => {
    declineFoodPlanOffer();
    onDecline();
  };

  return createPortal(
    <div
      className="character-system-backdrop"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onDismiss(); }}
    >
      <section
        className="character-system-window food-plan-offer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-plan-offer-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header>
          <span><SystemIcon name="food" />{copy('ERNÄHRUNGSVORSCHLAG', 'FOOD PLAN PROPOSAL')}</span>
          <button type="button" onClick={onDismiss} aria-label={copy('Vorschlag schließen', 'Close proposal')}>
            <SystemIcon name="close" />
          </button>
        </header>

        <div className="character-system-copy">
          <small>{path.name.toUpperCase()} · {copy('PFAD AUSGERÜSTET', 'PATH EQUIPPED')}</small>
          <h2 id="food-plan-offer-title">{localizedCharacterCopy(path.foodFocus.headline, lang)}</h2>
          <p>{copy(
            'Ein Tagesvorschlag aus dem geprüften Rezeptkatalog, abgestimmt auf deinen Pfad, deine Ernährungsform und deine berechneten Ziele.',
            'A one-day suggestion from the reviewed recipe catalogue, matched to your path, your diet, and your calculated targets.',
          )}</p>
        </div>

        <p className="food-plan-window" role="status">
          <SystemIcon name="today" />
          {remaining > 0
            ? copy(
              `Du kannst diesen Vorschlag noch ${formatOfferRemaining(remaining)} annehmen. Danach verfällt er.`,
              `You can accept this proposal for another ${formatOfferRemaining(remaining)}. After that it lapses.`,
            )
            : copy('Der Vorschlag ist abgelaufen.', 'The proposal has lapsed.')}
        </p>

        <section className="food-plan-meals" aria-label={copy('Vorgeschlagene Mahlzeiten', 'Suggested meals')}>
          {plan.meals.map(meal => (
            <article key={`${meal.slot}-${meal.dishId}`}>
              <span className="food-plan-meal-icon" aria-hidden="true">{meal.icon}</span>
              <span className="food-plan-meal-copy">
                <small>{copy(SLOT_LABELS[meal.slot].de, SLOT_LABELS[meal.slot].en)}</small>
                <strong>{meal.name}</strong>
                <em>
                  {formatPortions(meal.portions)} × {copy('Portion', 'serving')}
                  {meal.prepMinutes ? ` · ${meal.prepMinutes} min` : ''}
                </em>
              </span>
              <span className="food-plan-meal-macros">
                <b>{meal.nutrition.kcal} kcal</b>
                <small>{meal.nutrition.prot} g {copy('Protein', 'protein')}</small>
              </span>
            </article>
          ))}
        </section>

        <dl className="food-plan-totals">
          <div>
            <dt>{copy('Summe', 'Total')}</dt>
            <dd>{plan.totals.kcal} kcal · {plan.totals.prot} g {copy('Protein', 'protein')}</dd>
          </div>
          <div>
            <dt>{copy('Dein Ziel', 'Your target')}</dt>
            <dd>{plan.targets.kcal} kcal · {plan.targets.prot} g {copy('Protein', 'protein')}</dd>
          </div>
          <div>
            <dt>{copy('Abweichung', 'Difference')}</dt>
            <dd>{kcalDelta > 0 ? '+' : ''}{kcalDelta} kcal</dd>
          </div>
        </dl>

        <ul className="food-plan-principles">
          {path.foodFocus.principles.map(principle => (
            <li key={principle.en}><SystemIcon name="check" />{localizedCharacterCopy(principle, lang)}</li>
          ))}
        </ul>

        <p className="character-system-safety">
          <SystemIcon name="shield" />
          {copy(
            'Ein Vorschlag, keine Verordnung. Nichts wird automatisch geloggt oder gekauft, und er ersetzt keine ärztliche oder diätologische Beratung.',
            'A suggestion, not a prescription. Nothing is logged or purchased automatically, and it does not replace medical or dietetic advice.',
          )}
        </p>

        <div className="food-plan-actions">
          <button type="button" className="system-button quiet" onClick={decline}>
            <SystemIcon name="close" />
            {copy('Nein — ich habe einen eigenen Plan', 'No — I have my own plan')}
          </button>
          <button type="button" className="character-system-equip" onClick={accept} disabled={remaining <= 0}>
            <SystemIcon name="check" />
            {copy('Plan annehmen', 'Accept plan')}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
