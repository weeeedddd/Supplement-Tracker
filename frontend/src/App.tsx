import { useEffect, useMemo, useState } from 'react';

import { Assistant } from './components/Assistant';
import { OnboardScreen } from './components/AuthScreens';
import { CompleteOverlay } from './components/Overlays';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FuelScreen } from './components/FuelScreen';
import { KiScreen } from './components/KiScreen';
import { ProfileEditor } from './components/ProfileEditor';
import { ProfileScreen } from './components/ProfileScreen';
import { SettingsPanel } from './components/SettingsPanel';
import { ShoppingScreen } from './components/ShoppingScreen';
import { SystemIcon, type SystemIconName } from './components/SystemIcon';
import { TrainingScreen } from './components/TrainingScreen';
import { getBackendUrl } from './lib/backend';
import { lang } from './lib/i18n';
import { removeLegacyPseudoAuth, resolveInitialScreen } from './lib/localMode';
import { useModalIsolation } from './lib/modal';
import type { InitialPlan } from './lib/plans';
import { loadUserProfile } from './lib/profile';
import { requestAiInitialPlan } from './lib/remotePlan';
import { S } from './lib/storage';
import { getScreen, refresh, showScreen, type Screen, useAppState } from './lib/store';
import { applyTheme, getCurrentTheme } from './lib/themes';

interface NavigationItem {
  screen: Extract<Screen, 'dashboard' | 'fuel' | 'training' | 'ki' | 'profile'>;
  label: { de: string; en: string };
  icon: SystemIconName;
}

const NAVIGATION: NavigationItem[] = [
  { screen: 'dashboard', label: { de: 'Heute', en: 'Today' }, icon: 'today' },
  { screen: 'fuel', label: { de: 'Essen', en: 'Food' }, icon: 'food' },
  { screen: 'training', label: { de: 'Training', en: 'Training' }, icon: 'training' },
  { screen: 'ki', label: { de: 'Supps', en: 'Supps' }, icon: 'supplements' },
  { screen: 'profile', label: { de: 'Profil', en: 'Profile' }, icon: 'profile' },
];

function localCopy(de: string, en: string): string {
  return lang === 'de' ? de : en;
}

function lifestyleSummary(profile: ReturnType<typeof loadUserProfile>): string | undefined {
  if (!profile) return undefined;
  return [
    profile.lifestyle.workStudyPattern,
    profile.lifestyle.typicalDay,
    profile.lifestyle.activityContext,
    profile.lifestyle.sleepDurationHours === undefined ? undefined : `${profile.lifestyle.sleepDurationHours} h sleep`,
    profile.lifestyle.sleepQuality ? `${profile.lifestyle.sleepQuality} sleep quality` : undefined,
    profile.lifestyle.mealRhythm,
    profile.lifestyle.cookingAccess ? `${profile.lifestyle.cookingAccess} cooking access` : undefined,
    profile.lifestyle.stressRecovery,
    profile.lifestyle.injuriesLimitations,
  ].filter((value): value is string => Boolean(value)).join(' · ').slice(0, 1_200) || undefined;
}

function activityLevel(profile: ReturnType<typeof loadUserProfile>): 'low' | 'moderate' | 'high' {
  const value = `${profile?.lifestyle.activityContext ?? ''} ${profile?.lifestyle.workStudyPattern ?? ''}`.toLowerCase();
  if (/physical|active|10k|10000|körperlich|viel beweg/.test(value)) return 'high';
  if (/desk|seated|sitting|büro|sitz|wenig beweg/.test(value)) return 'low';
  return 'moderate';
}

