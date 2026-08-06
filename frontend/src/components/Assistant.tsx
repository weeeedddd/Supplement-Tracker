import { useMemo, useState, type FormEvent } from 'react';

import type { DietPreference, EquipmentOption, TrainingGoal } from '../lib/plans';
import '../assistant.css';

export interface AssistantContext {
  displayName?: string;
  weightKg?: number;
  goal?: TrainingGoal;
  diet?: DietPreference;
  equipment?: EquipmentOption[];
  planSummary?: string;
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
}

export interface AssistantProps {
  context?: AssistantContext;
  title?: string;
  className?: string;
}

const QUICK_PROMPTS = [
  'Help me plan protein foods',
  'Suggest an ingredient substitution',
  'Build a simple shopping list',
];

export function Assistant({ context, title = 'Plan Assistant', className = '' }: AssistantProps) {
  const [useContext, setUseContext] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 1, role: 'assistant', text: 'Ask about protein foods, substitutions, shopping, or your starter plan.' },
  ]);
  const [searchDraft, setSearchDraft] = useState({ countryCode: '', budget: '', currency: 'EUR', store: '' });
  const [searchStatus, setSearchStatus] = useState('');
  const nextId = useMemo(() => messages.reduce((max, message) => Math.max(max, message.id), 0) + 1, [messages]);

  const ask = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const reply = buildLocalAssistantReply(value, { context, useContext });
    setMessages((current) => [
      ...current,
      { id: nextId, role: 'user', text: value },
      { id: nextId + 1, role: 'assistant', text: reply.text },
    ]);
    setQuestion('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(question);
  };

  const validateSearch = (event: FormEvent) => {
    event.preventDefault();
    const result = createProductSearchRequest({
      query: question.trim() || 'protein foods',
      countryCode: searchDraft.countryCode,
      budgetAmount: Number(searchDraft.budget),
      currency: searchDraft.currency,
      store: searchDraft.store,
    });
    if (!result.ok) {
      setSearchStatus(`Check: ${result.errors.join(', ')}.`);
      return;
    }
    setSearchStatus(`Preferences ready for ${result.value.countryCode}. Live search is not connected, so no offers or links were generated.`);
  };

  return (
    <section className={`assistant-shell ${className}`.trim()} aria-labelledby="assistant-title">
      <header className="assistant-header">
        <div>
          <span className="assistant-kicker">CONTEXTUAL GUIDE</span>
          <h2 id="assistant-title">{title}</h2>
        </div>
        <span className="assistant-local-badge">LOCAL</span>
      </header>

      <p className="assistant-disclosure" role="note">{LOCAL_DISCLOSURE}</p>

      <label className="assistant-context-toggle">
        <input
          type="checkbox"
          checked={useContext}
          disabled={!context}
          onChange={(event) => setUseContext(event.target.checked)}
        />
        <span>
          <strong>Use my saved plan context</strong>
          <small>{context ? 'Opt in for this assistant session only.' : 'No plan context was provided.'}</small>
        </span>
      </label>

      <div className="assistant-prompts" aria-label="Suggested questions">
        {QUICK_PROMPTS.map((prompt) => (
          <button type="button" key={prompt} onClick={() => ask(prompt)}>{prompt}</button>
        ))}
      </div>

      <div className="assistant-log" aria-live="polite" aria-label="Assistant conversation">
        {messages.map((message) => (
          <div className={`assistant-message ${message.role}`} key={message.id}>
            <span>{message.role === 'assistant' ? 'Guide' : 'You'}</span>
            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <form className="assistant-compose" onSubmit={submit}>
        <label htmlFor="assistant-question">Your question</label>
        <div>
          <input
            id="assistant-question"
            value={question}
            maxLength={280}
            placeholder="Ask about protein foods, swaps, or shopping..."
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit">Ask locally</button>
        </div>
      </form>

      <details className="assistant-search-contract">
        <summary>Future product-search preferences</summary>
        <p>No provider is connected. These fields only validate the country, budget, and store contract.</p>
        <form onSubmit={validateSearch}>
          <label>
            Country code
            <input value={searchDraft.countryCode} maxLength={2} placeholder="DE" onChange={(event) => setSearchDraft({ ...searchDraft, countryCode: event.target.value })} />
          </label>
          <label>
            Budget
            <input type="number" min="1" step="1" value={searchDraft.budget} placeholder="40" onChange={(event) => setSearchDraft({ ...searchDraft, budget: event.target.value })} />
          </label>
          <label>
            Currency
            <input value={searchDraft.currency} maxLength={3} onChange={(event) => setSearchDraft({ ...searchDraft, currency: event.target.value })} />
          </label>
          <label>
            Preferred store
            <input value={searchDraft.store} maxLength={80} placeholder="Optional" onChange={(event) => setSearchDraft({ ...searchDraft, store: event.target.value })} />
          </label>
          <button type="submit">Validate preferences</button>
        </form>
        {searchStatus && <p className="assistant-search-status" role="status">{searchStatus}</p>}
      </details>
    </section>
  );
}

export default Assistant;
