import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getCharacterPath } from '../lib/characterPaths';
import { getFoodLog } from '../lib/engine';
import { getWorkoutSessions, type WorkoutSession } from '../lib/fitness';
import { lang } from '../lib/i18n';
import { loadUserProfile, type UserProfileV3 } from '../lib/profile';
import { dateKey, S } from '../lib/storage';
import { useAppState } from '../lib/store';
import { ProgressPhotoPanel } from './ProgressPhotoPanel';
import { SystemIcon, type SystemIconName } from './SystemIcon';

export type ProfileTab = 'overview' | 'plan' | 'history' | 'progress';

export interface ProfileScreenProps {
  onOpenGuild?: () => void;
  onOpenReport?: () => void;
  onEditProfile: () => void;
  onOpenTraining: () => void;
  onOpenFood: () => void;
  onOpenSupplements: () => void;
  onOpenShopping: () => void;
  initialTab?: ProfileTab;
  /** Opens a review/edit flow. The Profile Codex never replaces stored plans itself. */
  onAdjustPlan: () => void;
}

interface StoredPlanSession {
  day?: number;
  title?: string;
  focus?: string;
  durationMinutes?: number;
}

interface StoredPlanSummary {
  sourceLabel?: string;
  emphasis?: string;
  difficulty?: string;
  createdAt?: string;
  sessions: StoredPlanSession[];
}

interface MatrixRow {
  id: string;
  icon: SystemIconName;
  label: string;
  summary: string;
  action: () => void;
}

const TABS: Array<{ id: ProfileTab; icon: SystemIconName; de: string; en: string }> = [
  { id: 'overview', icon: 'profile', de: 'Übersicht', en: 'Overview' },
  { id: 'plan', icon: 'plan', de: 'Plan', en: 'Plan' },
  { id: 'history', icon: 'history', de: 'Verlauf', en: 'History' },
  { id: 'progress', icon: 'camera', de: 'Fotos', en: 'Photos' },
];

const copy = (de: string, en: string): string => lang === 'de' ? de : en;
const locale = (): string => lang === 'de' ? 'de-DE' : 'en-GB';
const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function concise(value: string, maximum = 132): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function localAvatarPhoto(value?: string | null): string | null {
  if (!value) return null;
  return /^data:image\/(?:avif|jpeg|png|webp);base64,/i.test(value) ? value : null;
}

function readStoredPlan(): StoredPlanSummary | null {
  const raw = S.get<unknown>('initial_plan');
  if (!isRecord(raw)) return null;

  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.flatMap((candidate): StoredPlanSession[] => {
      if (!isRecord(candidate)) return [];
      const session: StoredPlanSession = {};
      const day = optionalFiniteNumber(candidate.day);
      const title = optionalText(candidate.title);
      const focus = optionalText(candidate.focus);
      const durationMinutes = optionalFiniteNumber(candidate.durationMinutes);
      if (day !== undefined) session.day = day;
      if (title !== undefined) session.title = title;
      if (focus !== undefined) session.focus = focus;
      if (durationMinutes !== undefined) session.durationMinutes = durationMinutes;
      return title || focus || day !== undefined ? [session] : [];
    })
    : [];

  const sourceLabel = optionalText(raw.sourceLabel);
  const emphasis = optionalText(raw.emphasis);
  const difficulty = optionalText(raw.difficulty);
  const createdAt = optionalText(raw.createdAt);
  if (!sourceLabel && !emphasis && sessions.length === 0) return null;
  return { sourceLabel, emphasis, difficulty, createdAt, sessions };
}

function safeProtocolIds(): string[] {
  const value = S.get<unknown>('protocol');
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((item): string[] => {
    if (!isRecord(item)) return [];
    const id = optionalText(item.id);
    return id ? [id] : [];
  });
  return [...new Set(ids)];
}