export default function App() {
  useAppState();
  const screen = getScreen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [completeStreak, setCompleteStreak] = useState<number | null>(null);
  const profile = loadUserProfile();
  const initialPlan = S.get<InitialPlan>('initial_plan');
  const onApp = Boolean(profile) && screen !== 'onboard';
  const secureBackendConfigured = Boolean(getBackendUrl());
  const assetBase = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
  const textureUrl = new URL(`${assetBase}assets/coreline/profile-codex/obsidian-vellum.webp`, window.location.href).href;
  const actionPlateUrl = new URL(`${assetBase}assets/coreline/profile-codex/action-plate.webp`, window.location.href).href;
  const performanceStillLifeUrl = new URL(`${assetBase}assets/coreline/system-world/performance-still-life.webp`, window.location.href).href;

  useModalIsolation(assistantOpen && onApp, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: () => setAssistantOpen(false),
  });

  useEffect(() => {
    applyTheme(getCurrentTheme());
    removeLegacyPseudoAuth();
    document.documentElement.style.setProperty(
      '--coreline-texture',
      `url("${textureUrl}")`,
    );
    document.documentElement.style.setProperty(
      '--coreline-action-plate',
      `url("${actionPlateUrl}")`,
    );
    document.documentElement.style.setProperty(
      '--coreline-performance-still-life',
      `url("${performanceStillLifeUrl}")`,
    );
    showScreen(loadUserProfile() ? 'dashboard' : resolveInitialScreen((key) => S.get(key)));
  }, [actionPlateUrl, performanceStillLifeUrl, textureUrl]);

  const assistantContext = useMemo(() => ({
    displayName: profile?.displayName,
    age: profile?.age,
    weightKg: profile?.weightKg,
    goal: profile?.goal,
    diet: profile?.diet,
    dietaryPreferences: profile?.dietaryPreferences,
    equipment: profile?.equipment,
    planSummary: initialPlan
      ? `${initialPlan.sourceLabel}: ${initialPlan.emphasis}; ${initialPlan.daysPerWeek} training days per week.`
      : undefined,
    lifestyleSummary: lifestyleSummary(profile),
    activityLevel: activityLevel(profile),
    averageSleepHours: profile?.lifestyle.sleepDurationHours,
    planTitle: initialPlan?.sourceLabel,
    nutritionSummary: initialPlan
      ? `${initialPlan.foodGuidance} ${initialPlan.nutritionTargets.note}`
      : undefined,
    calorieTargetKcal: initialPlan?.nutritionTargets.calories,
    proteinTargetG: initialPlan?.nutritionTargets.protein,
  }), [profile, initialPlan]);

  const resetWorkspace = () => {
    setAssistantOpen(false);
    setProfileEditorOpen(false);
    showScreen('onboard');
  };

  const openShopping = () => {
    setAssistantOpen(false);
    showScreen('shopping');
  };

  const openProfileEditor = () => setProfileEditorOpen(true);

  return (
    <div className="coreline-app">
      <a className="skip-link" href="#coreline-main">{localCopy('Zum Inhalt springen', 'Skip to content')}</a>
      <header className="system-topbar">
        <button className="system-wordmark wordmark-button" type="button" onClick={() => profile && showScreen('dashboard')}>
          CORELINE
        </button>
        <span className="system-sigil" aria-hidden="true" />
        <div className="system-top-actions">
          <span className="system-sync-state">
            {secureBackendConfigured
              ? localCopy('Backend konfiguriert', 'Backend configured')
              : localCopy('Nur lokal', 'Local only')}
          </span>
          {onApp && (
            <button className="system-icon-button" type="button" onClick={() => setAssistantOpen(true)} aria-label={localCopy('CORELINE Guide öffnen', 'Open CORELINE Guide')}>
              <SystemIcon name="assistant" />
            </button>
          )}
          <button className="system-icon-button" type="button" onClick={() => setSettingsOpen(true)} aria-label={localCopy('Einstellungen öffnen', 'Open settings')}>
            <SystemIcon name="settings" />
          </button>
        </div>
      </header>

      <main id="coreline-main" tabIndex={-1}>
        <ErrorBoundary label={screen}>
          {screen === 'onboard' && (
            <OnboardScreen onAiPlanRequest={secureBackendConfigured ? requestAiInitialPlan : undefined} />
          )}
          {screen === 'dashboard' && <Dashboard onComplete={setCompleteStreak} />}
          {screen === 'fuel' && <FuelScreen />}
          {screen === 'training' && <TrainingScreen />}
          {screen === 'ki' && <KiScreen />}
          {screen === 'shopping' && <ShoppingScreen />}
          {screen === 'profile' && (
            <ProfileScreen
              onEditProfile={openProfileEditor}
              onOpenTraining={() => showScreen('training')}
              onOpenFood={() => showScreen('fuel')}
              onOpenSupplements={() => showScreen('ki')}
              onOpenShopping={openShopping}
              onAdjustPlan={openProfileEditor}
            />
          )}
        </ErrorBoundary>
      </main>

      {onApp && (
        <nav className="system-bottom-nav" aria-label={localCopy('Hauptnavigation', 'Main navigation')}>
          {NAVIGATION.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={screen === item.screen ? 'system-nav-item active' : 'system-nav-item'}
              onClick={() => showScreen(item.screen)}
              aria-current={screen === item.screen ? 'page' : undefined}
            >
              <SystemIcon name={item.icon} />
              <span>{lang === 'de' ? item.label.de : item.label.en}</span>
            </button>
          ))}
        </nav>
      )}

      {onApp && (
        <>
          {assistantOpen && (
            <div className="product-modal assistant-modal" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAssistantOpen(false);
            }}>
              <div className="assistant-dialog" role="dialog" aria-modal="true" aria-label={localCopy('CORELINE Guide', 'CORELINE Guide')}>
                <button className="icon-button assistant-close" type="button" onClick={() => setAssistantOpen(false)} aria-label={localCopy('Guide schließen', 'Close Guide')}>
                  <SystemIcon name="close" />
                </button>
                <Assistant context={assistantContext} title="CORELINE Guide" onOpenShopping={openShopping} />
              </div>
            </div>
          )}
        </>
      )}

      <ProfileEditor
        open={profileEditorOpen}
        onClose={() => setProfileEditorOpen(false)}
        onSaved={() => {
          setProfileEditorOpen(false);
          refresh();
        }}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onLocalReset={resetWorkspace} />
      <CompleteOverlay streak={completeStreak} onDismiss={() => setCompleteStreak(null)} />
    </div>
  );
}
