// ── App-Shell: Screen-Routing, TopBar, Partikel-Canvas, Overlays
import { useEffect, useRef, useState } from 'react';
import { S } from './lib/storage';
import { t, setLang, lang, LANGS } from './lib/i18n';
import { getScreen, showScreen, useAppState } from './lib/store';
import { applyTheme, getCurrentTheme, THEMES } from './lib/themes';
import { LoginScreen, VerifyScreen, OnboardScreen } from './components/AuthScreens';
import { KiScreen } from './components/KiScreen';
import { Dashboard } from './components/Dashboard';
import { ProfileOverlay, CompleteOverlay, BriefingModal } from './components/Overlays';
import { ChatScreen } from './components/ChatScreen';
import { FuelScreen } from './components/FuelScreen';
import { TrainingScreen } from './components/TrainingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

const IconLogout = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IconUser = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconDashboard = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const IconMessage = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconMoon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const IconSun = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
const IconEye = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconBell = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
const IconSettings = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IconShield = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IconGlobe = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IconPower = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>;
const IconEyeOff = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>;
const IconFuel = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="m7 8 1-4"/><path d="m12 8 .5-4"/><path d="m17 8-1-4"/></svg>;
const IconTrain = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>;

const AV = ['◈', '◉', '◊'];

const THEME_BTNS = [
  { id: 'shadow', icon: IconMoon, title: 'Shadow Garden' },
  { id: 'system', icon: IconSun, title: 'The System' },
  { id: 'ghoul', icon: IconEye, title: 'CCG Database' },
];

// Flaggen-Labels für das kompakte Sprach-Dropdown (mobil)
const LANG_LABEL: Record<string, string> = {
  de: '🇩🇪 Deutsch', en: '🇬🇧 English', ja: '🇯🇵 日本語', ko: '🇰🇷 한국어', es: '🇪🇸 Español',
};

function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const ctx = c.getContext('2d')!;
    let W = 0, H = 0, raf = 0;
    let ps: { x: number; y: number; r: number; vx: number; vy: number; o: number }[] = [];
    const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
    resize();
    ps = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .3,
      vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, o: Math.random() * .45 + .1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(124,58,237,.45)';
      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.globalAlpha = p.o; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas id="cvs" ref={ref} />;
}

