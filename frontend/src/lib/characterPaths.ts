import type { Workout } from './fitness';
import type { InspirationProfileId, TrainingGoal } from './plans';

export interface LocalizedCharacterCopy {
  de: string;
  en: string;
}

export interface CharacterSupplementMatch {
  id: string;
  label: LocalizedCharacterCopy;
  reason: LocalizedCharacterCopy;
}

/** Energy direction a path leans toward when a day plan is drafted. */
export type CharacterEnergyBias = 'lean' | 'balanced' | 'surplus';

/**
 * Food emphasis for a path. It only steers which reviewed recipes are ranked
 * first; the calorie and protein targets always come from the profile.
 */
export interface CharacterFoodFocus {
  headline: LocalizedCharacterCopy;
  principles: LocalizedCharacterCopy[];
  preferredGoals: TrainingGoal[];
  proteinBias: number;
  energyBias: CharacterEnergyBias;
}

export interface CharacterPathDefinition {
  id: InspirationProfileId;
  name: string;
  title: LocalizedCharacterCopy;
  focus: LocalizedCharacterCopy;
  systemMessage: LocalizedCharacterCopy;
  tags: LocalizedCharacterCopy[];
  foodFocus: CharacterFoodFocus;
  recommendations: CharacterSupplementMatch[];
}

export const CHARACTER_EQUIP_STORAGE_KEY = 'character_equipped_path_v1';

