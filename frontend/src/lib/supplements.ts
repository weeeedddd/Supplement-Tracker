import type { ProtocolItem } from './engine';

export interface SafeSupplementCatalogItem {
  id: string;
  label: string;
  purpose: string;
  phase: ProtocolItem['phase'];
  timingLabel: string;
  guidance: string;
  caution: string;
}

export const SAFE_SUPPLEMENT_CATALOG: readonly SafeSupplementCatalogItem[] = [
  {
    id: 'protein',
    label: 'Protein powder',
    purpose: 'A convenient food option when whole-food protein is hard to reach.',
    phase: 'beta',
    timingLabel: 'With a meal or after training',
    guidance: 'Use the product label and your food target; ask a clinician for individual advice.',
    caution: 'Check allergens and total daily intake. It is optional, not a requirement.',
  },
  {
    id: 'kreatin',
    label: 'Creatine monohydrate',
    purpose: 'A well-studied training supplement for some healthy adults.',
    phase: 'beta',
    timingLabel: 'Any consistent time',
    guidance: 'Follow the product label and discuss suitability with a clinician when unsure.',
    caution: 'Seek clinical guidance for kidney conditions, pregnancy, medication interactions, or under-18 use.',
  },
  {
    id: 'omega',
    label: 'Omega-3',
    purpose: 'An optional way to complement dietary oily-fish intake.',
    phase: 'alpha',
    timingLabel: 'With food',
    guidance: 'Follow the product label; a clinician can assess need and interaction risk.',
    caution: 'Discuss first if using blood thinners, before surgery, or with fish allergies.',
  },
  {
    id: 'vitd',
    label: 'Vitamin D',
    purpose: 'May be relevant when intake, sun exposure, or measured status is low.',
    phase: 'alpha',
    timingLabel: 'With food',
    guidance: 'Use the product label and prefer clinician-guided testing before long-term use.',
    caution: 'Avoid stacking products with the same vitamin; excess intake can be harmful.',
  },
  {
    id: 'magnesium',
    label: 'Magnesium',
    purpose: 'An optional supplement when dietary intake or a clinician-identified need warrants it.',
    phase: 'gamma',
    timingLabel: 'At a personally comfortable time',
    guidance: 'Follow the product label and ask a clinician about the appropriate form or need.',
    caution: 'Can interact with medicines and cause digestive effects; separate only as directed by a clinician.',
  },
] as const;

const SAFE_IDS = new Set(SAFE_SUPPLEMENT_CATALOG.map(item => item.id));

export function sanitizeRoutineSelection(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((id): id is string => typeof id === 'string' && SAFE_IDS.has(id)))];
}

export function toProtocol(selection: unknown): ProtocolItem[] {
  const ids = sanitizeRoutineSelection(selection);
  return ids.map(id => {
    const item = SAFE_SUPPLEMENT_CATALOG.find(candidate => candidate.id === id)!;
    return { id, phase: item.phase, wk: 'user_selected' };
  });
}