function safeTodaySupplementIds(): string[] {
  const value = S.get<unknown>(`day_${dateKey()}`);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function labelGoal(profile: UserProfileV3): string {
  const labels = {
    general_fitness: copy('Allgemeine Fitness', 'General fitness'),
    build_muscle: copy('Muskelaufbau', 'Build muscle'),
    get_stronger: copy('Kraftaufbau', 'Get stronger'),
    fat_loss: copy('Fettverlust', 'Fat loss'),
  } as const;
  return labels[profile.goal];
}

function labelExperience(profile: UserProfileV3): string {
  const labels = {
    beginner: copy('Einsteiger', 'Beginner'),
    intermediate: copy('Fortgeschritten', 'Intermediate'),
    advanced: copy('Erfahren', 'Advanced'),
  } as const;
  return labels[profile.experience];
}

function labelDiet(profile: UserProfileV3): string {
  const labels = {
    flexible: copy('Flexibel', 'Flexible'),
    omnivore: copy('Omnivor', 'Omnivore'),
    vegetarian: copy('Vegetarisch', 'Vegetarian'),
    vegan: copy('Vegan', 'Vegan'),
  } as const;
  return labels[profile.diet];
}

function labelDifficulty(profile: UserProfileV3): string {
  const labels = {
    light: copy('Leicht', 'Light'),
    medium: copy('Mittel', 'Medium'),
    hard: copy('Hart', 'Hard'),
  } as const;
  return labels[profile.difficulty];
}

function labelMode(profile: UserProfileV3): string {
  if (profile.mode === 'inspiration') {
    const profileName = getCharacterPath(profile.inspirationProfile)?.name ?? copy('Inspiration', 'Inspiration');
    return `${profileName} · ${copy('exklusiver Charakterpfad', 'exclusive character path')}`;
  }
  if (profile.mode === 'guided') return copy('Geführter Plan', 'Guided plan');
  return 'Own Path';
}

function equipmentSummary(profile: UserProfileV3): string {
  const labels = {
    bodyweight: copy('Körpergewicht', 'Bodyweight'),
    dumbbells: copy('Kurzhanteln', 'Dumbbells'),
    resistance_bands: copy('Widerstandsbänder', 'Resistance bands'),
    full_gym: copy('Fitnessstudio', 'Full gym'),
  } as const;
  return profile.equipment.map(item => labels[item]).join(', ');
}

function sleepSummary(profile: UserProfileV3): string {
  const hours = profile.lifestyle.sleepDurationHours;
  const quality = profile.lifestyle.sleepQuality;
  const qualityLabels = {
    poor: copy('schlecht', 'poor'),
    fair: copy('okay', 'fair'),
    good: copy('gut', 'good'),
    variable: copy('wechselhaft', 'variable'),
  } as const;
  if (hours !== undefined && quality) return `${hours.toLocaleString(locale())} h · ${qualityLabels[quality]}`;
  if (hours !== undefined) return `${hours.toLocaleString(locale())} h`;
  if (quality) return qualityLabels[quality];
  return copy('Noch nicht beschrieben', 'Not described yet');
}

function everydaySummary(profile: UserProfileV3): string {
  return concise(profile.lifestyle.workStudyPattern
    ?? profile.lifestyle.activityContext
    ?? profile.lifestyle.typicalDay
    ?? copy('Noch nicht beschrieben', 'Not described yet'));
}

function nutritionSummary(profile: UserProfileV3): string {
  const details = [labelDiet(profile), profile.lifestyle.mealRhythm, ...profile.dietaryPreferences]
    .filter((item): item is string => Boolean(item));
  return concise(details.join(' · '));
}

function formatStoredDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale(), { dateStyle: 'medium' });
}

