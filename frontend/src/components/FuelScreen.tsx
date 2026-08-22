import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { calcConsumed, type Macros } from '../lib/engine';
import {
  buildCharacterFoodPlan,
  loadCharacterFoodPlanChoice,
  type CharacterMealSlot,
} from '../lib/characterFoodPlans';
import {
  CURATED_DISHES,
  createDish,
  estimateCaloriesFromMacros,
  fetchDishes,
  locDish,
  logMeal,
  normalizeNutrition,
  nutritionFromDish,
  scaleIngredientLine,
  scaleNutrition,
  validateNutrition,
  type Dish,
} from '../lib/fitness';
import { lang, t } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { NUTRITION_LIMITS } from '../lib/nutritionBounds';
import type { NutritionTargets, TrainingGoal } from '../lib/plans';
import { loadUserProfile } from '../lib/profile';
import { S } from '../lib/storage';
import { refresh } from '../lib/store';
import { PerformanceHero } from './PerformanceHero';
import { SystemIcon } from './SystemIcon';
import '../fuel.css';

const CATEGORIES = ['all', 'breakfast', 'main', 'dessert', 'snack'];
const EQUIPMENT = ['airfryer', 'ricecooker'];
const PAGE_SIZE = 24;
const copy = (de: string, en: string) => lang === 'de' ? de : en;

const mealSlotLabel = (slot: CharacterMealSlot) => ({
  breakfast: copy('Frühstück', 'Breakfast'),
  lunch: copy('Mittag', 'Lunch'),
  snack: copy('Snack', 'Snack'),
  dinner: copy('Abendessen', 'Dinner'),
})[slot];

const formatPortions = (portions: number) => Number.isInteger(portions)
  ? String(portions)
  : portions.toFixed(1).replace('.', ',');

const GOAL_LABELS: Record<TrainingGoal, { de: string; en: string }> = {
  general_fitness: { de: 'Allgemeine Fitness', en: 'General fitness' },
  build_muscle: { de: 'Kontrollierter Aufbau', en: 'Controlled gain' },
  get_stronger: { de: 'Kraftaufbau', en: 'Strength gain' },
  fat_loss: { de: 'Lean / Shredded', en: 'Lean / shredded' },
};

const ACTIVITY_LABELS = {
  sedentary: { de: 'Sitzend', en: 'Sedentary' },
  light: { de: 'Leicht aktiv', en: 'Lightly active' },
  moderate: { de: 'Moderat aktiv', en: 'Moderately active' },
  high: { de: 'Sehr aktiv', en: 'Very active' },
  very_high: { de: 'Athletisch aktiv', en: 'Athlete-level activity' },
} as const;

function recommendationScore(dish: Dish, goal: TrainingGoal, remainingCalories: number | null): number {
  let score = dish.goals?.includes(goal) ? 100 : 0;
  const proteinDensity = dish.kcal > 0 ? dish.prot / dish.kcal * 100 : 0;
  score += proteinDensity * 3;
  if (remainingCalories !== null && dish.kcal <= remainingCalories) score += 12;
  if (goal === 'fat_loss') score += Math.max(0, 18 - dish.kcal / 45);
  if (goal === 'build_muscle') score += Math.min(18, dish.prot / 3 + dish.carb / 12);
  if (goal === 'get_stronger') score += Math.min(16, dish.carb / 10 + dish.prot / 5);
  return score;
}

function isOfflineSafeImage(source?: string): boolean {
  if (!source) return false;
  if (source.startsWith('data:image/') || source.startsWith('blob:')) return true;
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source);
}

