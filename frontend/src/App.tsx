import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Assistant } from './components/Assistant';
import { OnboardScreen } from './components/AuthScreens';
import { CompleteOverlay } from './components/Overlays';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuildPanel } from './components/GuildPanel';
import { WeeklyReportPanel } from './components/WeeklyReportPanel';
import { NotificationCenter } from './components/NotificationCenter';
import { ProfileEditor } from './components/ProfileEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { ShoppingScreen } from './components/ShoppingScreen';
import { SystemIcon, type SystemIconName } from './components/SystemIcon';
import {
  BACKEND_CONFIGURATION_EVENT,
  checkCurrentBackendCapabilities,
  getBackendUrl,
  LOCAL_BACKEND_CAPABILITIES,
  type BackendCapabilities,
} from './lib/backend';
import { publishBackgroundSchedule } from './lib/backgroundReminders';
import { lang } from './lib/i18n';
import { GUILD_UPDATED_EVENT, getAccount, syncNow } from './lib/guild';
import { removeLegacyPseudoAuth, resolveInitialScreen } from './lib/localMode';
import { useModalIsolation } from './lib/modal';
import {
  NOTIFICATION_UPDATED_EVENT,
  getUnreadNotificationCount,
  processDueNotifications,
  snoozeLocalNotifications,
} from './lib/notifications';
import {
  FOOD_PLAN_UPDATED_EVENT,
  pendingFoodPlanOffer,
  type CharacterFoodPlanOffer,
} from './lib/foodPlan';
import { snoozeClosedAppPush } from './lib/push';
import { publishSocialPresence } from './lib/social';
import type { InitialPlan } from './lib/plans';
import { calculateNutritionTargetsForProfile, loadUserProfile } from './lib/profile';
import { requestAiInitialPlan } from './lib/remotePlan';
import { S } from './lib/storage';
import { getScreen, refresh, showScreen, type Screen, useAppState } from './lib/store';
import { applyTheme, getCurrentTheme } from './lib/themes';
import type { ProfileTab } from './components/ProfileScreen';

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

const KiScreen = lazy(() => import('./components/KiScreen').then((module) => ({ default: module.KiScreen })));
const CharacterFoodPlanOfferDialog = lazy(() => import('./components/CharacterFoodPlanOffer')
  .then((module) => ({ default: module.CharacterFoodPlanOfferDialog })));
