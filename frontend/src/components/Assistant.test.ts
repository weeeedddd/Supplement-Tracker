import { describe, expect, it } from 'vitest';

import {
  buildLocalAssistantReply,
  createProductSearchRequest,
  filterFreshProductOffers,
  type AssistantContext,
  type ProductOffer,
} from './Assistant';

const context: AssistantContext = {
  displayName: 'Mira',
  weightKg: 65,
  goal: 'general_fitness',
  diet: 'vegetarian',
  equipment: ['bodyweight', 'dumbbells'],
};

describe('buildLocalAssistantReply', () => {
  it('does not use personal context until the user opts in', () => {
    const reply = buildLocalAssistantReply('How much protein should I plan?', {
      context,
      useContext: false,
    });

    expect(reply.contextUsed).toBe(false);
    expect(reply.text).not.toContain('Mira');
    expect(reply.text).not.toContain('65');
    expect(reply.disclosure.toLowerCase()).toContain('local rules');
    expect(reply.disclosure.toLowerCase()).toContain('not a live ai service');
  });

  it('uses opted-in weight context for a conservative food-protein planning range', () => {
    const reply = buildLocalAssistantReply('protein target', {
      context,
      useContext: true,
    });

    expect(reply.contextUsed).toBe(true);
    expect(reply.topic).toBe('protein');
    expect(reply.text).toContain('78-104 g');
    expect(reply.text.toLowerCase()).toContain('food');
  });

  it('offers diet-aware substitutions without inventing products or links', () => {
    const reply = buildLocalAssistantReply('What can I substitute for chicken?', {
      context,
      useContext: true,
    });

    expect(reply.topic).toBe('substitution');
    expect(reply.text.toLowerCase()).toMatch(/tofu|tempeh|lentils/);
    expect(reply.text).not.toMatch(/https?:\/\//);
  });

  it('is explicit that shopping prices and links are unavailable locally', () => {
    const reply = buildLocalAssistantReply('Find cheap protein near my store', {
      context,
      useContext: true,
    });

    expect(reply.topic).toBe('shopping');
    expect(reply.text.toLowerCase()).toContain('live prices and links are not connected');
    expect(reply.text).not.toMatch(/https?:\/\//);
  });

  it('routes pain or medical questions to qualified care instead of adapting the plan', () => {
    const reply = buildLocalAssistantReply('My knee hurts during squats', {
      context,
      useContext: true,
    });

    expect(reply.topic).toBe('safety');
    expect(reply.text.toLowerCase()).toContain('stop the painful movement');
    expect(reply.text.toLowerCase()).toContain('qualified');
  });

  it('keeps German local guidance honest and catches German symptom wording', () => {
    const reply = buildLocalAssistantReply('Mein Knie tut weh beim Training', {
      context,
      useContext: true,
      language: 'de',
    });

    expect(reply.topic).toBe('safety');
    expect(reply.text).toContain('Stoppe');
    expect(reply.disclosure).toContain('Lokale Regeln');
    expect(reply.disclosure).toContain('kein Live-KI-Dienst');
  });
});

describe('product search contract helpers', () => {
  it('normalizes a valid country, budget, currency, and store request', () => {
    const result = createProductSearchRequest({
      query: 'high-protein yogurt',
      countryCode: 'de',
      budgetAmount: 35,
      currency: 'eur',
      store: 'Rewe',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        query: 'high-protein yogurt',
        countryCode: 'DE',
        budget: { amount: 35, currency: 'EUR' },
        store: 'Rewe',
      },
    });
  });

  it('rejects incomplete or invalid live-search parameters', () => {
    expect(createProductSearchRequest({
      query: '',
      countryCode: 'Germany',
      budgetAmount: -1,
      currency: 'EUR',
    })).toEqual({
      ok: false,
      errors: expect.arrayContaining(['query', 'countryCode', 'budgetAmount']),
    });
  });

  it('keeps only recently verified offers so stale links are not shown', () => {
    const now = Date.parse('2026-08-05T12:00:00.000Z');
    const offers: ProductOffer[] = [
      {
        id: 'fresh',
        name: 'Fresh offer',
        store: 'Store A',
        countryCode: 'DE',
        price: { amount: 3.5, currency: 'EUR' },
        productUrl: 'https://example.test/fresh',
        verifiedAt: '2026-08-05T11:00:00.000Z',
      },
      {
        id: 'stale',
        name: 'Stale offer',
        store: 'Store B',
        countryCode: 'DE',
        price: { amount: 2.5, currency: 'EUR' },
        productUrl: 'https://example.test/stale',
        verifiedAt: '2026-07-30T11:00:00.000Z',
      },
    ];

    expect(filterFreshProductOffers(offers, now, 24 * 60 * 60 * 1000).map((offer) => offer.id)).toEqual(['fresh']);
  });
});