export function FuelScreen() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [category, setCategory] = useState('all');
  const [equipment, setEquipment] = useState<string | null>(null);
  const [detail, setDetail] = useState<Dish | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useModalIsolation(Boolean(detail || creating), {
    backgroundSelectors: ['.food-page', '.system-topbar', '.system-bottom-nav'],
    onEscape: () => { setDetail(null); setCreating(false); },
  });

  const load = () => {
    setVisibleCount(PAGE_SIZE);
    void fetchDishes(category === 'all' ? undefined : category, equipment || undefined).then(setDishes);
  };
  useEffect(load, [category, equipment]);

  const goals = S.get<Macros>('macros');
  const targetDetails = S.get<NutritionTargets>('nutrition_targets_v2');
  const profile = loadUserProfile();
  const storedFoodPlan = loadCharacterFoodPlanChoice();
  const activeFoodPlan = storedFoodPlan?.choice === 'accepted'
    && profile?.mode === 'inspiration'
    && profile.inspirationProfile === storedFoodPlan.plan.characterId
    && targetDetails
    ? buildCharacterFoodPlan(
      profile.inspirationProfile,
      profile,
      targetDetails,
      lang === 'de' ? 'de' : 'en',
      storedFoodPlan.plan.generatedAt,
    )
    : null;
  const consumed = calcConsumed();
  const bars: { key: keyof Macros; label: string; unit: string }[] = [
    { key: 'kcal', label: copy('Kalorien', 'Calories'), unit: 'kcal' },
    { key: 'prot', label: copy('Protein', 'Protein'), unit: 'g' },
    { key: 'carb', label: copy('Kohlenhydrate', 'Carbohydrates'), unit: 'g' },
    { key: 'fat', label: copy('Fett', 'Fat'), unit: 'g' },
    { key: 'sug', label: copy('Freier Zucker*', 'Free sugar*'), unit: 'g' },
  ];
  const rankedDishes = useMemo(() => {
    const compatible = profile
      ? dishes.filter(dish => !dish.diets?.length || dish.diets.includes(profile.diet))
      : dishes;
    const remainingCalories = goals ? Math.max(0, goals.kcal - consumed.kcal) : null;
    return [...compatible].sort((a, b) => {
      const priority = recommendationScore(b, profile?.goal ?? 'general_fitness', remainingCalories)
        - recommendationScore(a, profile?.goal ?? 'general_fitness', remainingCalories);
      return priority || String(a.name).localeCompare(String(b.name));
    });
  }, [consumed.kcal, dishes, goals?.kcal, profile?.diet, profile?.goal]);
  const recommendedIds = new Set(rankedDishes
    .filter(dish => dish.goals?.includes(profile?.goal ?? 'general_fitness'))
    .slice(0, 6)
    .map(dish => String(dish.id)));
  const visibleDishes = rankedDishes.slice(0, visibleCount);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const logDish = async (dish: Dish, portions = 1) => {
    const nutrition = scaleNutrition(nutritionFromDish(dish), portions);
    const portionLabel = portions === 1 ? '' : ` × ${String(portions).replace('.', ',')}`;
    await logMeal({ name: `${dish.name}${portionLabel}`, ...nutrition });
    setDetail(null);
    refresh();
    flash(copy(`${dish.name} wurde für heute erfasst.`, `${dish.name} was logged for today.`));
  };

  return (
    <section className="screen active system-screen" id="screen-fuel">
      <div className="system-page food-page">
        <PerformanceHero
          variant="food"
          icon="food"
          title={copy('Ernährung', 'Nutrition')}
          description={copy(
            'Mahlzeiten verlässlich protokollieren, Ziele prüfen und eigene Rezepte lokal speichern.',
            'Log meals reliably, review targets, and save your own recipes locally.',
          )}
          status={(
            <>
              <span><small>{copy('Kalorien', 'Calories')}</small><strong>{Math.round(consumed.kcal)}{goals ? ` / ${Math.round(goals.kcal)}` : ''}</strong></span>
              <span><small>{copy('Protein', 'Protein')}</small><strong>{Math.round(consumed.prot)} g</strong></span>
              <span><small>{copy('Rezepte', 'Recipes')}</small><strong>{dishes.length}</strong></span>
            </>
          )}
        />

        <div className="food-content">
          {activeFoodPlan && (
            <section className="character-food-plan-ledger" aria-labelledby="active-character-food-plan-title">
              <header>
                <span><SystemIcon name="spark" />{copy('AUSGERÜSTETES FUEL-PROTOKOLL', 'EQUIPPED FUEL PROTOCOL')}</span>
                <small>{activeFoodPlan.characterName} Path</small>
              </header>
              <div className="character-food-plan-heading">
                <div><h2 id="active-character-food-plan-title">{activeFoodPlan.title}</h2><p>{activeFoodPlan.focus}</p></div>
                <span><small>{copy('TAGESRAHMEN', 'DAILY TEMPLATE')}</small><strong>{activeFoodPlan.plannedNutrition.kcal}</strong><em>kcal</em></span>
              </div>
              <div className="character-food-plan-meals">
                {activeFoodPlan.meals.map(meal => {
                  const recipe = CURATED_DISHES.find(dish => String(dish.id) === meal.recipeId);
                  return <button key={meal.slot} type="button" disabled={!recipe} onClick={() => recipe && setDetail(recipe)}>
                    <span>{mealSlotLabel(meal.slot)}</span>
                    <strong>{meal.title}</strong>
                    <small>{formatPortions(meal.portions)}× · {meal.nutrition.kcal} kcal · {Math.round(meal.nutrition.prot)} g P</small>
                    {recipe && <b><SystemIcon name="chevron" /></b>}
                  </button>;
                })}
              </div>
              <p className="ledger-footnote"><SystemIcon name="info" /><span>{copy(
                'Das ist ein anpassbarer Vorschlag, keine bereits protokollierte Mahlzeit. Öffne ein Rezept und erfasse nur die Portion, die du wirklich gegessen hast.',
                'This is an adjustable suggestion, not an already logged meal. Open a recipe and log only the portion you actually ate.',
              )}</span></p>
            </section>
          )}

          {goals && (
            <section className="system-ledger nutrition-target-ledger" aria-labelledby="nutrition-target-title">
              <header className="ledger-heading">
                <span aria-hidden="true"><SystemIcon name="target" /></span>
                <h2 id="nutrition-target-title">{copy('Tagesziele', 'Daily targets')}</h2>
                <small>{profile ? GOAL_LABELS[profile.goal][lang === 'de' ? 'de' : 'en'] : copy('Profilbasiert', 'Profile based')}</small>
              </header>
              {targetDetails?.maintenanceCalories && (
                <div className="nutrition-target-summary">
                  <span><small>{copy('Erhaltung', 'Maintenance')}</small><strong>{targetDetails.maintenanceCalories}<em>kcal</em></strong></span>
                  <span className={(targetDetails.goalAdjustmentCalories ?? 0) < 0 ? 'target-cut' : (targetDetails.goalAdjustmentCalories ?? 0) > 0 ? 'target-gain' : ''}>
                    <small>{(targetDetails.goalAdjustmentCalories ?? 0) < 0 ? copy('Defizit', 'Deficit') : (targetDetails.goalAdjustmentCalories ?? 0) > 0 ? copy('Überschuss', 'Surplus') : copy('Anpassung', 'Adjustment')}</small>
                    <strong>{(targetDetails.goalAdjustmentCalories ?? 0) > 0 ? '+' : ''}{targetDetails.goalAdjustmentCalories ?? 0}<em>kcal</em></strong>
                  </span>
                  <span><small>{copy('Protein-Faktor', 'Protein factor')}</small><strong>{targetDetails.proteinPerKg ?? '—'}<em>g/kg</em></strong></span>
                  <span><small>{copy('Aktivität', 'Activity')}</small><strong className="target-text-value">{targetDetails.activityLevel ? ACTIVITY_LABELS[targetDetails.activityLevel][lang === 'de' ? 'de' : 'en'] : '—'}</strong></span>
                </div>
              )}
              <div className="nutrition-target-rows">
                {bars.map(row => {
                  const target = goals[row.key];
                  const current = consumed[row.key];
                  const progress = target > 0 ? Math.min(1, current / target) : 0;
                  return (
                    <div className="nutrition-target-row" key={row.key}>
                      <span>{row.label}</span>
                      <div className="ledger-progress" role="progressbar" aria-label={row.label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(current)}>
                        <span style={{ transform: `scaleX(${progress})` }} />
                      </div>
                      <strong>{Math.round(current)}<small> / {Math.round(target)} {row.unit}</small></strong>
                    </div>
                  );
                })}
              </div>
              <p className="ledger-footnote nutrition-target-note">
                <SystemIcon name="info" />
                <span>{targetDetails?.note ?? copy('Startschätzung aus deinen Profildaten. Nach 2–3 Wochen am echten Verlauf prüfen.', 'Starting estimate from your profile. Review it against your real 2–3 week trend.')}</span>
              </p>
              <p className="ledger-footnote nutrition-sugar-note">* {copy('Der Zielwert bezieht sich auf freien Zucker; Produktdatenbanken zeigen häufig Gesamtzucker.', 'The target refers to free sugar; product databases often report total sugar.')}</p>
            </section>
          )}

          <div className="food-toolbar" aria-label={copy('Rezeptfilter und Aktionen', 'Recipe filters and actions')}>
            <div className="hub-filters">
              {CATEGORIES.map(item => (
                <button
                  type="button"
                  key={item}
                  className={`chip${category === item ? ' sel' : ''}`}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {t(`cat_${item}`)}
                </button>
              ))}
              {EQUIPMENT.map(item => (
                <button
                  type="button"
                  key={item}
                  className={`chip chip-eq${equipment === item ? ' sel' : ''}`}
                  aria-pressed={equipment === item}
                  onClick={() => setEquipment(equipment === item ? null : item)}
                >
                  <SystemIcon name="equipment" />{t(`eq_${item}`)}
                </button>
              ))}
            </div>
            <button className="system-button food-create-action" type="button" onClick={() => setCreating(true)}>
              <SystemIcon name="plus" />{copy('Eigenes Rezept', 'New recipe')}
            </button>
          </div>

          <div className="dish-grid">
            {visibleDishes.map(baseDish => {
              const dish = locDish(baseDish);
              const recommended = recommendedIds.has(String(baseDish.id));
              return (
                <article className={`dish-card${recommended ? ' dish-card-recommended' : ''}`} key={String(baseDish.id)}>
                  <button className="dish-open" type="button" onClick={() => setDetail(baseDish)} aria-label={`${dish.name} ${copy('öffnen', 'open')}`}>
                    {isOfflineSafeImage(dish.image)
                      ? <img className="dish-thumb" src={dish.image} alt="" loading="lazy" />
                      : <span className={`dish-visual dish-visual-${dish.category}`} aria-hidden="true"><SystemIcon name="food" /></span>}
                    <span className="dish-body">
                      {recommended && <span className="dish-recommendation"><SystemIcon name="target" />{copy('Top-Fit für dein Ziel', 'Top fit for your goal')}</span>}
                      <span className="dish-name">{dish.name}</span>
                      <span className="dish-meta">
                        <span className="dish-cat">{t(`cat_${dish.category}`)}</span>
                        <span className="dish-time"><SystemIcon name="clock" />{dish.prep_min} min</span>
                      </span>
                      <span className="dish-macros">
                        <span className="dm dm-k">{dish.kcal} kcal</span>
                        <span className="dm dm-p">{dish.prot} g P</span>
                        {dish.equipment.filter(item => EQUIPMENT.includes(item)).map(item => (
                          <span className="dm dm-eq" key={item}><SystemIcon name="equipment" />{t(`eq_${item}`)}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                </article>
              );
            })}
            {!rankedDishes.length && (
              <div className="system-empty">
                <SystemIcon name="search" />
                <div><strong>{copy('Keine Rezepte in diesem Filter', 'No recipes in this filter')}</strong><p>{copy('Ändere Kategorie oder Ausstattung.', 'Change the category or equipment filter.')}</p></div>
              </div>
            )}
          </div>

          {visibleCount < rankedDishes.length && (
            <button className="system-button quiet dish-load-more" type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
              {copy('Mehr Rezepte laden', 'Load more recipes')} · {Math.min(PAGE_SIZE, rankedDishes.length - visibleCount)}
            </button>
          )}
        </div>
      </div>

      {detail && <DishDetail dish={detail} onClose={() => setDetail(null)} onLog={(portions) => void logDish(detail, portions)} />}
      {creating && <DishCreator onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {toast && <div className="system-toast" role="status" aria-live="polite"><SystemIcon name="check" /><span>{toast}</span></div>}
    </section>
  );
}

function DishDetail({ dish: sourceDish, onClose, onLog }: { dish: Dish; onClose: () => void; onLog: (portions: number) => void }) {
  const [portions, setPortions] = useState(1);
  const dish = locDish(sourceDish);
  const nutrition = scaleNutrition(nutritionFromDish(dish), portions);
  const adjustPortions = (step: number) => setPortions(current => Math.min(4, Math.max(.5, Math.round((current + step) * 2) / 2)));
  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  return createPortal(
    <div className="hub-modal open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hub-box" role="dialog" aria-modal="true" aria-labelledby="dish-detail-title" onMouseDown={event => event.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title" id="dish-detail-title"><SystemIcon name="food" />{dish.name}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label={copy('Rezept schließen', 'Close recipe')}><SystemIcon name="close" /></button>
        </div>
        <div className="hub-box-body">
          {isOfflineSafeImage(dish.image) && <img className="detail-hero" src={dish.image} alt="" loading="lazy" />}
          <div className="recipe-portion-control">
            <span><small>{copy('Zu protokollierende Menge', 'Amount to log')}</small><strong>{format(portions)} × {copy('Portion', 'serving')}</strong></span>
            <div role="group" aria-label={copy('Portionsmenge einstellen', 'Adjust serving amount')}>
              <button type="button" onClick={() => adjustPortions(-.5)} disabled={portions <= .5} aria-label={copy('Halbe Portion weniger', 'Decrease by half a serving')}>−</button>
              <output aria-live="polite">{format(portions)}</output>
              <button type="button" onClick={() => adjustPortions(.5)} disabled={portions >= 4} aria-label={copy('Halbe Portion mehr', 'Increase by half a serving')}>+</button>
            </div>
          </div>
          <div className="detail-macros">
            <div className="dmx"><b>{format(nutrition.kcal)}</b><span>kcal</span></div>
            <div className="dmx"><b>{format(nutrition.prot)} g</b><span>{copy('Protein', 'Protein')}</span></div>
            <div className="dmx"><b>{format(nutrition.carb)} g</b><span>{copy('Kohlenhydrate', 'Carbohydrates')}</span></div>
            <div className="dmx"><b>{format(nutrition.fat)} g</b><span>{copy('Fett', 'Fat')}</span></div>
            <div className="dmx"><b>{format(nutrition.sug)} g</b><span>{copy('Zucker', 'Sugar')}</span></div>
          </div>
          <p className="recipe-nutrition-basis"><SystemIcon name="info" />{dish.nutritionBasis ?? copy('Nährwerte pro Portion; Mengenänderungen werden direkt neu berechnet.', 'Nutrition per serving; changes in serving amount are recalculated instantly.')}</p>
          <div className="detail-sec"><SystemIcon name="list" />{t('fuel_ingredients')} · <SystemIcon name="clock" />{dish.prep_min} min</div>
          <ul className="ingredient-list">{dish.ingredients.map((ingredient, index) => <li key={`${ingredient}-${index}`}>{scaleIngredientLine(ingredient, portions)}</li>)}</ul>
          {dish.steps && dish.steps.length > 0 && (
            <>
              <div className="detail-sec"><SystemIcon name="food" />{t('fuel_steps')}</div>
              <ol className="step-list">
                {dish.steps.map((step, index) => <li key={`${step}-${index}`}><span className="step-num">{index + 1}</span><span>{step}</span></li>)}
              </ol>
            </>
          )}
          <div className="detail-actions">
            <button className="system-primary-action hub-log-btn" type="button" onClick={() => onLog(portions)}><SystemIcon name="plus" />{copy(`${format(portions)} Portion protokollieren`, `Log ${format(portions)} serving`)}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DishCreator({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('main');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [macros, setMacros] = useState({ kcal: '', prot: '', carb: '', fat: '', sug: '' });
  const [equipment, setEquipment] = useState<string[]>([]);
  const [error, setError] = useState('');
  const number = (value: string) => Number.parseFloat(value) || 0;

  const toggleEquipment = (item: string) => {
    setEquipment(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item]);
  };

  const save = async () => {
    setError('');
    const rawNutrition = {
      kcal: number(macros.kcal),
      prot: number(macros.prot),
      carb: number(macros.carb),
      fat: number(macros.fat),
      sug: number(macros.sug),
    };
    const issues = validateNutrition(rawNutrition);
    if (!name.trim() || !ingredients.trim() || number(prepMinutes) <= 0 || issues.length) {
      setError(issues.some(issue => issue.code === 'sugar-exceeds-carbs')
        ? copy('Zucker darf nicht über den Kohlenhydraten liegen.', 'Sugar cannot exceed carbohydrates.')
        : copy('Name, Zutaten, Zeit und gültige Nährwerte sind erforderlich.', 'Name, ingredients, time, and valid nutrition values are required.'));
      return;
    }
    const nutrition = normalizeNutrition(rawNutrition);

    try {
      await createDish({
        name: name.trim(),
        category,
        prep_min: Math.min(1440, number(prepMinutes)),
        ingredients: ingredients.split('\n').map(value => value.trim()).filter(Boolean),
        steps: steps.split('\n').map(value => value.trim()).filter(Boolean),
        ...nutrition,
        equipment: equipment.length ? equipment : ['none'],
        icon: '',
        image: '',
      });
      onSaved();
    } catch {
      setError(copy('Das Rezept konnte nicht gespeichert werden.', 'The recipe could not be saved.'));
    }
  };

  return createPortal(
    <div className="hub-modal open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hub-box" role="dialog" aria-modal="true" aria-labelledby="dish-creator-title" onMouseDown={event => event.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title" id="dish-creator-title"><SystemIcon name="plus" />{copy('Eigenes Rezept', 'New recipe')}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label={copy('Rezept-Editor schließen', 'Close recipe editor')}><SystemIcon name="close" /></button>
        </div>
        <div className="hub-box-body">
          <label className="system-field wide"><span>{copy('Name', 'Name')}</span><input className="hub-input" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
          <div className="hub-row2">
            <label className="system-field"><span>{copy('Kategorie', 'Category')}</span><select className="hub-input" value={category} onChange={event => setCategory(event.target.value)}>{['breakfast', 'main', 'dessert', 'snack'].map(item => <option key={item} value={item}>{t(`cat_${item}`)}</option>)}</select></label>
            <label className="system-field"><span>{copy('Zubereitung (Minuten)', 'Prep time (minutes)')}</span><input className="hub-input" type="number" inputMode="numeric" min="1" max="1440" value={prepMinutes} onChange={event => setPrepMinutes(event.target.value)} /></label>
          </div>
          <label className="system-field wide"><span>{copy('Zutaten – eine pro Zeile', 'Ingredients — one per line')}</span><textarea className="hub-input hub-area" rows={3} value={ingredients} onChange={event => setIngredients(event.target.value)} /></label>
          <label className="system-field wide"><span>{copy('Schritte – einer pro Zeile', 'Steps — one per line')}</span><textarea className="hub-input hub-area" rows={3} value={steps} onChange={event => setSteps(event.target.value)} /></label>
          <div className="hub-macro-grid hub-macro-grid-five">
            {(['kcal', 'prot', 'carb', 'fat', 'sug'] as const).map(key => (
              <label className="hub-mf" key={key}>
                <span>{key === 'kcal' ? 'kcal' : key === 'prot' ? copy('Protein', 'Protein') : key === 'carb' ? copy('Kohlenhydrate', 'Carbohydrates') : key === 'fat' ? copy('Fett', 'Fat') : copy('Zucker', 'Sugar')}</span>
                <input type="number" inputMode="decimal" min="0" max={NUTRITION_LIMITS[key]} step="0.1" value={macros[key]} aria-invalid={Boolean(error)} onChange={event => setMacros(current => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          <div className="nutrition-estimate">≈ {estimateCaloriesFromMacros({ prot: number(macros.prot), carb: number(macros.carb), fat: number(macros.fat), sug: number(macros.sug) })} {copy('kcal aus den Makros', 'kcal from macros')}</div>
          {error && <div className="fuel-form-error" role="alert">{error}</div>}
          <div className="hub-eq-row">
            {EQUIPMENT.map(item => (
              <button type="button" key={item} className={`chip chip-eq${equipment.includes(item) ? ' sel' : ''}`} aria-pressed={equipment.includes(item)} onClick={() => toggleEquipment(item)}><SystemIcon name="equipment" />{t(`eq_${item}`)}</button>
            ))}
          </div>
          <button className="system-primary-action" type="button" onClick={() => void save()}>{copy('Rezept speichern', 'Save recipe')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
