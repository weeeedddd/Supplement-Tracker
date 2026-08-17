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
