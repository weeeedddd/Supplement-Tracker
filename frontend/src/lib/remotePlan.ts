import type { AiPlanRequest } from '../components/AuthScreens';
import { requestRemotePlan, type RemotePlanEnvelope, type RemotePlanRequest } from './integrations';
import type { EquipmentOption, InitialPlan, PlanExercise, TrainingGoal } from './plans';

const GOAL_MAP: Record<TrainingGoal, RemotePlanRequest['goal']> = {
  general_fitness: 'general_fitness',
  build_muscle: 'muscle_gain',
  get_stronger: 'performance',
  fat_loss: 'fat_loss',
};

function inferWorkPattern(text = ''): RemotePlanRequest['lifestyle']['work_pattern'] {
  const value = text.toLowerCase();
  if (/shift|night|schicht/.test(value)) return 'shift_work';
  if (/physical|manual|construction|warehouse|körperlich|lager|bau/.test(value)) return 'physically_active';
  if (/desk|office|seated|sitting|büro|sitz/.test(value)) return 'mostly_seated';
  return 'mixed';
}

function inferActivity(text = ''): RemotePlanRequest['lifestyle']['activity_level'] {
  const value = text.toLowerCase();
  if (/high|active|physical|10k|10000|viel|körperlich/.test(value)) return 'high';
  if (/low|sedentary|seated|desk|wenig|sitz/.test(value)) return 'low';
  return 'moderate';
}

function equipmentFromRemote(value: string): EquipmentOption {
  const normalized = value.toLowerCase();
  if (/dumbbell|kurzhantel/.test(normalized)) return 'dumbbells';
  if (/band/.test(normalized)) return 'resistance_bands';
  if (/gym|machine|barbell|cable|studio/.test(normalized)) return 'full_gym';
  return 'bodyweight';
}

function movementFromExercise(name: string): PlanExercise['movement'] {
  const normalized = name.toLowerCase();
  if (/squat|lunge|leg press|step-up/.test(normalized)) return 'squat';
  if (/deadlift|hinge|bridge|pull-through/.test(normalized)) return 'hinge';
  if (/press|push-up|dip/.test(normalized)) return 'push';
  if (/row|pull|pulldown/.test(normalized)) return 'pull';
  if (/carry/.test(normalized)) return 'carry';
  if (/plank|dead bug|core/.test(normalized)) return 'core';
  if (/mobility|stretch|flow/.test(normalized)) return 'mobility';
  return 'conditioning';
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function assertBoundedRemotePlan(response: RemotePlanEnvelope): void {
  const candidate = response as unknown as Record<string, unknown>;
  const draft = candidate.draft as Record<string, unknown> | undefined;
  const days = draft?.training_days;
  const nutrition = draft?.nutrition as Record<string, unknown> | undefined;
  const recovery = draft?.recovery as Record<string, unknown> | undefined;
  const safetyNotes = draft?.safety_notes;
  if (
    candidate.provider !== 'openai'
    || candidate.provider_storage_requested !== false
    || !isBoundedText(candidate.generated_at, 80)
    || !draft
    || !isBoundedText(draft.summary, 1_000)
    || !Array.isArray(days)
    || days.length < 1
    || days.length > 6
    || !nutrition
    || !recovery
    || !Array.isArray(safetyNotes)
    || safetyNotes.length < 1
    || safetyNotes.length > 10
    || safetyNotes.some(note => !isBoundedText(note, 500))
    || !isBoundedText(candidate.safety_disclaimer, 1_000)
  ) throw new Error('Remote plan response failed runtime validation.');

  const validDay = days.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const day = value as Record<string, unknown>;
    const exercises = day.exercises;
    return Number.isInteger(day.day_number)
      && Number(day.day_number) >= 1
      && Number(day.day_number) <= 7
      && isBoundedText(day.label, 120)
      && isBoundedText(day.focus, 240)
      && Number.isFinite(day.duration_minutes)
      && Number(day.duration_minutes) >= 10
      && Number(day.duration_minutes) <= 120
      && Array.isArray(exercises)
      && exercises.length >= 1
      && exercises.length <= 10
      && exercises.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const exercise = item as Record<string, unknown>;
        return isBoundedText(exercise.name, 120)
          && Number.isInteger(exercise.sets)
          && Number(exercise.sets) >= 1
          && Number(exercise.sets) <= 6
          && isBoundedText(exercise.reps_or_duration, 100)
          && isBoundedText(exercise.effort_cue, 240)
          && isBoundedText(exercise.equipment, 80);
      });
  });
  const boundedNumber = (value: unknown, minimum: number, maximum: number) => Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
  const mealPrinciples = nutrition.meal_principles;
  const recoveryActions = recovery.actions;
  if (
    !validDay
    || !boundedNumber(nutrition.calorie_target_kcal, 1_200, 4_500)
    || !boundedNumber(nutrition.protein_target_g, 0, 250)
    || !boundedNumber(nutrition.carbohydrate_target_g, 0, 700)
    || !boundedNumber(nutrition.fat_target_g, 0, 140)
    || !isBoundedText(nutrition.sugar_guidance, 500)
    || !Array.isArray(mealPrinciples)
    || mealPrinciples.length < 1
    || mealPrinciples.length > 10
    || mealPrinciples.some(item => !isBoundedText(item, 300))
    || !boundedNumber(recovery.sleep_target_hours, 0, 16)
    || !Array.isArray(recoveryActions)
    || recoveryActions.length > 10
    || recoveryActions.some(item => !isBoundedText(item, 300))
  ) throw new Error('Remote plan response exceeded safety bounds.');
}

