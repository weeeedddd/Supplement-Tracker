import { getBackendUrl } from './backend';
import { timeoutSignal } from './storage';

export interface IntegrationStatus {
  aiPlan: boolean;
  assistant: boolean;
  nearbyStores: boolean;
}

export interface RemotePlanRequest {
  consent: { share_profile_and_lifestyle: true };
  response_language: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: 'healthy_routine' | 'general_fitness' | 'fat_loss' | 'muscle_gain' | 'performance';
  intensity: 'light' | 'medium' | 'hard';
  training_experience: 'beginner' | 'intermediate' | 'advanced';
  available_days_per_week: number;
  session_minutes: number;
  equipment: string[];
  dietary_preferences: string[];
  lifestyle: {
    daily_routine: string;
    work_pattern: 'mostly_seated' | 'mixed' | 'physically_active' | 'shift_work';
    activity_level: 'low' | 'moderate' | 'high';
    average_sleep_hours: number;
    sleep_quality: 'poor' | 'mixed' | 'good';
    meal_pattern: string;
    cooking_access: 'limited' | 'basic' | 'full';
    stress_level: number;
    movement_constraints: string;
  };
}

export interface RemotePlanEnvelope {
  provider: 'openai';
  model: string;
  generated_at: string;
  provider_storage_requested: false;
  draft: {
    title: string;
    summary: string;
    training_days: Array<{
      day_number: number;
      label: string;
      focus: string;
      duration_minutes: number;
      exercises: Array<{
        name: string;
        sets: number;
        reps_or_duration: string;
        effort_cue: string;
        equipment: string;
      }>;
    }>;
    nutrition: {
      calorie_target_kcal: number;
      protein_target_g: number;
      carbohydrate_target_g: number;
      fat_target_g: number;
      sugar_guidance: string;
      meal_principles: string[];
    };
    recovery: { sleep_target_hours: number; actions: string[] };
    safety_notes: string[];
    assumptions: string[];
  };
  safety_disclaimer: string;
}

export interface NearbyStoresRequest {
  location_consent: true;
  country: string;
  budget: number;
  currency: string;
  address?: string;
  coordinates?: { latitude: number; longitude: number };
  radius_meters?: number;
  max_results?: number;
  language_code?: string;
}

export interface StoreLocation {
  provider_id: string;
  name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  maps_uri: string;
  primary_type: string;
  provider: 'google_maps';
}

export interface NearbyStoresEnvelope {
  provider: 'google_maps';
  fetched_at: string;
  location_source: 'address' | 'coordinates';
  results: StoreLocation[];
  budget_context: {
    amount: number;
    currency: string;
    price_comparison_available: false;
  };
  notice: string;
}

export interface RemoteAssistantRequest {
  consent_to_remote_ai: true;
  response_language: string;
  question: string;
  profile_context?: {
    age: number;
    goal: 'healthy_routine' | 'general_fitness' | 'fat_loss' | 'muscle_gain' | 'performance';
    activity_level: 'low' | 'moderate' | 'high';
    average_sleep_hours: number;
    dietary_preferences: string[];
    daily_routine_summary?: string;
  };
  plan_context?: {
    plan_title?: string;
    training_summary?: string;
    nutrition_summary?: string;
    calorie_target_kcal?: number;
    protein_target_g?: number;
  };
}

export interface RemoteAssistantEnvelope {
  provider: 'openai';
  model: string;
  generated_at: string;
  provider_storage_requested: false;
  answer: string;
  safety_notes: string[];
  escalation: 'none' | 'routine_professional' | 'urgent';
}

export class IntegrationRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'IntegrationRequestError';
    this.status = status;
  }
}

function configuredBase(): string {
  const base = getBackendUrl();
  if (!base) {
    throw new IntegrationRequestError('No secure backend URL is configured. Local features remain available.', 0);
  }
  return base;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { detail?: unknown };
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
  } catch {
    // Fall through to a stable message; never expose provider internals.
  }
  if (response.status === 429) return 'Too many requests. Please wait and try again.';
  if (response.status === 503) return 'The secure integration is not configured or temporarily unavailable.';
  return `The secure integration returned status ${response.status}.`;
}

async function requestJson<T>(path: string, init: RequestInit, timeoutMs = 20_000): Promise<T> {
  const base = configuredBase();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: timeoutSignal(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntegrationRequestError('The secure integration timed out.');
    }
    throw new IntegrationRequestError('The secure integration could not be reached.');
  }
  if (!response.ok) throw new IntegrationRequestError(await readError(response), response.status);
  try {
    return await response.json() as T;
  } catch {
    throw new IntegrationRequestError('The secure integration returned an invalid response.', response.status);
  }
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const result = await requestJson<Record<string, unknown>>('/api/v1/integrations/status', { method: 'GET' }, 6_000);
  const ai = result.ai && typeof result.ai === 'object' ? result.ai as Record<string, unknown> : {};
  const stores = result.stores && typeof result.stores === 'object' ? result.stores as Record<string, unknown> : {};
  const aiPlan = ai.available === true;
  const assistant = ai.available === true;
  const nearbyStores = stores.available === true;
  return { aiPlan, assistant, nearbyStores };
}

export function requestRemotePlan(request: RemotePlanRequest): Promise<RemotePlanEnvelope> {
  return requestJson('/api/v1/plan/draft', { method: 'POST', body: JSON.stringify(request) }, 35_000);
}

export function requestNearbyStores(request: NearbyStoresRequest): Promise<NearbyStoresEnvelope> {
  return requestJson('/api/v1/stores/nearby', { method: 'POST', body: JSON.stringify(request) }, 18_000);
}

export function requestRemoteAssistant(request: RemoteAssistantRequest): Promise<RemoteAssistantEnvelope> {
  return requestJson('/api/v1/assistant/respond', { method: 'POST', body: JSON.stringify(request) }, 25_000);
}
