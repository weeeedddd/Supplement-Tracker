import { useCallback, useEffect, useState } from 'react';

import { getCharacterPath, localizedCharacterCopy } from '../lib/characterPaths';
import { logMeal } from '../lib/fitness';
import {
  acceptFoodPlanOffer,
  clearActiveFoodPlan,
  declineFoodPlanOffer,
  foodPlanOfferRemainingMs,
  formatOfferRemaining,
  formatPortions,
  loadActiveFoodPlan,
  pendingFoodPlanOffer,
  FOOD_PLAN_UPDATED_EVENT,
  type CharacterFoodPlan,
  type CharacterFoodPlanOffer,
  type FoodPlanMeal,
  type FoodPlanSlot,
} from '../lib/foodPlan';
import { lang } from '../lib/i18n';
import { refresh } from '../lib/store';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string) => lang === 'de' ? de : en;

const SLOT_LABELS: Record<FoodPlanSlot, { de: string; en: string }> = {
  breakfast: { de: 'Frühstück', en: 'Breakfast' },
  lunch: { de: 'Mittag', en: 'Lunch' },
  dinner: { de: 'Abend', en: 'Dinner' },
  snack: { de: 'Snack', en: 'Snack' },
};

interface CharacterFoodPlanPanelProps {
  onMessage?: (message: string) => void;
}

/**
 * Food-screen view of the path suggestion: the accepted day plan with a log
 * action per meal, or the still-open proposal the user can answer here.
 */
export function CharacterFoodPlanPanel({ onMessage }: CharacterFoodPlanPanelProps) {
  const [plan, setPlan] = useState<CharacterFoodPlan | null>(() => loadActiveFoodPlan());
  const [offer, setOffer] = useState<CharacterFoodPlanOffer | null>(() => pendingFoodPlanOffer());

  const sync = useCallback(() => {
    setPlan(loadActiveFoodPlan());
    setOffer(pendingFoodPlanOffer());
  }, []);

  useEffect(() => {
    window.addEventListener(FOOD_PLAN_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FOOD_PLAN_UPDATED_EVENT, sync);
  }, [sync]);

  const logPlannedMeal = async (meal: FoodPlanMeal) => {
    const portionLabel = meal.portions === 1 ? '' : ` × ${formatPortions(meal.portions)}`;
    await logMeal({
      name: `${meal.name}${portionLabel}`,
      kcal: meal.nutrition.kcal,
      prot: meal.nutrition.prot,
      carb: meal.nutrition.carb,
      fat: meal.nutrition.fat,
      sug: meal.nutrition.sug,
    });
    refresh();
    onMessage?.(copy(`${meal.name} wurde für heute erfasst.`, `${meal.name} was logged for today.`));
  };

  if (offer) {
    const path = getCharacterPath(offer.pathId);
    return (
      <section className="system-ledger food-plan-panel food-plan-panel-offer" aria-labelledby="food-plan-offer-banner-title">
        <header className="ledger-heading">
          <span aria-hidden="true"><SystemIcon name="food" /></span>
          <h2 id="food-plan-offer-banner-title">{copy('Ernährungsvorschlag offen', 'Food plan proposal open')}</h2>
          <small>{formatOfferRemaining(foodPlanOfferRemainingMs(offer))}</small>
        </header>
        <p>{path
          ? copy(
            `Für ${path.name} liegt ein Tagesvorschlag bereit: ${offer.plan.meals.length} Mahlzeiten, ${offer.plan.totals.kcal} kcal.`,
            `A one-day suggestion for ${path.name} is ready: ${offer.plan.meals.length} meals, ${offer.plan.totals.kcal} kcal.`,
          )
          : copy('Ein Tagesvorschlag liegt bereit.', 'A one-day suggestion is ready.')}</p>
        <div className="food-plan-actions">
          <button type="button" className="system-button quiet" onClick={() => { declineFoodPlanOffer(); sync(); }}>
            <SystemIcon name="close" />{copy('Nein — eigener Plan', 'No — my own plan')}
          </button>
          <button type="button" className="system-button" onClick={() => { acceptFoodPlanOffer(); sync(); }}>
            <SystemIcon name="check" />{copy('Plan annehmen', 'Accept plan')}
          </button>
        </div>
      </section>
    );
  }

  if (!plan) return null;
  const path = getCharacterPath(plan.pathId);

  return (
    <section className="system-ledger food-plan-panel" aria-labelledby="food-plan-panel-title">
      <header className="ledger-heading">
        <span aria-hidden="true"><SystemIcon name="food" /></span>
        <h2 id="food-plan-panel-title">{copy('Pfad-Ernährungsplan', 'Path food plan')}</h2>
        <small>{path?.name ?? ''}</small>
      </header>
      {path && <p className="food-plan-panel-focus">{localizedCharacterCopy(path.foodFocus.headline, lang)}</p>}
      <div className="food-plan-panel-meals">
        {plan.meals.map(meal => (
          <article key={`${meal.slot}-${meal.dishId}`}>
            <span className="food-plan-meal-icon" aria-hidden="true">{meal.icon}</span>
            <span className="food-plan-meal-copy">
              <small>{copy(SLOT_LABELS[meal.slot].de, SLOT_LABELS[meal.slot].en)}</small>
              <strong>{meal.name}</strong>
              <em>{formatPortions(meal.portions)} × {copy('Portion', 'serving')} · {meal.nutrition.kcal} kcal · {meal.nutrition.prot} g {copy('Protein', 'protein')}</em>
            </span>
            <button type="button" className="system-button quiet" onClick={() => { void logPlannedMeal(meal); }}>
              <SystemIcon name="plus" />{copy('Erfassen', 'Log')}
            </button>
          </article>
        ))}
      </div>
      <p className="ledger-footnote">
        <SystemIcon name="info" />
        <span>{copy(
          `Vorschlag: ${plan.totals.kcal} kcal · ${plan.totals.prot} g Protein gegenüber deinem Ziel von ${plan.targets.kcal} kcal · ${plan.targets.prot} g. Tausche jede Mahlzeit frei — erfasst wird nur, was du bestätigst.`,
          `Suggested: ${plan.totals.kcal} kcal · ${plan.totals.prot} g protein against your target of ${plan.targets.kcal} kcal · ${plan.targets.prot} g. Swap any meal freely — only what you confirm is logged.`,
        )}</span>
      </p>
      <button type="button" className="system-button quiet" onClick={() => { clearActiveFoodPlan(); sync(); }}>
        <SystemIcon name="delete" />{copy('Plan entfernen', 'Remove plan')}
      </button>
    </section>
  );
}