const FuelScreen = lazy(() => import('./components/FuelScreen').then((module) => ({ default: module.FuelScreen })));
const TrainingScreen = lazy(() => import('./components/TrainingScreen').then((module) => ({ default: module.TrainingScreen })));
const ProfileScreen = lazy(() => import('./components/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));

function localCopy(de: string, en: string): string {
  return lang === 'de' ? de : en;
}

function lifestyleSummary(profile: ReturnType<typeof loadUserProfile>): string | undefined {
  if (!profile) return undefined;
  return [
    profile.lifestyle.workStudyPattern,
    profile.lifestyle.typicalDay,
    profile.lifestyle.activityLevel ? `${profile.lifestyle.activityLevel} activity level` : undefined,
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
  const selected = profile?.lifestyle.activityLevel;
  if (selected === 'high' || selected === 'very_high') return 'high';
  if (selected === 'sedentary' || selected === 'light') return 'low';
  if (selected === 'moderate') return 'moderate';
  const value = `${profile?.lifestyle.activityContext ?? ''} ${profile?.lifestyle.workStudyPattern ?? ''}`.toLowerCase();
  if (/physical|active|10k|10000|körperlich|viel beweg/.test(value)) return 'high';
  if (/desk|seated|sitting|büro|sitz|wenig beweg/.test(value)) return 'low';
  return 'moderate';
}

function backendLabel(capabilities: BackendCapabilities): string {
  if (!capabilities.configured) return localCopy('Nur lokal', 'Local only');
  if (!capabilities.reachable) return localCopy('Backend nicht erreichbar', 'Backend unavailable');
  if (capabilities.ai && capabilities.nearbyStores) return localCopy('KI + Einkauf freigegeben', 'AI + shopping enabled');
  if (capabilities.ai) return localCopy('KI freigegeben', 'AI enabled');
  if (capabilities.nearbyStores) return localCopy('Einkauf freigegeben', 'Shopping enabled');
  return localCopy('Backend erreichbar', 'Backend reachable');
}

function ScreenLoading() {
  return (
    <div className="screen active system-screen">
      <section className="system-page" role="status" aria-live="polite" aria-busy="true">
        <header className="system-page-header">
          <span className="system-heading-mark" aria-hidden="true"><SystemIcon name="today" /></span>
          <div>
            <h1>{localCopy('Bereich wird geladen', 'Loading section')}</h1>
            <p>{localCopy('Deine lokalen Daten bleiben verfügbar.', 'Your local data remains available.')}</p>
          </div>
        </header>
      </section>
    </div>
  );
}

export default function App() {
  useAppState();
  const screen = getScreen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [guildOpen, setGuildOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(() => getUnreadNotificationCount());
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('overview');
  const [completeStreak, setCompleteStreak] = useState<number | null>(null);
  const [foodPlanOffer, setFoodPlanOffer] = useState<CharacterFoodPlanOffer | null>(() => pendingFoodPlanOffer());
  const [foodPlanOfferDismissed, setFoodPlanOfferDismissed] = useState(false);
  const backendCheckGeneration = useRef(0);
  const [backendCapabilities, setBackendCapabilities] = useState<BackendCapabilities>(() => (
    getBackendUrl()
      ? { ...LOCAL_BACKEND_CAPABILITIES, configured: true }
      : LOCAL_BACKEND_CAPABILITIES
  ));
  const profile = loadUserProfile();
  const initialPlan = S.get<InitialPlan>('initial_plan');
  const onApp = Boolean(profile) && screen !== 'onboard';
  const assetBase = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
  const textureUrl = new URL(`${assetBase}assets/coreline/profile-codex/obsidian-vellum.webp`, window.location.href).href;
  const actionPlateUrl = new URL(`${assetBase}assets/coreline/profile-codex/action-plate.webp`, window.location.href).href;
  const performanceStillLifeUrl = new URL(`${assetBase}assets/coreline/system-world/performance-still-life.webp`, window.location.href).href;
  const nutritionProfileSignature = profile ? [
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.gender,
    profile.goal,
    profile.experience,
    profile.daysPerWeek,
    profile.lifestyle.activityLevel,
    profile.lifestyle.activityContext,
    profile.lifestyle.workStudyPattern,
    profile.lifestyle.typicalDay,
  ].join('|') : '';

  useModalIsolation(assistantOpen && onApp, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: () => setAssistantOpen(false),
  });

  const verifyBackend = useCallback(async () => {
    const generation = ++backendCheckGeneration.current;
    const capabilities = await checkCurrentBackendCapabilities();
    if (generation === backendCheckGeneration.current && capabilities) {
      setBackendCapabilities(capabilities);
    }
  }, []);

  useEffect(() => {
    void verifyBackend();
    window.addEventListener(BACKEND_CONFIGURATION_EVENT, verifyBackend);
    return () => window.removeEventListener(BACKEND_CONFIGURATION_EVENT, verifyBackend);
  }, [verifyBackend]);

  useEffect(() => {
    if (!onApp) return;
    const updateCount = () => setUnreadNotifications(getUnreadNotificationCount());
    const process = () => {
      void processDueNotifications().finally(() => {
        updateCount();
        // Refresh the plan the service worker uses while the app is closed.
        void publishBackgroundSchedule();
      });
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') process(); };
    process();
    const interval = window.setInterval(process, 60_000);
    window.addEventListener(NOTIFICATION_UPDATED_EVENT, updateCount);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(NOTIFICATION_UPDATED_EVENT, updateCount);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onApp]);

  useEffect(() => {
    if (!onApp) return;
    const syncOffer = () => {
      const offer = pendingFoodPlanOffer();
      setFoodPlanOffer(offer);
      if (offer) setFoodPlanOfferDismissed(false);
    };
    syncOffer();
    window.addEventListener(FOOD_PLAN_UPDATED_EVENT, syncOffer);
    return () => window.removeEventListener(FOOD_PLAN_UPDATED_EVENT, syncOffer);
  }, [onApp]);

  useEffect(() => {
    if (!onApp) return;
    let running = false;
    const syncConnectedAccount = async () => {
      if (running || !getBackendUrl() || !getAccount()) return;
      running = true;
      try {
        const result = await syncNow();
        if (result.status === 'pulled') refresh();
        await publishSocialPresence();
      } catch { /* local tracking must remain unaffected while the server is offline */ }
      running = false;
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void syncConnectedAccount(); };
    void syncConnectedAccount();
    const interval = window.setInterval(() => { void syncConnectedAccount(); }, 90_000);
    window.addEventListener(GUILD_UPDATED_EVENT, syncConnectedAccount);
    window.addEventListener(BACKEND_CONFIGURATION_EVENT, syncConnectedAccount);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(GUILD_UPDATED_EVENT, syncConnectedAccount);
      window.removeEventListener(BACKEND_CONFIGURATION_EVENT, syncConnectedAccount);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onApp]);

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
    const currentProfile = loadUserProfile();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('screen');
    const allowedScreens = new Set<Screen>(['dashboard', 'fuel', 'training', 'ki', 'profile', 'shopping']);
    if (params.get('pushAction') === 'snooze') {
      snoozeLocalNotifications(60);
      void snoozeClosedAppPush(60).catch(() => undefined);
    }
    showScreen(currentProfile && requested && allowedScreens.has(requested as Screen)
      ? requested as Screen
      : currentProfile ? 'dashboard' : resolveInitialScreen((key) => S.get(key)));
    if (requested || params.has('pushAction')) {
      params.delete('screen');
      params.delete('pushAction');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, [actionPlateUrl, performanceStillLifeUrl, textureUrl]);

  useEffect(() => {
    const current = loadUserProfile();
    if (!current) return;
    const targets = calculateNutritionTargetsForProfile(current, lang === 'de' ? 'de' : 'en');
    const previous = S.get<InitialPlan['nutritionTargets']>('nutrition_targets_v2');
    const unchanged = previous?.method === targets.method
      && previous.calories === targets.calories
      && previous.protein === targets.protein
      && previous.carbs === targets.carbs
      && previous.fat === targets.fat
      && previous.sugar === targets.sugar
      && previous.activityLevel === targets.activityLevel;
    if (unchanged) return;
    S.set('nutrition_targets_v2', targets);
    S.set('macros', {
      kcal: targets.calories,
      prot: targets.protein,
      carb: targets.carbs,
      fat: targets.fat,
      sug: targets.sugar,
    });
    const plan = S.get<InitialPlan>('initial_plan');
    if (plan) S.set('initial_plan', { ...plan, nutritionTargets: targets });
    refresh();
  }, [nutritionProfileSignature]);

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
    setNotificationsOpen(false);
    setProfileEditorOpen(false);
    showScreen('onboard');
  };

  const openShopping = () => {
    setAssistantOpen(false);
    showScreen('shopping');
  };

  const openProfileEditor = () => setProfileEditorOpen(true);
  const openProgressPhotos = () => {
    setProfileInitialTab('progress');
    showScreen('profile');
  };

  return (
    <div className="coreline-app">
      <a className="skip-link" href="#coreline-main">{localCopy('Zum Inhalt springen', 'Skip to content')}</a>
      <header className="system-topbar">
        <button className="system-wordmark wordmark-button" type="button" onClick={() => profile && showScreen('dashboard')}>
          CORELINE
        </button>
        <img
          className="system-sigil"
          src="./icons/coreline-mark.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="system-top-actions">
          <span className="system-sync-state">
            {backendLabel(backendCapabilities)}
          </span>
          {onApp && (
            <span className="notification-button-wrap">
              <button className="system-icon-button" type="button" onClick={() => {
                setSettingsOpen(false);
                setNotificationsOpen(true);
              }} aria-label={localCopy('Benachrichtigungen öffnen', 'Open notifications')}>
                <SystemIcon name="bell" />
              </button>
              {unreadNotifications > 0 && <b className="notification-unread-badge" aria-hidden="true">{Math.min(99, unreadNotifications)}</b>}
            </span>
          )}
          {onApp && (
            <button className="system-icon-button" type="button" onClick={() => setAssistantOpen(true)} aria-label={localCopy('CORELINE Guide öffnen', 'Open CORELINE Guide')}>
              <SystemIcon name="assistant" />
            </button>
          )}
          <button className="system-icon-button" type="button" onClick={() => {
            setNotificationsOpen(false);
            setSettingsOpen(true);
          }} aria-label={localCopy('Einstellungen öffnen', 'Open settings')}>
            <SystemIcon name="settings" />
          </button>
        </div>
      </header>

      <main id="coreline-main" tabIndex={-1}>
        <ErrorBoundary label={screen}>
          {screen === 'onboard' && (
            <OnboardScreen onAiPlanRequest={backendCapabilities.ai ? requestAiInitialPlan : undefined} />
          )}
          {screen === 'dashboard' && <Dashboard onComplete={setCompleteStreak} onOpenProgressPhotos={openProgressPhotos} />}
          {screen === 'fuel' && <Suspense fallback={<ScreenLoading />}><FuelScreen /></Suspense>}
          {screen === 'training' && <Suspense fallback={<ScreenLoading />}><TrainingScreen /></Suspense>}
          {screen === 'ki' && <Suspense fallback={<ScreenLoading />}><KiScreen /></Suspense>}
          {screen === 'shopping' && (
            <ShoppingScreen
              providerAvailable={backendCapabilities.nearbyStores}
              addressSearchAvailable={backendCapabilities.addressSearch}
            />
          )}
          {screen === 'profile' && (
            <Suspense fallback={<ScreenLoading />}>
              <ProfileScreen
                initialTab={profileInitialTab}
                onEditProfile={openProfileEditor}
                onOpenGuild={() => setGuildOpen(true)}
                onOpenReport={() => setReportOpen(true)}
                onOpenTraining={() => showScreen('training')}
                onOpenFood={() => showScreen('fuel')}
                onOpenSupplements={() => showScreen('ki')}
                onOpenShopping={openShopping}
                onAdjustPlan={openProfileEditor}
              />
            </Suspense>
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
              onClick={() => {
                if (item.screen === 'profile') setProfileInitialTab('overview');
                showScreen(item.screen);
              }}
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
                <Assistant
                  context={assistantContext}
                  title="CORELINE Guide"
                  onOpenShopping={openShopping}
                  remoteAvailable={backendCapabilities.ai}
                />
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
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLocalReset={resetWorkspace}
        onBackendStatusChange={setBackendCapabilities}
      />
      <NotificationCenter open={notificationsOpen && onApp} onClose={() => setNotificationsOpen(false)} />
      <GuildPanel open={guildOpen && onApp} onClose={() => setGuildOpen(false)} />
      <WeeklyReportPanel open={reportOpen && onApp} onClose={() => setReportOpen(false)} />
      {onApp && foodPlanOffer && !foodPlanOfferDismissed && (
        <Suspense fallback={null}>
          <CharacterFoodPlanOfferDialog
            offer={foodPlanOffer}
            onAccept={() => {
              setFoodPlanOffer(null);
              showScreen('fuel');
            }}
            onDecline={() => setFoodPlanOffer(null)}
            onDismiss={() => setFoodPlanOfferDismissed(true)}
          />
        </Suspense>
      )}
      <CompleteOverlay streak={completeStreak} onDismiss={() => setCompleteStreak(null)} />
    </div>
  );
}