export function buildRemotePlanRequest({ context, responseLanguage }: AiPlanRequest): RemotePlanRequest {
  const routine = (context.lifestyle.typicalDay
    ?? context.lifestyle.workStudyPattern
    ?? 'No additional daily-routine detail provided.').slice(0, 1_200);
  const activity = context.lifestyle.activityContext ?? context.lifestyle.workStudyPattern ?? '';
  const mealPattern = context.lifestyle.mealRhythm ?? 'No additional meal-pattern detail provided.';
  const dietEntries = [context.diet, ...context.dietaryPreferences].map((item) => item.slice(0, 80));
  if (context.lifestyle.allergiesExclusions?.length) {
    dietEntries.push(...context.lifestyle.allergiesExclusions.map((item) => `Exclude: ${item}`.slice(0, 80)));
  }

  return {
    consent: { share_profile_and_lifestyle: true },
    response_language: responseLanguage,
    age: context.age,
    height_cm: context.heightCm,
    weight_kg: context.weightKg,
    goal: GOAL_MAP[context.goal],
    intensity: context.difficulty,
    training_experience: context.experience,
    available_days_per_week: context.daysPerWeek,
    session_minutes: context.difficulty === 'light' ? 35 : context.difficulty === 'hard' ? 65 : 50,
    equipment: context.equipment,
    dietary_preferences: [...new Set(dietEntries)].slice(0, 12),
    lifestyle: {
      daily_routine: routine,
      work_pattern: inferWorkPattern(context.lifestyle.workStudyPattern),
      activity_level: inferActivity(activity),
      average_sleep_hours: context.lifestyle.sleepDurationHours ?? 7.5,
      sleep_quality: context.lifestyle.sleepQuality === 'good'
        ? 'good'
        : context.lifestyle.sleepQuality === 'poor' ? 'poor' : 'mixed',
      meal_pattern: mealPattern,
      cooking_access: context.lifestyle.cookingAccess === 'full'
        ? 'full'
        : context.lifestyle.cookingAccess === 'limited' ? 'basic' : 'limited',
      stress_level: 3,
      movement_constraints: (context.lifestyle.injuriesLimitations ?? '').slice(0, 500),
    },
  };
}

export function remoteEnvelopeToInitialPlan(response: RemotePlanEnvelope, request: AiPlanRequest): InitialPlan {
  assertBoundedRemotePlan(response);
  const draft = response.draft;
  const isGerman = request.responseLanguage === 'de';
  const sessions = draft.training_days.map((day) => ({
    day: day.day_number,
    title: day.label,
    focus: day.focus,
    durationMinutes: day.duration_minutes,
    warmup: isGerman
      ? 'Beginne mit 5–8 Minuten lockerer Bewegung und angenehmen Übungswiederholungen.'
      : 'Begin with 5–8 minutes of easy movement and comfortable practice repetitions.',
    exercises: day.exercises.map((exercise, index) => ({
      id: `ai-${day.day_number}-${index + 1}`,
      name: exercise.name,
      movement: movementFromExercise(exercise.name),
      equipment: equipmentFromRemote(exercise.equipment),
      sets: exercise.sets,
      reps: exercise.reps_or_duration,
      effort: exercise.effort_cue,
    })),
    cooldown: isGerman
      ? 'Beende die Einheit mit einigen Minuten lockerer Bewegung. Stoppe, wenn eine Bewegung Schmerzen oder ungewöhnliche Symptome auslöst.'
      : 'Finish with a few minutes of easy movement. Stop if a movement causes pain or unusual symptoms.',
  }));
  const sugarReference = Math.min(
    draft.nutrition.carbohydrate_target_g,
    Math.round(draft.nutrition.calorie_target_kcal * 0.1 / 4),
  );

  return {
    schemaVersion: 1,
    generator: 'openai-plan-v1',
    createdAt: response.generated_at,
    sourceLabel: isGerman ? 'Sicherer KI-Plan' : 'Secure AI plan',
    emphasis: draft.summary,
    difficulty: request.context.difficulty,
    experience: request.context.experience,
    daysPerWeek: sessions.length,
    sessions,
    nutritionTargets: {
      calories: draft.nutrition.calorie_target_kcal,
      protein: draft.nutrition.protein_target_g,
      carbs: draft.nutrition.carbohydrate_target_g,
      fat: draft.nutrition.fat_target_g,
      sugar: sugarReference,
      method: 'openai-estimate-v1',
      note: `${draft.nutrition.sugar_guidance} ${isGerman ? 'Nur Startwerte; prüfe sie anhand von Energie, Appetit und Verlauf.' : 'Starting estimates only; review using energy, appetite and progress.'}`,
    },
    recoveryGuidance: [
      isGerman
        ? `Orientierungswert für die Schlafplanung: ${draft.recovery.sleep_target_hours} Stunden.`
        : `Sleep planning target: ${draft.recovery.sleep_target_hours} hours.`,
      ...draft.recovery.actions,
    ].join(' '),
    foodGuidance: draft.nutrition.meal_principles.join(' '),
    safetyNotes: [...draft.safety_notes, response.safety_disclaimer],
  };
}

export async function requestAiInitialPlan(request: AiPlanRequest): Promise<InitialPlan | null> {
  const response = await requestRemotePlan(buildRemotePlanRequest(request));
  return remoteEnvelopeToInitialPlan(response, request);
}
