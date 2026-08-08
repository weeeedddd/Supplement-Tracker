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

export function buildRemotePlanRequest({ context }: AiPlanRequest): RemotePlanRequest {
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
    response_language: 'de',
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
  const draft = response.draft;
  const sessions = draft.training_days.map((day) => ({
    day: day.day_number,
    title: day.label,
    focus: day.focus,
    durationMinutes: day.duration_minutes,
    warmup: 'Begin with 5–8 minutes of easy movement and comfortable practice repetitions.',
    exercises: day.exercises.map((exercise, index) => ({
      id: `ai-${day.day_number}-${index + 1}`,
      name: exercise.name,
      movement: movementFromExercise(exercise.name),
      equipment: equipmentFromRemote(exercise.equipment),
      sets: exercise.sets,
      reps: exercise.reps_or_duration,
      effort: exercise.effort_cue,
    })),
    cooldown: 'Finish with a few minutes of easy movement. Stop if a movement causes pain or unusual symptoms.',
  }));
  const sugarReference = Math.round(draft.nutrition.calorie_target_kcal * 0.1 / 4);

  return {
    schemaVersion: 1,
    generator: 'openai-plan-v1',
    createdAt: response.generated_at,
    sourceLabel: 'Secure AI plan',
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
      note: `${draft.nutrition.sugar_guidance} Starting estimates only; review using energy, appetite and progress.`,
    },
    recoveryGuidance: [
      `Sleep planning target: ${draft.recovery.sleep_target_hours} hours.`,
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