export default function App() {
  useAppState();
  const [profileOpen, setProfileOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [completeStreak, setCompleteStreak] = useState<number | null>(null);
  const [menu, setMenu] = useState<null | 'lang' | 'set'>(null);   // mobile Dropdowns
  const screen = getScreen();

  // Kompakte Header-Dropdowns bei Klick außerhalb / Escape schließen
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: Event) => { if (!(e.target as HTMLElement).closest('.tb-menu')) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  // Boot: Theme setzen + Session-Routing (einmalig)
  useEffect(() => {
    applyTheme(getCurrentTheme());
    const sess = S.get('session');
    if (!sess) { showScreen('login'); return; }
    if (!S.get('profile')) { showScreen('onboard'); return; }
    if (!S.get('protocol')) { showScreen('ki'); return; }
    showScreen('dashboard');
  }, []);

  const auth = S.get<any>('auth');
  const profile = S.get<any>('profile');
  const sess = S.get('session');
  const onApp = screen === 'dashboard' || screen === 'chat' || screen === 'fuel' || screen === 'training';

  const logout = () => {
    S.del('session');
    setProfileOpen(false);
    showScreen('login');
  };

  return (
    <>
      <ParticleCanvas />
      <div className="top-bar">
        <div className="tb-left">
          {sess && onApp && auth && profile && (
            <div className="profile-chip" onClick={() => setProfileOpen(true)}>
              <div className="av-sm">{profile.avatarPhoto ? <img src={profile.avatarPhoto} alt="av" /> : (AV[profile.avatarIdx] || '◈')}</div>
              <div className="pt">
                <div className="pt-name">{profile.firstName || auth.username || 'Shadow'}</div>
                <div className="pt-id">{auth.userId || '#001'}</div>
              </div>
            </div>
          )}
        </div>
        <div className="tb-right">
          {sess && onApp && (
            <>
              {/* Mobil: nur Icons — .nav-label wird per CSS ausgeblendet */}
              <button className={`nav-btn${screen === 'dashboard' ? ' active' : ''}`} onClick={() => showScreen('dashboard')} title={t('nav_dash')}>
                {IconDashboard}
                <span className="nav-label">{t('nav_dash').split(' ').slice(1).join(' ')}</span>
              </button>
              <button className={`nav-btn${screen === 'fuel' ? ' active' : ''}`} onClick={() => showScreen('fuel')} title={t('nav_fuel')}>
                {IconFuel}
                <span className="nav-label">{t('nav_fuel')}</span>
              </button>
              <button className={`nav-btn${screen === 'training' ? ' active' : ''}`} onClick={() => showScreen('training')} title={t('nav_train')}>
                {IconTrain}
                <span className="nav-label">{t('nav_train')}</span>
              </button>
              <button className={`nav-btn${screen === 'chat' ? ' active' : ''}`} onClick={() => showScreen('chat')} title={t('nav_chat')}>
                {IconMessage}
                <span className="nav-label">{t('nav_chat').split(' ').slice(1).join(' ')}</span>
              </button>
              <button className="logout-btn" onClick={logout} title={t('btn_logout')}>
                {IconLogout}
                <span className="nav-label">{t('btn_logout')}</span>
              </button>
            </>
          )}
          {/* Desktop: einzelne Toggles inline */}
          <div className="theme-switcher">
            {THEME_BTNS.map(b => (
              <button key={b.id} className={`theme-btn${getCurrentTheme() === b.id ? ' active' : ''}`}
                data-theme={b.id} title={b.title} onClick={() => applyTheme(b.id)}>{b.icon}</button>
            ))}
          </div>
          <div className="lang-switcher">
            {LANGS.map(l => (
              <button key={l} className={`lang-btn${lang === l ? ' active' : ''}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>

          {/* Mobile: kompakte Glassmorphic-Dropdowns statt 8 Einzel-Buttons */}
          <div className="tb-compact">
            <div className="tb-menu">
              <button className="tb-menu-btn" aria-haspopup="menu" aria-expanded={menu === 'set'}
                title="Quick Settings" onClick={() => setMenu(menu === 'set' ? null : 'set')}>
                {IconSettings}
              </button>
              {menu === 'set' && (
                <div className="tb-pop" role="menu">
                  <div className="tb-pop-label">THEME</div>
                  {THEME_BTNS.map(b => (
                    <button key={b.id} role="menuitemradio" aria-checked={getCurrentTheme() === b.id}
                      className={`tb-pop-item${getCurrentTheme() === b.id ? ' active' : ''}`}
                      onClick={() => { applyTheme(b.id); setMenu(null); }}>
                      <span className="tb-pop-ic">{b.icon}</span><span>{b.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="tb-menu">
              <button className="tb-menu-btn tb-lang-btn" aria-haspopup="menu" aria-expanded={menu === 'lang'}
                title="Sprache / Language" onClick={() => setMenu(menu === 'lang' ? null : 'lang')}>
                {IconGlobe}<span className="tb-lang-code">{lang.toUpperCase()}</span>
                <span className="tb-caret" aria-hidden="true">▾</span>
              </button>
              {menu === 'lang' && (
                <div className="tb-pop tb-pop-lang" role="menu">
                  {LANGS.map(l => (
                    <button key={l} role="menuitemradio" aria-checked={lang === l}
                      className={`tb-pop-item${lang === l ? ' active' : ''}`}
                      onClick={() => { setLang(l); setMenu(null); }}>{LANG_LABEL[l] || l.toUpperCase()}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Jeder Screen in einer eigenen ErrorBoundary — ein Crash schwärzt nie die App */}
      <ErrorBoundary label={screen}>
        {screen === 'login' && <LoginScreen />}
        {screen === 'verify' && <VerifyScreen />}
        {screen === 'onboard' && <OnboardScreen />}
        {screen === 'ki' && <KiScreen />}
        {screen === 'dashboard' && <Dashboard onComplete={n => setCompleteStreak(n)} />}
        {screen === 'chat' && <ChatScreen />}
        {screen === 'fuel' && <FuelScreen />}
        {screen === 'training' && <TrainingScreen />}
      </ErrorBoundary>

      {screen === 'dashboard' && (
        <div className="bottom-bar">
          <button className="briefing-btn" onClick={() => setBriefingOpen(true)}>{t('btn_briefing')}</button>
        </div>
      )}

      <ErrorBoundary label="profile-overlay">
        <ProfileOverlay open={profileOpen} onClose={() => setProfileOpen(false)} />
      </ErrorBoundary>
      <BriefingModal open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <CompleteOverlay streak={completeStreak} onDismiss={() => setCompleteStreak(null)} />
    </>
  );
}
