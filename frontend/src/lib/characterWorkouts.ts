import type { Workout } from './fitness';
import { targetsForMovement } from './exerciseMuscles';
import type { InitialPlan, InspirationProfileId, PlanLanguage } from './plans';
import { S } from './storage';

export function starterWorkoutsFromPlan(
  plan: InitialPlan,
  inspirationProfile: InspirationProfileId | undefined,
  language: PlanLanguage,
): Workout[] {
  const dayLabel = language === 'de' ? 'Tag' : 'Day';
  return plan.sessions.map((session) => ({
    id: inspirationProfile
      ? `starter-${inspirationProfile}-${session.day}`
      : `starter-${session.day}`,
    name: `${plan.sourceLabel} / ${dayLabel} ${session.day}`,
    kind: 'fullbody',
    focus: session.focus,
    icon: '◇',
    is_preset: false,
    source: 'generated',
    inspirationProfile,
    exercises: session.exercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weight: exercise.equipment === 'bodyweight' ? 'bodyweight' : 'as available',
      rest: 90,
      movement: exercise.movement,
      muscleTargets: exercise.muscleTargets?.map(target => ({ ...target })) ?? targetsForMovement(exercise.movement),
    })),
  }));
}

export function replaceStarterWorkouts(
  plan: InitialPlan,
  inspirationProfile: InspirationProfileId | undefined,
  language: PlanLanguage,
): Workout[] {
  const existingWorkouts = (S.get<Workout[]>('train_user_plans') || [])
    .filter(workout => !String(workout.id).startsWith('starter-'));
  const next = [
    ...existingWorkouts,
    ...starterWorkoutsFromPlan(plan, inspirationProfile, language),
  ];
  S.set('train_user_plans', next);
  return next;
}
