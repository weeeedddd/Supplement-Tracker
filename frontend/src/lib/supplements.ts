import type { ProtocolItem } from './engine';

export type SupplementEvidenceLevel = 'supported_for_specific_use' | 'context_dependent' | 'food_first';

export interface SupplementSourceRef {
  label: string;
  authority: string;
  url: string;
}

export interface SafeSupplementCatalogItem {
  id: string;
  label: string;
  purpose: string;
  phase: ProtocolItem['phase'];
  timingLabel: string;
  guidance: string;
  caution: string;
  whatItIs: string;
  supportedUse: string;
  evidenceLimits: string;
  evidenceLevel: SupplementEvidenceLevel;
  foodSources: string[];
  cautions: string[];
  interactionPrompt: string;
  sources: SupplementSourceRef[];
  reviewedAt: string;
}

const PERFORMANCE_SOURCE: SupplementSourceRef = {
  label: 'Dietary Supplements for Exercise and Athletic Performance — Consumer',
  authority: 'NIH Office of Dietary Supplements',
  url: 'https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-Consumer/',
};

const REVIEWED_AT = '2026-08-06';

export const SAFE_SUPPLEMENT_CATALOG: readonly SafeSupplementCatalogItem[] = [
  {
    id: 'protein',
    label: 'Protein powder',
    purpose: 'A convenient food option when regular meals do not cover the protein foods you planned.',
    phase: 'beta',
    timingLabel: 'Use as a food convenience, not a required ritual',
    guidance: 'Use the product label and your food plan; ask a qualified clinician or dietitian for individual advice.',
    caution: 'Check allergens, ingredients, and total intake. A powder is optional and does not guarantee muscle gain.',
    whatItIs: 'A concentrated food product made from sources such as milk, soy, pea, rice, or mixed plant proteins.',
    supportedUse: 'Protein supports normal muscle building, maintenance, and repair. Powder can make an adequate food pattern more convenient.',
    evidenceLimits: 'Most active people can meet protein needs through food. Timing and powder type do not replace enough total food, training, and recovery.',
    evidenceLevel: 'food_first',
    foodSources: ['Dairy or fortified alternatives', 'Eggs, fish, meat, or poultry', 'Beans, lentils, tofu, tempeh, and soy foods'],
    cautions: ['Check milk, soy, pea, or other allergens.', 'Use qualified advice for kidney disease, pregnancy, eating-disorder recovery, or other clinical needs.'],
    interactionPrompt: 'Do you have an allergy, kidney condition, pregnancy, or clinical nutrition plan that should be reviewed first?',
    sources: [PERFORMANCE_SOURCE],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'kreatin',
    label: 'Creatine monohydrate',
    purpose: 'An optional performance supplement with evidence for specific short, repeated high-intensity efforts.',
    phase: 'beta',
    timingLabel: 'Consistency matters more than a magic timing window',
    guidance: 'Follow the product label and discuss suitability with a qualified clinician when unsure.',
    caution: 'Water-weight change and digestive discomfort can occur. CORELINE never creates a dose or loading protocol.',
    whatItIs: 'A compound stored mainly in muscle and obtained in smaller amounts from animal foods; monohydrate is the most studied supplemental form.',
    supportedUse: 'It can support performance in repeated short, intense efforts and strength or power training for some adults.',
    evidenceLimits: 'Responses vary, and benefit for endurance activity is limited. It does not substitute for training, food, sleep, or recovery.',
    evidenceLevel: 'supported_for_specific_use',
    foodSources: ['Fish', 'Meat'],
    cautions: ['Seek individual guidance for kidney conditions, pregnancy, medication use, or under-18 use.', 'Stop and review the product if digestive effects are persistent.'],
    interactionPrompt: 'Are you under 18, pregnant, using medication, or managing a kidney condition?',
    sources: [PERFORMANCE_SOURCE],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'omega',
    label: 'Omega-3',
    purpose: 'A group of fats that includes ALA, EPA, and DHA; food sources remain the first reference point.',
    phase: 'alpha',
    timingLabel: 'No performance timing window is established',
    guidance: 'Use the product label; a qualified clinician can assess need and interaction risk.',
    caution: 'Do not assume broad heart, brain, or inflammation benefits. Supplement benefit depends on context.',
    whatItIs: 'Essential and long-chain polyunsaturated fats. ALA comes mainly from plants, while EPA and DHA are common in seafood and algae products.',
    supportedUse: 'Omega-3 fats have normal roles in the body, but whether a supplement is useful depends on diet and individual clinical context.',
    evidenceLimits: 'General EPA and DHA supplement targets are not established for everyone, and evidence differs by outcome and product.',
    evidenceLevel: 'context_dependent',
    foodSources: ['Fatty fish such as salmon, herring, or sardines', 'Walnuts, flax, chia, and some oils for ALA', 'Algae-derived foods or products for DHA/EPA'],
    cautions: ['Discuss use with anticoagulants or bleeding concerns.', 'Check fish or shellfish allergens and product origin.'],
    interactionPrompt: 'Do you use blood-thinning medicine, have bleeding concerns, or have a fish allergy?',
    sources: [{
      label: 'Omega-3 Fatty Acids — Consumer',
      authority: 'NIH Office of Dietary Supplements',
      url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/',
    }],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'vitd',
    label: 'Vitamin D',
    purpose: 'A vitamin involved in calcium absorption, bone health, and normal muscle, nerve, and immune function.',
    phase: 'alpha',
    timingLabel: 'Need should not be inferred from mood or routine',
    guidance: 'Follow the product label and prefer clinician-guided testing and advice for long-term use.',
    caution: 'Excess intake can be harmful and can interact with medicines. Avoid stacking products with vitamin D.',
    whatItIs: 'A fat-soluble vitamin obtained through limited foods, fortified foods, supplements, and synthesis in skin after sunlight exposure.',
    supportedUse: 'Adequate vitamin D supports calcium absorption, bones, and normal muscle and nerve function.',
    evidenceLimits: 'CORELINE cannot diagnose a deficiency from sun exposure, fatigue, mood, diet, or training data.',
    evidenceLevel: 'context_dependent',
    foodSources: ['Fatty fish and egg yolk', 'Fortified dairy or plant alternatives', 'Fortified cereals where available'],
    cautions: ['Long-term excess can cause serious harm, including kidney problems.', 'Medicines can alter vitamin D levels or effects.'],
    interactionPrompt: 'Has a clinician measured your status or reviewed medicines and overlapping products?',
    sources: [{
      label: 'Vitamin D — Consumer',
      authority: 'NIH Office of Dietary Supplements',
      url: 'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/',
    }],
    reviewedAt: REVIEWED_AT,
  },
  {
    id: 'magnesium',
    label: 'Magnesium',
    purpose: 'A mineral involved in normal muscle, nerve, and metabolic functions; it is not automatically a sleep product.',
    phase: 'gamma',
    timingLabel: 'No universal sleep or recovery timing claim',
    guidance: 'Follow the product label and ask a qualified clinician about need, form, and medicine interactions.',
    caution: 'Supplemental forms can cause diarrhea, nausea, or cramping and can interact with medicines.',
    whatItIs: 'An essential mineral found in many plant foods and used across numerous normal body processes.',
    supportedUse: 'Adequate magnesium supports normal muscle and nerve function, blood glucose regulation, and other metabolic roles.',
    evidenceLimits: 'A supplement should not be marketed as a guaranteed sleep, stress, cramp, or recovery solution.',
    evidenceLevel: 'food_first',
    foodSources: ['Legumes, nuts, and seeds', 'Whole grains', 'Leafy green vegetables', 'Fortified foods'],
    cautions: ['Review antibiotics, bisphosphonates, diuretics, and other medicines with a clinician or pharmacist.', 'Digestive effects are common with some supplemental forms.'],
    interactionPrompt: 'Do you take antibiotics, bisphosphonates, diuretics, or other regular medicines?',
    sources: [{
      label: 'Magnesium — Consumer',
      authority: 'NIH Office of Dietary Supplements',
      url: 'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/',
    }],
    reviewedAt: REVIEWED_AT,
  },
] as const;

const SAFE_IDS = new Set(SAFE_SUPPLEMENT_CATALOG.map(item => item.id));

export function getSupplementById(id: string): SafeSupplementCatalogItem | undefined {
  return SAFE_SUPPLEMENT_CATALOG.find(item => item.id === id);
}

export function sanitizeRoutineSelection(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((id): id is string => typeof id === 'string' && SAFE_IDS.has(id)))];
}

export function toProtocol(selection: unknown): ProtocolItem[] {
  const ids = sanitizeRoutineSelection(selection);
  return ids.map(id => {
    const item = getSupplementById(id)!;
    return { id, phase: item.phase, wk: 'user_selected' };
  });
}
