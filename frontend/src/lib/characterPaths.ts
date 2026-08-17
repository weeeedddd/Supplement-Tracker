import type { Workout } from './fitness';
import type { InspirationProfileId } from './plans';

export interface LocalizedCharacterCopy {
  de: string;
  en: string;
}

export interface CharacterSupplementMatch {
  id: string;
  label: LocalizedCharacterCopy;
  reason: LocalizedCharacterCopy;
}

export interface CharacterPathDefinition {
  id: InspirationProfileId;
  name: string;
  title: LocalizedCharacterCopy;
  focus: LocalizedCharacterCopy;
  systemMessage: LocalizedCharacterCopy;
  tags: LocalizedCharacterCopy[];
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