export const CHARACTER_PATHS: Record<InspirationProfileId, CharacterPathDefinition> = {
  toji: {
    id: 'toji',
    name: 'Toji',
    title: { de: 'Der funktionale Athlet', en: 'The Functional Athlete' },
    focus: {
      de: 'Dichte funktionale Kraft, Explosivität, Agilität und ein schlanker athletischer Aufbau.',
      en: 'Dense functional strength, explosiveness, agility, and a lean athletic build.',
    },
    systemMessage: {
      de: 'Normales Standardtraining wurde ausgeblendet. Dein Pfad priorisiert schwere Grundmuster, Carries, Sprünge, kurze Sprints und kontrollierte Erholung.',
      en: 'Standard training has been hidden. Your path prioritizes heavy movement patterns, carries, jumps, short sprints, and controlled recovery.',
    },
    tags: [
      { de: 'Funktionelle Kraft', en: 'Functional strength' },
      { de: 'Agilität', en: 'Agility' },
      { de: 'Schlanker Aufbau', en: 'Lean build' },
    ],
    foodFocus: {
      headline: {
        de: 'Schlanke Energie mit hoher Proteindichte',
        en: 'Lean energy with high protein density',
      },
      principles: [
        { de: 'Protein zu jeder Hauptmahlzeit, damit die geplante Tagesmenge ohne Pulver erreichbar bleibt.', en: 'Protein at every main meal so the planned daily amount stays reachable without powder.' },
        { de: 'Kohlenhydrate eher um die Einheit herum, damit kurze intensive Belastungen genug Energie haben.', en: 'Carbohydrates mostly around the session so short intense efforts have enough energy.' },
        { de: 'Sättigende, wenig verarbeitete Basis — der Vorschlag ersetzt keine ärztliche oder diätologische Beratung.', en: 'A filling, lightly processed base — this suggestion does not replace medical or dietetic advice.' },
      ],
      preferredGoals: ['fat_loss', 'get_stronger', 'general_fitness'],
      proteinBias: 1.15,
      energyBias: 'lean',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Whey-Isolat / Protein', en: 'Whey isolate / protein' },
        reason: {
          de: 'Eine praktische Proteinquelle, wenn normale Mahlzeiten den geplanten Bedarf nicht abdecken.',
          en: 'A convenient protein source when regular meals do not cover the amount you planned.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann wiederholte kurze, intensive Kraft- und Powerbelastungen unterstützen; Wassergewichtsänderungen sind möglich.',
          en: 'May support repeated short, intense strength and power efforts; water-weight changes can occur.',
        },
      },
      {
        id: 'eaa',
        label: { de: 'Essenzielle Aminosäuren', en: 'Essential amino acids' },
        reason: {
          de: 'Nur als praktische Option, wenn eine ausreichende Proteinzufuhr über Lebensmittel schwer erreichbar ist.',
          en: 'Only a convenience option when adequate protein from food is difficult to reach.',
        },
      },
      {
        id: 'zinc',
        label: { de: 'Zink', en: 'Zinc' },
        reason: {
          de: 'Lebensmittel zuerst; eine Ergänzung ist nur bei individuellem Bedarf sinnvoll.',
          en: 'Food first; supplementation is relevant only when individual intake or need warrants it.',
        },
      },
      {
        id: 'magnesium',
        label: { de: 'Magnesium', en: 'Magnesium' },
        reason: {
          de: 'Unterstützt normale Muskel- und Nervenfunktion, ist aber kein garantiertes Erholungsprodukt.',
          en: 'Supports normal muscle and nerve function, but is not a guaranteed recovery product.',
        },
      },
    ],
  },
  goku: {
    id: 'goku',
    name: 'Son Goku',
    title: { de: 'Der grenzenlose Hypertrophie-Athlet', en: 'The Limitless Hypertrophy Athlete' },
    focus: {
      de: 'Hohe Trainingskapazität, Muskelaufbau, Ganzkörperkraft und wiederholbare Kondition.',
      en: 'High training capacity, hypertrophy, full-body strength, and repeatable conditioning.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad wechselt volumenbetonte Ganzkörpereinheiten mit Konditionsblöcken und klarer Erholung.',
      en: 'Standard plans have been hidden. Your path alternates volume-focused full-body sessions with conditioning blocks and clear recovery.',
    },
    tags: [
      { de: 'Muskelmasse', en: 'Muscle mass' },
      { de: 'Ausdauer', en: 'Stamina' },
      { de: 'Hypertrophie', en: 'Hypertrophy' },
    ],
    foodFocus: {
      headline: {
        de: 'Kalorien für hohe Trainingskapazität',
        en: 'Calories for high training capacity',
      },
      principles: [
        { de: 'Energiedichte Mahlzeiten, damit ein geplanter Überschuss nicht nur aus Zwischensnacks besteht.', en: 'Energy-dense meals so a planned surplus does not come only from snacks.' },
        { de: 'Kohlenhydrate über den Tag verteilt, damit Volumen und Kondition wiederholbar bleiben.', en: 'Carbohydrates spread across the day so volume and conditioning stay repeatable.' },
        { de: 'Ein Überschuss baut nicht automatisch Muskeln auf; Training, Schlaf und Gesamtmenge entscheiden.', en: 'A surplus does not build muscle by itself; training, sleep, and total intake decide.' },
      ],
      preferredGoals: ['build_muscle', 'get_stronger', 'general_fitness'],
      proteinBias: 1.05,
      energyBias: 'surplus',
    },
    recommendations: [
      {
        id: 'mass-gainer',
        label: { de: 'Mass-Gainer', en: 'Mass gainer' },
        reason: {
          de: 'Eine kalorienreiche Lebensmitteloption, wenn ein geplanter Energieüberschuss mit normalen Mahlzeiten schwer fällt.',
          en: 'A calorie-dense food option when a planned energy surplus is difficult to reach with regular meals.',
        },
      },
      {
        id: 'preworkout',
        label: { de: 'Pre-Workout / Koffein', en: 'Pre-workout / caffeine' },
        reason: {
          de: 'Kann die Ermüdungswahrnehmung bei manchen Erwachsenen senken; Koffeinmenge, Schlaf und Medikamente müssen geprüft werden.',
          en: 'May reduce perceived fatigue for some adults; caffeine amount, sleep, and medications must be checked.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann wiederholte kurze, intensive Belastungen im Krafttraining unterstützen.',
          en: 'May support repeated short, intense efforts during resistance training.',
        },
      },
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Eine optionale Hilfe, um eine ausreichende Proteinzufuhr praktisch zu ergänzen.',
          en: 'An optional convenience for completing an adequate protein intake.',
        },
      },
    ],
  },
  tanjiro: {
    id: 'tanjiro',
    name: 'Tanjiro',
    title: { de: 'Der ausgeglichene Ausdauer-Athlet', en: 'The Balanced Endurance Athlete' },
    focus: {
      de: 'Kontrollierte Ganzkörperkraft, Bewegungsqualität, Rumpfstabilität und nachhaltige Kondition.',
      en: 'Controlled full-body strength, movement quality, core stability, and sustainable conditioning.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad verbindet kontrollierte Kraft, Mobilität, Atemarbeit und ruhige Konditionsintervalle.',
      en: 'Standard plans have been hidden. Your path combines controlled strength, mobility, breathing practice, and easy conditioning intervals.',
    },
    tags: [
      { de: 'Balance', en: 'Balance' },
      { de: 'Rumpfstabilität', en: 'Core stability' },
      { de: 'Ausdauer', en: 'Endurance' },
    ],
    foodFocus: {
      headline: {
        de: 'Gleichmäßige Energie über den Tag',
        en: 'Steady energy across the day',
      },
      principles: [
        { de: 'Regelmäßige Mahlzeiten statt großer Lücken, damit ruhige Kondition planbar bleibt.', en: 'Regular meals instead of long gaps so easy conditioning stays plannable.' },
        { de: 'Gemüse, Vollkorn und eine Proteinquelle als Grundmuster jeder Hauptmahlzeit.', en: 'Vegetables, whole grains, and a protein source as the base pattern of every main meal.' },
        { de: 'Der Plan ist ein Startpunkt: tausche jede Mahlzeit, die nicht zu Alltag oder Verträglichkeit passt.', en: 'The plan is a starting point: swap any meal that does not fit your day or tolerance.' },
      ],
      preferredGoals: ['general_fitness', 'fat_loss', 'get_stronger'],
      proteinBias: 1.0,
      energyBias: 'balanced',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Eine praktische Lebensmitteloption, falls Mahlzeiten die geplante Proteinzufuhr nicht abdecken.',
          en: 'A convenient food option if meals do not cover the protein intake you planned.',
        },
      },
      {
        id: 'magnesium',
        label: { de: 'Magnesium', en: 'Magnesium' },
        reason: {
          de: 'Lebensmittel zuerst; unterstützt normale Muskel- und Nervenfunktion bei ausreichender Versorgung.',
          en: 'Food first; adequate intake supports normal muscle and nerve function.',
        },
      },
      {
        id: 'omega',
        label: { de: 'Omega-3', en: 'Omega-3' },
        reason: {
          de: 'Die Ernährung bleibt der erste Bezugspunkt; ein Supplement hängt vom individuellen Kontext ab.',
          en: 'Diet remains the first reference point; supplement usefulness depends on individual context.',
        },
      },
    ],
  },
  kaneki: {
    id: 'kaneki',
    name: 'Ken Kaneki',
    title: { de: 'Der adaptive Kontroll-Athlet', en: 'The Adaptive Control Athlete' },
    focus: {
      de: 'Zugkraft, Griffausdauer, Rumpfspannung, kontrollierte Bewegung und anpassungsfähige Kondition.',
      en: 'Pulling strength, grip endurance, trunk tension, controlled movement, and adaptable conditioning.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad priorisiert Rudervarianten, Carries, Rumpfkontrolle und ruhig gesteigerte Kondition.',
      en: 'Standard plans have been hidden. Your path prioritizes rows, carries, trunk control, and gradually progressed conditioning.',
    },
    tags: [
      { de: 'Zugkraft', en: 'Pull strength' },
      { de: 'Rumpfkontrolle', en: 'Trunk control' },
      { de: 'Anpassung', en: 'Adaptation' },
    ],
    foodFocus: {
      headline: {
        de: 'Anpassbare Mahlzeiten mit stabiler Proteinbasis',
        en: 'Adaptable meals on a stable protein base',
      },
      principles: [
        { de: 'Eine feste Proteinbasis pro Mahlzeit, der Rest bleibt flexibel austauschbar.', en: 'A fixed protein base per meal, with the rest freely interchangeable.' },
        { de: 'Kohlenhydrate an Trainingstagen etwas höher, an ruhigen Tagen niedriger — ohne strenge Regeln.', en: 'Slightly more carbohydrates on training days, less on quiet days — without strict rules.' },
        { de: 'Vorbereitbare Gerichte reduzieren Ausfälle an vollen Tagen.', en: 'Preparable dishes reduce missed meals on busy days.' },
      ],
      preferredGoals: ['build_muscle', 'general_fitness', 'get_stronger'],
      proteinBias: 1.1,
      energyBias: 'balanced',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Eine praktische Lebensmitteloption, wenn normale Mahlzeiten die geplante Proteinzufuhr nicht abdecken.',
          en: 'A convenient food option when regular meals do not cover the protein intake you planned.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann wiederholte kurze Kraftbelastungen bei manchen Erwachsenen unterstützen; individuelle Eignung bleibt wichtig.',
          en: 'May support repeated short strength efforts for some adults; individual suitability still matters.',
        },
      },
      {
        id: 'magnesium',
        label: { de: 'Magnesium', en: 'Magnesium' },
        reason: {
          de: 'Lebensmittel zuerst; eine ausreichende Zufuhr unterstützt normale Muskel- und Nervenfunktion.',
          en: 'Food first; adequate intake supports normal muscle and nerve function.',
        },
      },
    ],
  },
  sanji: {
    id: 'sanji',
    name: 'Sanji',
    title: { de: 'Der präzise Bein-Athlet', en: 'The Precision Leg Athlete' },
    focus: {
      de: 'Einbeinige Kraft, Beinkontrolle, Balance, Fußarbeit, Wadenkapazität und athletische Kondition.',
      en: 'Unilateral strength, leg control, balance, footwork, calf capacity, and athletic conditioning.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad verschiebt den Schwerpunkt auf Beine, Hüfte, Waden und stabile Landungen.',
      en: 'Standard plans have been hidden. Your path shifts the emphasis toward legs, hips, calves, and stable landings.',
    },
    tags: [
      { de: 'Beinkraft', en: 'Leg power' },
      { de: 'Balance', en: 'Balance' },
      { de: 'Fußarbeit', en: 'Footwork' },
    ],
    foodFocus: {
      headline: {
        de: 'Selbst gekochte Mahlzeiten mit klarer Struktur',
        en: 'Home-cooked meals with a clear structure',
      },
      principles: [
        { de: 'Frisch gekochte Hauptmahlzeiten, weil dieser Pfad ohnehin auf Kontrolle und Präzision setzt.', en: 'Freshly cooked main meals, because this path already builds on control and precision.' },
        { de: 'Kohlenhydrate rund um Bein- und Sprungarbeit, damit Landungen kontrolliert bleiben.', en: 'Carbohydrates around leg and jump work so landings stay controlled.' },
        { de: 'Genug Gesamtenergie: unterversorgte Beine erholen sich langsamer, nicht schneller.', en: 'Enough total energy: underfuelled legs recover slower, not faster.' },
      ],
      preferredGoals: ['get_stronger', 'general_fitness', 'build_muscle'],
      proteinBias: 1.05,
      energyBias: 'balanced',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Nur als praktische Lebensmitteloption, wenn normale Mahlzeiten die geplante Proteinzufuhr nicht abdecken.',
          en: 'Only as a convenient food option when regular meals do not cover the protein intake you planned.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann wiederholte kurze, intensive Bein- und Powerbelastungen bei manchen Erwachsenen unterstützen.',
          en: 'May support repeated short, intense leg and power efforts for some adults.',
        },
      },
      {
        id: 'magnesium',
        label: { de: 'Magnesium', en: 'Magnesium' },
        reason: {
          de: 'Die gesamte Ernährung bleibt entscheidend; ein Charakter-Pfad begründet keinen Supplementbedarf.',
          en: 'The complete food pattern remains decisive; a character path does not establish a supplement need.',
        },
      },
    ],
  },
  baki: {
    id: 'baki',
    name: 'Baki Hanma',
    title: { de: 'Der Ganzkörper-Kraftathlet', en: 'The Total-Body Strength Athlete' },
    focus: {
      de: 'Ganzkörperkraft, Rumpfspannung, kontrollierte Beweglichkeit, Carries und kurze intensive Arbeitsblöcke.',
      en: 'Full-body strength, bracing, controlled mobility, carries, and short intense work blocks.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad verbindet Drücken, Ziehen, Hüftkraft, Carries und Beweglichkeit ohne Extremversprechen.',
      en: 'Standard plans have been hidden. Your path combines pushing, pulling, hip strength, carries, and mobility without extreme promises.',
    },
    tags: [
      { de: 'Ganzkörperkraft', en: 'Full-body strength' },
      { de: 'Rumpfspannung', en: 'Bracing' },
      { de: 'Mobilität', en: 'Mobility' },
    ],
    foodFocus: {
      headline: {
        de: 'Kräftige Mahlzeiten für schwere Arbeitsblöcke',
        en: 'Substantial meals for heavy work blocks',
      },
      principles: [
        { de: 'Größere Hauptmahlzeiten, damit kurze intensive Blöcke nicht auf leeren Speichern laufen.', en: 'Larger main meals so short intense blocks do not run on empty stores.' },
        { de: 'Protein gleichmäßig verteilt statt in einer einzigen Mahlzeit gebündelt.', en: 'Protein spread evenly instead of bundled into a single meal.' },
        { de: 'Kein Extremansatz: Menge und Verträglichkeit gehen vor jedem Plan auf dem Papier.', en: 'No extreme approach: amount and tolerance come before any plan on paper.' },
      ],
      preferredGoals: ['get_stronger', 'build_muscle', 'general_fitness'],
      proteinBias: 1.1,
      energyBias: 'surplus',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Eine optionale Hilfe, um die geplante Proteinzufuhr praktisch zu ergänzen.',
          en: 'An optional convenience for completing the protein intake you planned.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann bestimmte wiederholte Kraft- und Powerbelastungen unterstützen; CORELINE erstellt keine Dosierung.',
          en: 'May support certain repeated strength and power efforts; CORELINE does not create a dose.',
        },
      },
      {
        id: 'preworkout',
        label: { de: 'Pre-Workout / Koffein', en: 'Pre-workout / caffeine' },
        reason: {
          de: 'Kontextabhängig: Gesamtmenge, Schlaf, Medikamente und individuelle Empfindlichkeit müssen zuerst geprüft werden.',
          en: 'Context dependent: total amount, sleep, medications, and individual sensitivity must be checked first.',
        },
      },
    ],
  },
  mikasa: {
    id: 'mikasa',
    name: 'Mikasa Ackerman',
    title: { de: 'Die taktische Ausdauer-Athletin', en: 'The Tactical Endurance Athlete' },
    focus: {
      de: 'Zugkraft, Carries, Rumpfstabilität, einbeinige Kontrolle und wiederholbare Ganzkörperausdauer.',
      en: 'Pulling strength, carries, core stability, unilateral control, and repeatable full-body endurance.',
    },
    systemMessage: {
      de: 'Standardpläne wurden ausgeblendet. Dein Pfad priorisiert effiziente Zugbewegungen, Carries, stabile Beine und kontrollierte Intervalle.',
      en: 'Standard plans have been hidden. Your path prioritizes efficient pulling, carries, stable legs, and controlled intervals.',
    },
    tags: [
      { de: 'Taktische Ausdauer', en: 'Tactical endurance' },
      { de: 'Zugkraft', en: 'Pull strength' },
      { de: 'Rumpfstabilität', en: 'Core stability' },
    ],
    foodFocus: {
      headline: {
        de: 'Wiederholbare Mahlzeiten mit hoher Nährstoffdichte',
        en: 'Repeatable meals with high nutrient density',
      },
      principles: [
        { de: 'Mahlzeiten, die sich vorbereiten und mehrfach wiederholen lassen, ohne langweilig zu werden.', en: 'Meals you can prepare ahead and repeat without them becoming dull.' },
        { de: 'Protein und Gemüse zuerst, Kohlenhydrate nach Umfang der geplanten Intervalle.', en: 'Protein and vegetables first, carbohydrates according to the planned interval volume.' },
        { de: 'Ausdauerarbeit rechtfertigt keine dauerhafte Unterversorgung.', en: 'Endurance work does not justify sustained underfuelling.' },
      ],
      preferredGoals: ['fat_loss', 'general_fitness', 'get_stronger'],
      proteinBias: 1.1,
      energyBias: 'lean',
    },
    recommendations: [
      {
        id: 'protein',
        label: { de: 'Proteinpulver', en: 'Protein powder' },
        reason: {
          de: 'Eine praktische Lebensmitteloption, falls die geplante Proteinzufuhr über Mahlzeiten schwer erreichbar ist.',
          en: 'A convenient food option if the protein intake you planned is difficult to reach through meals.',
        },
      },
      {
        id: 'kreatin',
        label: { de: 'Kreatin-Monohydrat', en: 'Creatine monohydrate' },
        reason: {
          de: 'Kann wiederholte kurze intensive Belastungen unterstützen; Nutzen und Eignung sind individuell.',
          en: 'May support repeated short intense efforts; usefulness and suitability are individual.',
        },
      },
      {
        id: 'omega',
        label: { de: 'Omega-3', en: 'Omega-3' },
        reason: {
          de: 'Lebensmittel bleiben der erste Bezugspunkt; ein Supplement hängt von Ernährung und individuellem Kontext ab.',
          en: 'Food remains the first reference point; a supplement depends on diet and individual context.',
        },
      },
    ],
  },
};

export function getCharacterPath(id?: InspirationProfileId): CharacterPathDefinition | null {
  return id ? CHARACTER_PATHS[id] ?? null : null;
}

export function localizedCharacterCopy(value: LocalizedCharacterCopy, language: string): string {
  return language === 'de' ? value.de : value.en;
}

export function filterCharacterWorkouts(
  workouts: Workout[],
  characterId: InspirationProfileId,
): Workout[] {
  return workouts.filter((workout) => (
    workout.inspirationProfile === characterId
    || (workout.source === 'generated'
      && workout.inspirationProfile === undefined
      && String(workout.id).startsWith('starter-'))
  ));
}
