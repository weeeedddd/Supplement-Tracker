import { describe, expect, it } from 'vitest';

import type { AiPlanRequest } from '../components/AuthScreens';
import { buildRemotePlanRequest, remoteEnvelopeToInitialPlan } from './remotePlan';
import type { RemotePlanEnvelope } from './integrations';

const request: AiPlanRequest = {
  consentedAt: '2026-08-08T10:00:00.000Z',
  context: {
    schemaVersion: 3,
    age: 31,
    heightCm: 178,
    weightKg: 79,
    goal: 'build_muscle',
    experience: 'intermediate',
    daysPerWeek: 4,
    equipment: ['bodyweight', 'dumbbells'],
    diet: 'omnivore',
    dietaryPreferences: ['high protein'],
    difficulty: 'medium',
    mode: 'guided',
    lifestyle: {
      workStudyPattern: 'Desk job with a regular daytime schedule',
      typicalDay: `Commute, office work and evening training. ${'x'.repeat(1_400)}`,
      activityContext: 'Mostly seated with 7,000 steps',
      sleepDurationHours: 7.25,
      sleepQuality: 'good',
      mealRhythm: 'Breakfast, canteen lunch, dinner at home',
      cookingAccess: 'full',
      allergiesExclusions: ['peanuts'],
      injuriesLimitations: 'Avoid painful overhead movement',
    },
  },
};

const envelope: RemotePlanEnvelope = {
  provider: 'openai',
  model: 'test-model',
  generated_at: '2026-08-08T10:01:00.000Z',
  provider_storage_requested: false,
  draft: {
    title: 'Balanced strength week',
    summary: 'A progressive four-day starting week.',
    training_days: [{
      day_number: 1,
      label: 'Day one',
      focus: 'Full-body foundations',
      duration_minutes: 50,
      exercises: [{
        name: 'Dumbbell squat',
        sets: 3,
        reps_or_duration: '8–10 controlled reps',
        effort_cue: 'Leave 2–3 reps in reserve',
        equipment: 'dumbbells',
      }],
    }],
    nutrition: {
      calorie_target_kcal: 2_500,
      protein_target_g: 150,
      carbohydrate_target_g: 320,
      fat_target_g: 70,
      sugar_guidance: 'Prefer minimally processed foods most of the time.',
      meal_principles: ['Include a protein source in each main meal.'],
    },
    recovery: { sleep_target_hours: 8, actions: ['Keep a consistent sleep window.'] },
    safety_notes: ['Stop a movement if it causes pain.'],
    assumptions: ['Equipment is available as listed.'],
  },
  safety_disclaimer: 'General fitness guidance only.',
};

describe('remote plan privacy boundary', () => {
  it('maps only the consented planning context and caps free text', () => {
    const remote = buildRemotePlanRequest(request);
    const serialized = JSON.stringify(remote);

    expect(remote).toMatchObject({
      consent: { share_profile_and_lifestyle: true },
      goal: 'muscle_gain',
      available_days_per_week: 4,
      session_minutes: 50,
      lifestyle: {
        work_pattern: 'mostly_seated',
        activity_level: 'low',
        average_sleep_hours: 7.25,
        cooking_access: 'full',
      },
    });
    expect(remote.lifestyle.daily_routine).toHaveLength(1_200);
    expect(remote.dietary_preferences).toContain('Exclude: peanuts');
    expect(serialized).not.toMatch(/displayName|appearance|address|food_log|workout_log|supplement_log|consentedAt/);
  });

  it('adapts a bounded server response without introducing supplement dosing', () => {
    const plan = remoteEnvelopeToInitialPlan(envelope, request);
    const serialized = JSON.stringify(plan).toLowerCase();

    expect(plan).toMatchObject({
      generator: 'openai-plan-v1',
      createdAt: envelope.generated_at,
      difficulty: 'medium',
      nutritionTargets: {
        calories: 2_500,
        protein: 150,
        carbs: 320,
        fat: 70,
        sugar: 63,
        method: 'openai-estimate-v1',
      },
    });
    expect(plan.sessions[0]?.exercises[0]).toMatchObject({ movement: 'squat', equipment: 'dumbbells', sets: 3 });
    expect(plan.safetyNotes).toContain('General fitness guidance only.');
    expect(serialized).not.toMatch(/\b\d+\s?(mg|iu)\b/);
  });
});