function formatSessionDate(session: WorkoutSession): string {
  const parsed = new Date(session.completedAt);
  if (!Number.isFinite(parsed.getTime())) return copy('Datum unbekannt', 'Date unknown');
  return parsed.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export function ProfileScreen({
  onEditProfile,
  onOpenGuild,
  onOpenReport,
  onOpenTraining,
  onOpenFood,
  onOpenSupplements,
  onOpenShopping,
  onAdjustPlan,
  initialTab = 'overview',
}: ProfileScreenProps) {
  useAppState();
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const profile = loadUserProfile();

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  if (!profile) {
    return (
      <section className="screen active system-screen" id="screen-profile" aria-labelledby="profile-empty-title">
        <div className="system-page profile-codex">
          <header className="system-page-header">
            <div className="system-heading-mark" aria-hidden="true"><SystemIcon name="profile" /></div>
            <div>
              <h1 id="profile-empty-title">{copy('Profil einrichten', 'Set up profile')}</h1>
              <p>{copy(
                'Dein lokales Profil ist noch nicht vollständig eingerichtet. Deine Angaben bleiben auf diesem Gerät, bis du eine optionale Übertragung ausdrücklich bestätigst.',
                'Your local profile is not set up yet. Your details stay on this device unless you explicitly approve an optional transfer.',
              )}</p>
            </div>
          </header>
          <button type="button" className="system-primary-action" onClick={onEditProfile}>
            <SystemIcon name="edit" />
            {copy('Profil vervollständigen', 'Complete profile')}
          </button>
        </div>
      </section>
    );
  }

  const plan = readStoredPlan();
  const workouts = getWorkoutSessions().filter(session => (
    Number.isFinite(session.completedAt)
    && Number.isFinite(session.completedSets)
    && Number.isFinite(session.totalSets)
    && session.completedSets >= 0
    && session.totalSets > 0
  ));
  const foods = getFoodLog();
  const protocolIds = safeProtocolIds();
  const completedSupplementIds = new Set(safeTodaySupplementIds());
  const completedSupplements = protocolIds.filter(id => completedSupplementIds.has(id)).length;
  const avatarPhoto = localAvatarPhoto(profile.appearance?.avatarPhoto);
  const portraitSrc = avatarPhoto
    || `${baseUrl}assets/coreline/profile-codex/profile-shadow.webp`;

  const matrixRows: MatrixRow[] = [
    ...(onOpenGuild ? [{
      id: 'guild',
      icon: 'shield' as const,
      label: copy('Gilde', 'Guild'),
      summary: copy('Mitglieder, Wochen-Raids und Geräte-Sync',
                    'Members, weekly raids and device sync'),
      action: onOpenGuild,
    }] : []),
    ...(onOpenReport ? [{
      id: 'report',
      icon: 'history' as const,
      label: copy('Wochenbericht', 'Weekly report'),
      summary: copy('Balance, Volumen, Konstanz und Rekorde mit Belegen',
                    'Balance, volume, consistency and records with evidence'),
      action: onOpenReport,
    }] : []),
    {
      id: 'everyday',
      icon: 'lifestyle',
      label: copy('Alltag', 'Daily life'),
      summary: everydaySummary(profile),
      action: onEditProfile,
    },
    {
      id: 'training',
      icon: 'training',
      label: copy('Training', 'Training'),
      summary: `${profile.daysPerWeek} ${copy('Tage', 'days')} · ${labelExperience(profile)} · ${equipmentSummary(profile)}`,
      action: onOpenTraining,
    },
    {
      id: 'nutrition',
      icon: 'food',
      label: copy('Ernährung', 'Nutrition'),
      summary: nutritionSummary(profile),
      action: onOpenFood,
    },
    {
      id: 'sleep',
      icon: 'sleep',
      label: copy('Schlaf', 'Sleep'),
      summary: sleepSummary(profile),
      action: onEditProfile,
    },
    {
      id: 'supplements',
      icon: 'supplements',
      label: copy('Supplemente', 'Supplements'),
      summary: protocolIds.length
        ? copy(`${protocolIds.length} Einträge in deiner Routine`, `${protocolIds.length} items in your routine`)
        : copy('Keine Routine ausgewählt', 'No routine selected'),
      action: onOpenSupplements,
    },
  ];

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const createdAt = formatStoredDate(plan?.createdAt);
  const consumed = foods.reduce(
    (total, entry) => ({ kcal: total.kcal + entry.kcal, protein: total.protein + entry.prot }),
    { kcal: 0, protein: 0 },
  );

  return (
    <section className="screen active system-screen" id="screen-profile" aria-labelledby="profile-title">
      <div className="system-page profile-codex">
        <section className="profile-dossier" aria-label={copy('Profildossier', 'Profile dossier')}>
          <div className="profile-portrait">
            <img
              src={portraitSrc}
              alt={avatarPhoto
                ? copy(`Profilbild von ${profile.displayName}`, `Profile image of ${profile.displayName}`)
                : copy('Abstrakte CORELINE Profilsilhouette', 'Abstract CORELINE profile silhouette')}
              decoding="async"
            />
          </div>
          <div className="profile-plane">
            <h1 id="profile-title">{profile.displayName}</h1>
            <p>{labelMode(profile)} · {labelGoal(profile)}</p>
            <div className="profile-summary">
              <div className="profile-summary-row">
                <SystemIcon name="profile" aria-hidden="true" />
                <div>
                  <strong>{profile.age} {copy('Jahre', 'years')} · {profile.heightCm.toLocaleString(locale())} cm · {profile.weightKg.toLocaleString(locale())} kg</strong>
                  <span>{copy('Lokale Basisdaten', 'Local baseline data')}</span>
                </div>
              </div>
              <div className="profile-summary-row">
                <SystemIcon name="training" aria-hidden="true" />
                <div>
                  <strong>{profile.daysPerWeek} {copy('Trainingstage', 'training days')} · {labelExperience(profile)}</strong>
                  <span>{equipmentSummary(profile)}</span>
                </div>
              </div>
              <div className="profile-summary-row">
                <SystemIcon name="target" aria-hidden="true" />
                <div>
                  <strong>{labelGoal(profile)} · {labelDifficulty(profile)}</strong>
                  <span>{labelDiet(profile)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="codex-tabs" role="tablist" aria-label={copy('Profilbereiche', 'Profile sections')}>
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              className={activeTab === tab.id ? 'codex-tab active' : 'codex-tab'}
              aria-selected={activeTab === tab.id}
              aria-controls={`profile-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <SystemIcon name={tab.icon} aria-hidden="true" />
              <span>{lang === 'de' ? tab.de : tab.en}</span>
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div
            id="profile-panel-overview"
            role="tabpanel"
            aria-labelledby="profile-tab-overview"
            tabIndex={0}
          >
            <div className="profile-matrix">
              {matrixRows.map(row => (
                <button key={row.id} type="button" className="profile-matrix-row" onClick={row.action}>
                  <span className="profile-matrix-icon" aria-hidden="true"><SystemIcon name={row.icon} /></span>
                  <strong>{row.label}</strong>
                  <span className="profile-matrix-copy">{row.summary}</span>
                  <SystemIcon name="chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div
            id="profile-panel-plan"
            role="tabpanel"
            aria-labelledby="profile-tab-plan"
            tabIndex={0}
          >
            <div className="profile-history">
              {plan ? (
                <>
                  <article>
                    <h2>{plan.sourceLabel ?? copy('Gespeicherter Plan', 'Saved plan')}</h2>
                    <p>
                      {[plan.emphasis, plan.difficulty, createdAt ? copy(`gespeichert ${createdAt}`, `saved ${createdAt}`) : null]
                        .filter((item): item is string => Boolean(item))
                        .join(' · ')}
                    </p>
                  </article>
                  {plan.sessions.map((session, index) => (
                    <article key={`${session.day ?? 'session'}-${index}`}>
                      <h2>{session.title ?? copy(`Einheit ${session.day ?? index + 1}`, `Session ${session.day ?? index + 1}`)}</h2>
                      <p>
                        {[session.focus, session.durationMinutes !== undefined
                          ? copy(`etwa ${session.durationMinutes} Minuten`, `about ${session.durationMinutes} minutes`)
                          : null]
                          .filter((item): item is string => Boolean(item))
                          .join(' · ')}
                      </p>
                    </article>
                  ))}
                </>
              ) : (
                <article>
                  <h2>{copy('Noch kein gespeicherter Plan', 'No saved plan yet')}</h2>
                  <p>{copy(
                    'Deine Profildaten sind vorhanden, aber es wurde kein Plan im lokalen Speicher gefunden.',
                    'Your profile data exists, but no plan was found in local storage.',
                  )}</p>
                </article>
              )}
            </div>
            <button type="button" className="system-button quiet profile-shopping-link" onClick={onOpenShopping}>
              <SystemIcon name="store" aria-hidden="true" />
              {copy('Einkaufsradar öffnen', 'Open shopping radar')}
            </button>
          </div>
        )}

        {activeTab === 'history' && (
          <div
            id="profile-panel-history"
            role="tabpanel"
            aria-labelledby="profile-tab-history"
            tabIndex={0}
          >
            <div className="profile-history">
              {workouts.slice(0, 5).map(session => (
                <article key={session.id}>
                  <h2>{session.name}</h2>
                  <p>{session.completedSets}/{session.totalSets} {copy('Sätze', 'sets')} · {formatSessionDate(session)}</p>
                </article>
              ))}
              {foods.length > 0 && (
                <article>
                  <h2>{copy('Ernährung heute', 'Nutrition today')}</h2>
                  <p>{foods.length} {copy('Einträge', 'entries')} · {Math.round(consumed.kcal)} kcal · {Math.round(consumed.protein)} g {copy('Protein', 'protein')}</p>
                </article>
              )}
              {protocolIds.length > 0 && (
                <article>
                  <h2>{copy('Supplement-Routine heute', 'Supplement routine today')}</h2>
                  <p>{completedSupplements}/{protocolIds.length} {copy('Einträge abgehakt', 'items checked')}</p>
                </article>
              )}
              {workouts.length === 0 && foods.length === 0 && protocolIds.length === 0 && (
                <article>
                  <h2>{copy('Noch kein lokaler Verlauf', 'No local history yet')}</h2>
                  <p>{copy(
                    'Abgeschlossene Trainingseinheiten sowie heutige Ernährungs- und Routineeinträge erscheinen hier.',
                    'Completed workouts plus today’s nutrition and routine entries will appear here.',
                  )}</p>
                </article>
              )}
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div
            id="profile-panel-progress"
            role="tabpanel"
            aria-labelledby="profile-tab-progress"
            tabIndex={0}
          >
            <ProgressPhotoPanel age={profile.age} locale={lang === 'de' ? 'de' : 'en'} />
          </div>
        )}

        <button type="button" className="system-primary-action profile-primary" onClick={onAdjustPlan}>
          <SystemIcon name="edit" aria-hidden="true" />
          {copy('Profil & Ziele bearbeiten', 'Edit profile & goals')}
        </button>
      </div>
    </section>
  );
}
