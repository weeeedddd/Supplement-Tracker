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

type SupplementTranslation = Pick<SafeSupplementCatalogItem,
  'label' | 'purpose' | 'timingLabel' | 'guidance' | 'caution' | 'whatItIs'
  | 'supportedUse' | 'evidenceLimits' | 'foodSources' | 'cautions' | 'interactionPrompt'>;

const GERMAN_SUPPLEMENT_COPY: Record<string, SupplementTranslation> = {
  protein: {
    label: 'Proteinpulver',
    purpose: 'Eine praktische Lebensmitteloption, wenn normale Mahlzeiten die geplanten Proteinquellen nicht abdecken.',
    timingLabel: 'Als praktische Ergänzung zu Lebensmitteln – nicht als Pflicht-Ritual',
    guidance: 'Beachte Produktetikett und Ernährungsplan; individuelle Fragen gehören zu qualifizierter ärztlicher oder ernährungsfachlicher Beratung.',
    caution: 'Prüfe Allergene, Zutaten und Gesamtzufuhr. Pulver ist optional und garantiert keinen Muskelaufbau.',
    whatItIs: 'Ein konzentriertes Lebensmittelprodukt, etwa aus Milch-, Soja-, Erbsen-, Reis- oder gemischten Pflanzenproteinen.',
    supportedUse: 'Protein unterstützt normalen Muskelaufbau, -erhalt und -reparatur. Pulver kann eine ausreichende Lebensmittelauswahl praktischer machen.',
    evidenceLimits: 'Die meisten aktiven Menschen können ihren Proteinbedarf über Lebensmittel decken. Timing und Pulverart ersetzen weder ausreichende Ernährung noch Training und Erholung.',
    foodSources: ['Milchprodukte oder angereicherte Alternativen', 'Eier, Fisch, Fleisch oder Geflügel', 'Bohnen, Linsen, Tofu, Tempeh und Sojaprodukte'],
    cautions: ['Prüfe Milch-, Soja-, Erbsen- und andere Allergene.', 'Bei Nierenerkrankung, Schwangerschaft, Essstörungserholung oder anderen klinischen Anforderungen ist qualifizierte Beratung nötig.'],
    interactionPrompt: 'Gibt es eine Allergie, Nierenerkrankung, Schwangerschaft oder einen klinischen Ernährungsplan, der zuerst geprüft werden sollte?',
  },
  kreatin: {
    label: 'Kreatin-Monohydrat',
    purpose: 'Ein optionales Performance-Supplement mit Evidenz für bestimmte kurze, wiederholte hochintensive Belastungen.',
    timingLabel: 'Regelmäßigkeit ist wichtiger als ein vermeintlich perfektes Zeitfenster',
    guidance: 'Beachte das Produktetikett und kläre die Eignung bei Unsicherheit mit einer qualifizierten Fachperson.',
    caution: 'Wassergewichtsänderung und Verdauungsbeschwerden sind möglich. CORELINE erstellt keine Dosierung und kein Ladeprotokoll.',
    whatItIs: 'Eine überwiegend im Muskel gespeicherte Verbindung, die in kleineren Mengen aus tierischen Lebensmitteln stammt; Monohydrat ist die am besten untersuchte Supplementform.',
    supportedUse: 'Bei manchen Erwachsenen kann es die Leistung bei wiederholten kurzen, intensiven Belastungen sowie Kraft- oder Powertraining unterstützen.',
    evidenceLimits: 'Die Reaktion ist individuell; der Nutzen für Ausdauerbelastungen ist begrenzt. Es ersetzt weder Training noch Ernährung, Schlaf oder Erholung.',
    foodSources: ['Fisch', 'Fleisch'],
    cautions: ['Bei Nierenerkrankung, Schwangerschaft, Medikamenteneinnahme oder Nutzung unter 18 ist individuelle Beratung nötig.', 'Anhaltende Verdauungsbeschwerden sollten Anlass sein, das Produkt zu stoppen und zu prüfen.'],
    interactionPrompt: 'Bist du unter 18, schwanger, nimmst Medikamente oder lebst mit einer Nierenerkrankung?',
  },
  omega: {
    label: 'Omega-3',
    purpose: 'Eine Gruppe von Fetten mit ALA, EPA und DHA; Lebensmittel bleiben der erste Bezugspunkt.',
    timingLabel: 'Ein spezielles Performance-Zeitfenster ist nicht belegt',
    guidance: 'Beachte das Produktetikett; eine qualifizierte Fachperson kann Bedarf und Wechselwirkungsrisiko beurteilen.',
    caution: 'Unterstelle keine pauschalen Vorteile für Herz, Gehirn oder Entzündungen. Der Nutzen eines Supplements hängt vom Kontext ab.',
    whatItIs: 'Essenzielle und langkettige mehrfach ungesättigte Fette. ALA stammt vor allem aus Pflanzen; EPA und DHA kommen häufig in Meereslebensmitteln und Algenprodukten vor.',
    supportedUse: 'Omega-3-Fette haben normale Funktionen im Körper. Ob ein Supplement sinnvoll ist, hängt von Ernährung und individuellem klinischem Kontext ab.',
    evidenceLimits: 'Allgemeine EPA- und DHA-Supplementziele gelten nicht für alle; die Evidenz unterscheidet sich je nach Ergebnis und Produkt.',
    foodSources: ['Fettreicher Fisch wie Lachs, Hering oder Sardinen', 'Walnüsse, Leinsamen, Chiasamen und bestimmte Öle als ALA-Quellen', 'Algenbasierte Lebensmittel oder Produkte für DHA/EPA'],
    cautions: ['Besprich die Nutzung bei Blutverdünnern oder Blutungsneigung.', 'Prüfe Fisch- oder Schalentierallergene und die Produktherkunft.'],
    interactionPrompt: 'Nimmst du blutverdünnende Medikamente, besteht eine Blutungsneigung oder Fischallergie?',
  },
  vitd: {
    label: 'Vitamin D',
    purpose: 'Ein Vitamin, das an Kalziumaufnahme, Knochengesundheit sowie normaler Muskel-, Nerven- und Immunfunktion beteiligt ist.',
    timingLabel: 'Ein Bedarf lässt sich nicht aus Stimmung oder Alltag ableiten',
    guidance: 'Beachte das Produktetikett; für längerfristige Nutzung sind fachlich begleitete Tests und Beratung vorzuziehen.',
    caution: 'Eine übermäßige Zufuhr kann schaden und mit Medikamenten wechselwirken. Vermeide mehrere überlappende Vitamin-D-Produkte.',
    whatItIs: 'Ein fettlösliches Vitamin aus wenigen Lebensmitteln, angereicherten Produkten, Supplements und der Bildung in der Haut nach Sonnenlicht.',
    supportedUse: 'Eine ausreichende Versorgung unterstützt Kalziumaufnahme, Knochen sowie normale Muskel- und Nervenfunktion.',
    evidenceLimits: 'CORELINE kann aus Sonne, Müdigkeit, Stimmung, Ernährung oder Training keinen Mangel diagnostizieren.',
    foodSources: ['Fettreicher Fisch und Eigelb', 'Angereicherte Milch- oder Pflanzenalternativen', 'Angereicherte Getreideprodukte, sofern verfügbar'],
    cautions: ['Langfristige Überdosierung kann ernste Schäden einschließlich Nierenproblemen verursachen.', 'Medikamente können Vitamin-D-Spiegel oder -Wirkung verändern.'],
    interactionPrompt: 'Wurde dein Status fachlich gemessen und wurden Medikamente sowie überlappende Produkte geprüft?',
  },
  magnesium: {
    label: 'Magnesium',
    purpose: 'Ein Mineral für normale Muskel-, Nerven- und Stoffwechselfunktionen; es ist nicht automatisch ein Schlafprodukt.',
    timingLabel: 'Keine allgemeingültige Schlaf- oder Erholungszeit ist belegt',
    guidance: 'Beachte das Produktetikett und kläre Bedarf, Form und Medikamentenwechselwirkungen qualifiziert ab.',
    caution: 'Supplementformen können Durchfall, Übelkeit oder Krämpfe verursachen und mit Medikamenten wechselwirken.',
    whatItIs: 'Ein essenzielles Mineral, das in vielen pflanzlichen Lebensmitteln vorkommt und an zahlreichen normalen Körperprozessen beteiligt ist.',
    supportedUse: 'Eine ausreichende Versorgung unterstützt normale Muskel- und Nervenfunktion, Blutzuckerregulation und weitere Stoffwechselaufgaben.',
    evidenceLimits: 'Ein Supplement ist keine garantierte Lösung für Schlaf, Stress, Krämpfe oder Erholung.',
    foodSources: ['Hülsenfrüchte, Nüsse und Samen', 'Vollkornprodukte', 'Grünes Blattgemüse', 'Angereicherte Lebensmittel'],
    cautions: ['Antibiotika, Bisphosphonate, Diuretika und andere Medikamente sollten mit ärztlicher oder pharmazeutischer Fachberatung geprüft werden.', 'Verdauungsbeschwerden sind bei manchen Supplementformen häufig.'],
    interactionPrompt: 'Nimmst du Antibiotika, Bisphosphonate, Diuretika oder andere regelmäßige Medikamente?',
  },
};

export function localizeSupplement(item: SafeSupplementCatalogItem, language: string): SafeSupplementCatalogItem {
  if (language !== 'de') return item;
  const localized = GERMAN_SUPPLEMENT_COPY[item.id];
  return localized ? { ...item, ...localized } : item;
}

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
