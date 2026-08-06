import { useEffect, useMemo, useRef, useState } from 'react';
import { S } from './lib/storage';
import { getScreen, refresh, showScreen, useAppState } from './lib/store';
import { applyTheme, getCurrentTheme } from './lib/themes';
import { removeLegacyPseudoAuth, resolveInitialScreen } from './lib/localMode';
import { OnboardScreen } from './components/AuthScreens';
import { KiScreen } from './components/KiScreen';
import { Dashboard } from './components/Dashboard';
import { CompleteOverlay } from './components/Overlays';
import { FuelScreen } from './components/FuelScreen';
import { TrainingScreen } from './components/TrainingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsPanel } from './components/SettingsPanel';
import { Assistant } from './components/Assistant';

function AppIcon({ children }: { children: React.ReactNode }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

const icons = {
  dashboard: <AppIcon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></AppIcon>,
  fuel: <AppIcon><path d="M4 5h16"/><path d="M6 5v5a6 6 0 0 0 12 0V5"/><path d="M9 20h6"/></AppIcon>,
  training: <AppIcon><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></AppIcon>,
  routine: <AppIcon><path d="M8.5 4.5a5 5 0 0 1 7 7l-4 4a5 5 0 0 1-7-7z"/><path d="m8 12 4 4"/></AppIcon>,
  settings: <AppIcon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6v.1H10V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/></AppIcon>,
};

function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    resize();
    const particles = Array.from({ length: 32 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.1 + .25,
      dx: (Math.random() - .5) * .16,
      dy: (Math.random() - .5) * .16,
      opacity: Math.random() * .25 + .06,
    }));

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.fillStyle = 'rgb(94, 234, 212)';
      particles.forEach(particle => {
        particle.x = (particle.x + particle.dx + width) % width;
        particle.y = (particle.y + particle.dy + height) % height;
        context.globalAlpha = particle.opacity;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas id="cvs" ref={ref} aria-hidden="true" />;
}

export default function App() {
  useAppState();
  const screen = getScreen();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [completeStreak, setCompleteStreak] = useState<number | null>(null);
  const profile = S.get<any>('profile');
  const preferences = S.get<any>('plan_preferences');
  const initialPlan = S.get<any>('initial_plan');
  const onApp = Boolean(profile) && screen !== 'onboard';

  useEffect(() => {
    applyTheme(getCurrentTheme());
    removeLegacyPseudoAuth();
    showScreen(resolveInitialScreen(key => S.get(key)));
  }, []);

  const assistantContext = useMemo(() => ({
    displayName: profile?.firstName,
    weightKg: profile?.weight,
    goal: preferences?.goal || profile?.trainingGoal,
    diet: preferences?.diet || profile?.diet,
    equipment: preferences?.equipment || profile?.equipment,
    planSummary: initialPlan
      ? `${initialPlan.sourceLabel}: ${initialPlan.emphasis}; ${initialPlan.daysPerWeek} days per week.`
      : undefined,
  }), [profile, preferences, initialPlan]);

  const resetWorkspace = () => {
    showScreen('onboard');
    refresh();
  };

  const navItems = [
    { screen: 'dashboard' as const, label: 'Today', icon: icons.dashboard },
    { screen: 'fuel' as const, label: 'Food', icon: icons.fuel },
    { screen: 'training' as const, label: 'Training', icon: icons.training },
    { screen: 'ki' as const, label: 'Supplements', icon: icons.routine },
  ];

  return (
    <>
      <ParticleCanvas />
      <header className="top-bar">
        <div className="tb-left">
          {profile ? (
            <button className="profile-chip" onClick={() => setSettingsOpen(true)} aria-label="Open local profile settings">
              <span className="av-sm" aria-hidden="true">{profile.firstName?.slice(0, 1)?.toUpperCase() || 'C'}</span>
              <span className="pt">
                <span className="pt-name">{profile.firstName || 'Local athlete'}</span>
                <span className="pt-id">Saved on this device</span>
              </span>
            </button>
          ) : (
            <span className="shell-wordmark"><b>C</b><span>CORELINE</span></span>
          )}
        </div>

        <div className="tb-right">
          {onApp && (
            <nav className="primary-nav" aria-label="Primary">
              {navItems.map(item => (
                <button key={item.screen} className={screen === item.screen ? 'nav-btn active' : 'nav-btn'}
                  onClick={() => showScreen(item.screen)} aria-current={screen === item.screen ? 'page' : undefined}
                  title={item.label}>
                  {item.icon}<span className="nav-label">{item.label}</span>
                </button>
              ))}
            </nav>
          )}
          <span className="local-mode-pill">Offline ready</span>
          <button className="nav-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Open settings">
            {icons.settings}
          </button>
        </div>
      </header>

      <ErrorBoundary label={screen}>
        {screen === 'onboard' && <OnboardScreen />}
        {screen === 'ki' && <KiScreen />}
        {screen === 'dashboard' && <Dashboard onComplete={setCompleteStreak} />}
        {screen === 'fuel' && <FuelScreen />}
        {screen === 'training' && <TrainingScreen />}
      </ErrorBoundary>

      {onApp && (
        <>
          <button className="assistant-fab" onClick={() => setAssistantOpen(true)} aria-label="Open local guide">
            <span aria-hidden="true">✦</span><b>Guide</b>
          </button>
          {assistantOpen && (
            <div className="product-modal assistant-modal" role="presentation" onMouseDown={event => {
              if (event.target === event.currentTarget) setAssistantOpen(false);
            }}>
              <div className="assistant-dialog" role="dialog" aria-modal="true" aria-label="CORELINE local guide">
                <button autoFocus className="icon-button assistant-close" onClick={() => setAssistantOpen(false)} aria-label="Close local guide">×</button>
                <Assistant context={assistantContext} title="CORELINE guide" />
              </div>
            </div>
          )}
        </>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onLocalReset={resetWorkspace} />
      <CompleteOverlay streak={completeStreak} onDismiss={() => setCompleteStreak(null)} />
    </>
  );
}
