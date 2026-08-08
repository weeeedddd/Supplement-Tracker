import { useMemo, useState, type FormEvent } from 'react';

import type { DietPreference, EquipmentOption, TrainingGoal } from '../lib/plans';
import { getBackendUrl } from '../lib/backend';
import { requestRemoteAssistant } from '../lib/integrations';
import { SystemIcon } from './SystemIcon';
import '../assistant.css';

export interface AssistantContext {
  displayName?: string;
  age?: number;
  weightKg?: number;
  goal?: TrainingGoal;
  diet?: DietPreference;
  dietaryPreferences?: string[];
  equipment?: EquipmentOption[];
  planSummary?: string;
  lifestyleSummary?: string;
  activityLevel?: 'low' | 'moderate' | 'high';
  averageSleepHours?: number;
  planTitle?: string;
  nutritionSummary?: string;
  calorieTargetKcal?: number;
  proteinTargetG?: number;
}

export type AssistantTopic = 'protein' | 'substitution' | 'shopping' | 'safety' | 'general';

export interface AssistantReply {
  topic: AssistantTopic;
  text: string;
  disclosure: string;
  contextUsed: boolean;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface ProductSearchRequest {
  query: string;
  countryCode: string;
  budget: Money;
  store?: string;
}

export interface ProductOffer {
  id: string;
  name: string;
  store: string;
  countryCode: string;
  price: Money;
  productUrl: string;
  verifiedAt: string;
}

export interface ProductSearchResult {
  request: ProductSearchRequest;
  retrievedAt: string;
  offers: ProductOffer[];
}

export interface ProductSearchProvider {
  search(request: ProductSearchRequest): Promise<ProductSearchResult>;
}

export interface ProductSearchDraft {
  query: string;
  countryCode: string;
  budgetAmount: number;
  currency: string;
  store?: string;
}

export type ProductSearchDraftResult =
  | { ok: true; value: ProductSearchRequest }
  | { ok: false; errors: Array<keyof ProductSearchDraft> };

const LOCAL_DISCLOSURE = 'Local rules generate these suggestions on this device. This is not a live AI service, and live product search is not connected.';

export function createProductSearchRequest(draft: ProductSearchDraft): ProductSearchDraftResult {
  const errors: Array<keyof ProductSearchDraft> = [];
  const query = draft.query?.trim() || '';
  const countryCode = draft.countryCode?.trim().toUpperCase() || '';
  const currency = draft.currency?.trim().toUpperCase() || '';
  const store = draft.store?.trim();

  if (!query || query.length > 120) errors.push('query');
  if (!/^[A-Z]{2}$/.test(countryCode)) errors.push('countryCode');
  if (!Number.isFinite(draft.budgetAmount) || draft.budgetAmount <= 0 || draft.budgetAmount > 100_000) errors.push('budgetAmount');
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency');
  if (store && store.length > 80) errors.push('store');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      query,
      countryCode,
      budget: { amount: draft.budgetAmount, currency },
      ...(store ? { store } : {}),
    },
  };
}

