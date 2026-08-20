import type { Macros } from './engine';
import type { TrainingGoal } from './plans';
import type { ScanResult } from './scanner';

export type FoodRating = 'poor' | 'limited' | 'good' | 'optimal';

export interface ScanAssessment {
  score: number;
  rating: FoodRating;
  label: string;
  verdict: string;
  facts: string[];
  goalLabel: string;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const percentage = (part: number, total: number): number => total > 0 ? part / total : 0;

const GOAL_LABELS: Record<TrainingGoal, { de: string; en: string }> = {
  general_fitness: { de: 'allgemeine Fitness', en: 'general fitness' },
  build_muscle: { de: 'kontrollierten Muskelaufbau', en: 'controlled muscle gain' },
  get_stronger: { de: 'Kraftaufbau', en: 'strength gain' },
  fat_loss: { de: 'Muskelhalt im Defizit', en: 'muscle retention in a deficit' },
};

function localizedRating(rating: FoodRating, language: 'de' | 'en'): string {
  const labels: Record<FoodRating, { de: string; en: string }> = {
    poor: { de: 'Schwach', en: 'Poor' },
    limited: { de: 'Bedingt', en: 'Limited' },
    good: { de: 'Gut', en: 'Good' },
    optimal: { de: 'Optimal', en: 'Optimal' },
  };
  return labels[rating][language];
}

export function assessFoodForGoal(
  result: ScanResult,
  targets: Macros | null,
  consumed: Macros,
  goal: TrainingGoal,
  language: 'de' | 'en' = 'en',
): ScanAssessment {
  const macros = result.macros;
  const calories = Math.max(0, macros.kcal);
  const proteinDensity = calories > 0 ? macros.prot / calories * 100 : 0;
  const sugarEnergyShare = percentage(macros.sug * 4, calories);
  const fatEnergyShare = percentage(macros.fat * 9, calories);
  const remainingCalories = targets ? Math.max(0, targets.kcal - consumed.kcal) : null;
  const remainingProtein = targets ? Math.max(0, targets.prot - consumed.prot) : null;
  const fiber = result.details?.fiber ?? 0;
  const saturatedFatShare = percentage((result.details?.saturatedFat ?? 0) * 9, calories);

  if (calories <= 5 && macros.sug <= 1) {
    return {
      score: 82,
      rating: 'optimal',
      label: localizedRating('optimal', language),
      verdict: language === 'de'
        ? 'Nahezu energiefrei und zuckerarm – passt problemlos in dein Tagesziel.'
        : 'Nearly calorie-free and low in sugar — it fits your daily target easily.',
      facts: [
        language === 'de' ? '0–5 kcal pro Portion' : '0–5 kcal per serving',
        language === 'de' ? 'Kein relevanter Zuckeranteil' : 'No meaningful sugar load',
      ],
      goalLabel: GOAL_LABELS[goal][language],
    };
  }

  let score = 48;
  score += clamp(proteinDensity * 2.4, 0, 25);
  score += clamp(fiber * 1.3, 0, 9);
  score -= clamp((sugarEnergyShare - .1) * 55, 0, 22);
  score -= clamp((fatEnergyShare - .5) * 35, 0, 13);
  score -= clamp((saturatedFatShare - .1) * 55, 0, 12);

  if (goal === 'fat_loss') {
    score += clamp((proteinDensity - 5) * 1.5, -8, 12);
    if (targets && calories <= targets.kcal * .25) score += 6;
    if (targets && calories > targets.kcal * .4) score -= 10;
  } else if (goal === 'build_muscle') {
    if (macros.prot >= 25) score += 8;
    if (remainingProtein !== null && remainingProtein > 0) score += clamp(macros.prot / remainingProtein * 12, 0, 8);
    if (macros.carb >= 25 && sugarEnergyShare < .2) score += 4;
  } else if (goal === 'get_stronger') {
    if (macros.prot >= 20) score += 6;
    if (macros.carb >= 25 && sugarEnergyShare < .2) score += 5;
  } else {
    if (macros.prot >= 20) score += 5;
    if (fatEnergyShare >= .15 && fatEnergyShare <= .4) score += 3;
  }

  if (remainingCalories !== null) {
    if (remainingCalories === 0 && calories > 50) score -= 18;
    else if (calories > remainingCalories * 1.15) score -= 14;
    else if (calories <= remainingCalories) score += 4;
  }

  score = Math.round(clamp(score, 0, 100));
  const rating: FoodRating = score >= 78 ? 'optimal' : score >= 62 ? 'good' : score >= 42 ? 'limited' : 'poor';
  const highProtein = proteinDensity >= 8 || macros.prot >= 30;
  const highSugar = sugarEnergyShare >= .25 || (macros.sug >= 20 && macros.prot < 15);
  const energyOverflow = remainingCalories !== null && calories > remainingCalories * 1.15;
  const highFatLowProtein = fatEnergyShare > .55 && proteinDensity < 6;

  let verdict: string;
  if (energyOverflow) {
    verdict = language === 'de'
      ? `Diese Portion liegt über deinen verbleibenden ${Math.round(remainingCalories ?? 0)} kcal – Portion verkleinern oder bewusst einplanen.`
      : `This serving exceeds your remaining ${Math.round(remainingCalories ?? 0)} kcal — reduce the portion or plan it deliberately.`;
  } else if (highProtein && !highSugar && goal === 'fat_loss') {
    verdict = language === 'de'
      ? 'Hohe Proteindichte bei kontrollierten Kalorien – starker Fit für Muskelhalt im Defizit.'
      : 'High protein density with controlled calories — a strong fit for muscle retention in a deficit.';
  } else if (highProtein && !highSugar && goal === 'build_muscle') {
    verdict = language === 'de'
      ? 'Viel Protein bei niedrigem Zuckeranteil – passend für einen kontrollierten Muskelaufbau.'
      : 'High protein with a low sugar share — well suited to controlled muscle gain.';
  } else if (highSugar) {
    verdict = language === 'de'
      ? 'Hoher Zuckeranteil bei geringer Proteindichte – für dein aktuelles Ziel nur bedingt passend.'
      : 'High sugar share with low protein density — only a limited fit for your current target.';
  } else if (highFatLowProtein) {
    verdict = language === 'de'
      ? 'Ein großer Energieanteil kommt aus Fett, aber wenig aus Protein – Portionsgröße bewusst wählen.'
      : 'A large share of energy comes from fat with little protein — choose the portion deliberately.';
  } else if (macros.prot >= 20) {
    verdict = language === 'de'
      ? 'Solide Proteinmenge und brauchbare Makroverteilung für dein aktuelles Tagesziel.'
      : 'Solid protein and a useful macro split for your current daily target.';
  } else {
    verdict = language === 'de'
      ? 'Kann in den Tag passen, liefert für dein Ziel aber nur wenig Protein pro Kalorie.'
      : 'It can fit the day, but supplies relatively little protein per calorie for your goal.';
  }

  const facts = [
    language === 'de'
      ? `${proteinDensity.toFixed(1)} g Protein je 100 kcal`
      : `${proteinDensity.toFixed(1)} g protein per 100 kcal`,
    language === 'de'
      ? `${Math.round(sugarEnergyShare * 100)} % der Energie aus Zucker`
      : `${Math.round(sugarEnergyShare * 100)}% of energy from sugar`,
  ];
  if (remainingCalories !== null) facts.push(language === 'de'
    ? `${Math.round(Math.max(0, remainingCalories - calories))} kcal danach übrig`
    : `${Math.round(Math.max(0, remainingCalories - calories))} kcal left afterward`);
  else if (fiber > 0) facts.push(language === 'de' ? `${fiber.toFixed(1)} g Ballaststoffe` : `${fiber.toFixed(1)} g fiber`);

  return {
    score,
    rating,
    label: localizedRating(rating, language),
    verdict,
    facts,
    goalLabel: GOAL_LABELS[goal][language],
  };
}

