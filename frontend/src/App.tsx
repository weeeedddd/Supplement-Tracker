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

const THEME_BTNS = [
  { id: 'shadow', icon: IconMoon, title: 'Shadow Garden' },
  { id: 'system', icon: IconSun, title: 'The System' },
  { id: 'ghoul', icon: IconEye, title: 'CCG Database' },
];

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
  const screen = getScreen();

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
  const onApp = screen === 'dashboard' || screen === 'chat';

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
        </div>
      </div>

      {screen === 'login' && <LoginScreen />}
      {screen === 'verify' && <VerifyScreen />}
      {screen === 'onboard' && <OnboardScreen />}
      {screen === 'ki' && <KiScreen />}
      {screen === 'dashboard' && <Dashboard onComplete={n => setCompleteStreak(n)} />}
      {screen === 'chat' && <ChatScreen />}

      {screen === 'dashboard' && (
        <div className="bottom-bar">
          <button className="briefing-btn" onClick={() => setBriefingOpen(true)}>{t('btn_briefing')}</button>
        </div>
      )}

      <ProfileOverlay open={profileOpen} onClose={() => setProfileOpen(false)} />
      <BriefingModal open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <CompleteOverlay streak={completeStreak} onDismiss={() => setCompleteStreak(null)} />
    </>
  );
}