export function filterFreshProductOffers(
  offers: ProductOffer[],
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
): ProductOffer[] {
  return offers.filter((offer) => {
    const verifiedAt = Date.parse(offer.verifiedAt);
    const age = now - verifiedAt;
    if (!Number.isFinite(verifiedAt) || age < 0 || age > maxAgeMs) return false;
    try {
      const url = new URL(offer.productUrl);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

function hasContext(context?: AssistantContext): context is AssistantContext {
  return Boolean(context && Object.keys(context).length > 0);
}

function foodProteinReply(contextUsed: boolean, context?: AssistantContext): string {
  if (contextUsed && context?.weightKg && context.weightKg >= 35 && context.weightKg <= 250) {
    const low = Math.round(context.weightKg * 1.2);
    const high = Math.round(context.weightKg * 1.6);
    return `A general food-first planning range for an active adult at ${context.weightKg} kg is ${low}-${high} g of protein across the day. Spread protein foods across regular meals and adjust for appetite and tolerance. This is a planning reference, not a prescription; kidney disease, pregnancy, an eating-disorder history, or other clinical needs call for individual advice.`;
  }
  return 'For general planning, build each main meal around a protein food and spread those foods across the day. A registered dietitian can set an individual target when medical history, pregnancy, kidney health, or an eating-disorder history may change what is appropriate.';
}

function substitutionReply(contextUsed: boolean, context?: AssistantContext): string {
  if (contextUsed && (context?.diet === 'vegetarian' || context?.diet === 'vegan')) {
    return 'For a protein-food swap, try tofu, tempeh, lentils, beans, textured soy, or a mixed bean-and-grain dish. Match the role in the meal: use firm tofu or tempeh for a main item, and lentils or beans for bowls, soups, and sauces. Check allergens and labels rather than assuming two products are nutritionally identical.';
  }
  return 'Swap by function rather than by brand: choose another protein food for the main item, another carbohydrate source for training fuel, or another fruit or vegetable for variety. Compare portions, allergens, and the nutrition label; a substitution does not need to be nutritionally identical to be useful.';
}

function shoppingReply(contextUsed: boolean, context?: AssistantContext): string {
  const dietNote = contextUsed && context?.diet
    ? `For a ${context.diet.replace('_', ' ')} pattern, `
    : '';
  return `${dietNote}start with a short list: two flexible protein foods, two produce options, one easy carbohydrate staple, and one backup meal. Live prices and links are not connected, so I will not invent a product, price, retailer result, or URL. Country, budget, and preferred store can be prepared for a future verified search provider below.`;
}

export function buildLocalAssistantReply(
  question: string,
  options: { context?: AssistantContext; useContext?: boolean } = {},
): AssistantReply {
  const normalized = question.trim().toLowerCase();
  const contextUsed = Boolean(options.useContext && hasContext(options.context));
  const context = contextUsed ? options.context : undefined;

  if (/pain|hurt|injur|dizz|faint|chest|numb|swelling/.test(normalized)) {
    return {
      topic: 'safety',
      text: 'Stop the painful movement and do not use this assistant to diagnose or work around symptoms. Sudden or severe symptoms, chest pain, faintness, or trouble breathing need urgent medical attention; otherwise, ask a qualified clinician or physiotherapist to assess the issue before changing the plan.',
      disclosure: LOCAL_DISCLOSURE,
      contextUsed,
    };
  }
  if (/shop|store|budget|cheap|price|buy|grocery|einkauf/.test(normalized)) {
    return { topic: 'shopping', text: shoppingReply(contextUsed, context), disclosure: LOCAL_DISCLOSURE, contextUsed };
  }
  if (/substitut|replace|instead of|alternative|swap|ersetzen/.test(normalized)) {
    return { topic: 'substitution', text: substitutionReply(contextUsed, context), disclosure: LOCAL_DISCLOSURE, contextUsed };
  }
  if (/protein|proteine|eiwei/.test(normalized)) {
    return { topic: 'protein', text: foodProteinReply(contextUsed, context), disclosure: LOCAL_DISCLOSURE, contextUsed };
  }
  return {
    topic: 'general',
    text: 'I can help with food-first protein planning, ingredient substitutions, a practical shopping list, or questions about your saved starter plan. Ask one specific question. For symptoms, diagnoses, medication interactions, pregnancy, or clinical nutrition, use a qualified professional.',
    disclosure: LOCAL_DISCLOSURE,
    contextUsed,
  };
}

interface AssistantMessage {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  mode?: 'local' | 'openai' | 'system';
}

export interface AssistantProps {
  context?: AssistantContext;
  title?: string;
  className?: string;
  onOpenShopping?: () => void;
}

const QUICK_PROMPTS = [
  'Plane proteinreiche Lebensmittel',
  'Schlage eine Zutat-Alternative vor',
  'Erstelle eine einfache Einkaufsliste',
];

function remoteGoal(goal?: TrainingGoal): 'healthy_routine' | 'general_fitness' | 'fat_loss' | 'muscle_gain' | 'performance' {
  if (goal === 'build_muscle') return 'muscle_gain';
  if (goal === 'get_stronger') return 'performance';
  if (goal === 'fat_loss') return 'fat_loss';
  return goal === 'general_fitness' ? 'general_fitness' : 'healthy_routine';
}

export function Assistant({ context, title = 'Plan Assistant', className = '', onOpenShopping }: AssistantProps) {
  const [useContext, setUseContext] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 1, role: 'assistant', mode: 'system', text: 'Frag mich nach Proteinquellen, sinnvollen Lebensmittel-Alternativen oder deinem gespeicherten Plan.' },
  ]);
  const [pending, setPending] = useState(false);
  const [modeStatus, setModeStatus] = useState('Lokale Regeln sind aktiv. Es werden keine Daten übertragen.');
  const remoteAvailable = Boolean(getBackendUrl());
  const nextId = useMemo(() => messages.reduce((max, message) => Math.max(max, message.id), 0) + 1, [messages]);

  const ask = async (raw: string) => {
    const value = raw.trim();
    if (!value || pending) return;
    const localReply = buildLocalAssistantReply(value, { context, useContext });
    setMessages((current) => [
      ...current,
      { id: nextId, role: 'user', text: value },
    ]);
    setQuestion('');

    if (localReply.topic === 'safety') {
      setMessages((current) => [...current, { id: nextId + 1, role: 'assistant', mode: 'local', text: localReply.text }]);
      setModeStatus('Sicherheitsfrage lokal abgefangen. Keine Profildaten wurden übertragen.');
      return;
    }

    if (!useContext || !remoteAvailable) {
      setMessages((current) => [...current, { id: nextId + 1, role: 'assistant', mode: 'local', text: localReply.text }]);
      setModeStatus(remoteAvailable
        ? 'Lokale Antwort. Aktiviere die Einwilligung, wenn du die sichere KI mit Profilkontext nutzen möchtest.'
        : 'Lokale Antwort. Für echte KI muss in den Einstellungen ein sicheres Backend verbunden werden.');
      return;
    }

    setPending(true);
    setModeStatus('Sichere KI wird kontaktiert. Der gewählte Kontext gilt nur für diese Anfrage.');
    try {
      const response = await requestRemoteAssistant({
        consent_to_remote_ai: true,
        response_language: 'de',
        question: value,
        ...(context?.age && context.age >= 18 ? {
          profile_context: {
            age: context.age,
            goal: remoteGoal(context.goal),
            activity_level: context.activityLevel ?? 'moderate',
            average_sleep_hours: context.averageSleepHours && context.averageSleepHours >= 2 && context.averageSleepHours <= 14
              ? context.averageSleepHours
              : 7.5,
            dietary_preferences: [context.diet, ...(context.dietaryPreferences ?? [])]
              .filter((item): item is string => Boolean(item))
              .map((item) => item.slice(0, 80))
              .slice(0, 12),
            daily_routine_summary: context.lifestyleSummary?.slice(0, 600) ?? '',
          },
        } : {}),
        ...(context?.planSummary ? {
          plan_context: {
            plan_title: context.planTitle?.slice(0, 100) ?? '',
            training_summary: context.planSummary.slice(0, 600),
            nutrition_summary: context.nutritionSummary?.slice(0, 600) ?? '',
            calorie_target_kcal: context.calorieTargetKcal,
            protein_target_g: context.proteinTargetG,
          },
        } : {}),
      });
      setMessages((current) => [...current, {
        id: nextId + 1,
        role: 'assistant',
        mode: 'openai',
        text: [response.answer, ...response.safety_notes].filter(Boolean).join('\n\n'),
      }]);
      setModeStatus(`Echte KI-Antwort über das sichere Backend · ${response.provider_storage_requested ? 'Speicherung angefordert' : 'keine Provider-Speicherung angefordert'}.`);
    } catch (error) {
      setMessages((current) => [...current, {
        id: nextId + 1,
        role: 'assistant',
        mode: 'local',
        text: `${localReply.text}\n\nDie echte KI war nicht erreichbar; deshalb wurde transparent auf die lokale Hilfe zurückgefallen.`,
      }]);
      setModeStatus(error instanceof Error ? error.message : 'Die echte KI ist momentan nicht erreichbar.');
    } finally {
      setPending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <section className={`assistant-shell ${className}`.trim()} aria-labelledby="assistant-title">
      <header className="assistant-header">
        <div>
          <h2 id="assistant-title">{title}</h2>
        </div>
        <span className="assistant-local-badge">{useContext && remoteAvailable ? 'SECURE AI' : 'LOCAL'}</span>
      </header>

      <p className="assistant-disclosure" role="status">{modeStatus}</p>

      <label className="assistant-context-toggle">
        <input
          type="checkbox"
          checked={useContext}
          disabled={!context || !remoteAvailable}
          onChange={(event) => setUseContext(event.target.checked)}
        />
        <span>
          <strong>Sichere KI mit meinem gespeicherten Kontext verwenden</strong>
          <small>{!context
            ? 'Kein Profilkontext vorhanden.'
            : !remoteAvailable
              ? 'Verbinde zuerst ein Backend in den Einstellungen. Ein API-Schlüssel gehört niemals in den Browser.'
              : 'Einwilligung für diese Sitzung: Alter, Ziel, Aktivität, Schlaf, Ernährung, Tagesablauf und aktuelle Plan-Zielwerte werden an das konfigurierte Backend gesendet. Standort und Adresse niemals.'}</small>
        </span>
      </label>

      <div className="assistant-prompts" aria-label="Suggested questions">
        {QUICK_PROMPTS.map((prompt) => (
          <button type="button" key={prompt} onClick={() => void ask(prompt)} disabled={pending}>{prompt}</button>
        ))}
      </div>

      <div className="assistant-log" aria-live="polite" aria-label="Assistant conversation">
        {messages.map((message) => (
          <div className={`assistant-message ${message.role}`} key={message.id}>
            <span>{message.role === 'assistant'
              ? message.mode === 'openai' ? 'Secure AI' : message.mode === 'local' ? 'Local guide' : 'CORELINE'
              : 'Du'}</span>
            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <form className="assistant-compose" onSubmit={submit}>
        <label htmlFor="assistant-question">Deine Frage</label>
        <div>
          <input
            id="assistant-question"
            value={question}
            maxLength={280}
            placeholder="Frage nach Protein, Alternativen oder deinem Plan …"
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit" disabled={pending}>{pending ? 'Analysiert …' : useContext && remoteAvailable ? 'Sicher fragen' : 'Lokal fragen'}</button>
        </div>
      </form>

      {onOpenShopping && (
        <button type="button" className="system-button quiet" onClick={onOpenShopping}>
          <SystemIcon name="store" /> Einkaufsradar öffnen
        </button>
      )}
    </section>
  );
}

export default Assistant;
