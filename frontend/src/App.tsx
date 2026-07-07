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

const AV = ['◈', '◉', '◊'];
const THEME_BTNS = [
  { id: 'shadow', icon: '◈', title: 'Shadow Garden' },
  { id: 'system', icon: '⚡', title: 'The System' },
  { id: 'ghoul', icon: '👁', title: 'CCG Database' },
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
              <button className={`nav-btn${screen === 'dashboard' ? ' active' : ''}`} onClick={() => showScreen('dashboard')}>
                <span>{t('nav_dash').split(' ')[0]}</span>
                <span className="nav-label">{t('nav_dash').split(' ').slice(1).join(' ')}</span>
              </button>
              <button className={`nav-btn${screen === 'chat' ? ' active' : ''}`} onClick={() => showScreen('chat')}>
                <span>{t('nav_chat').split(' ')[0]}</span>
                <span className="nav-label">{t('nav_chat').split(' ').slice(1).join(' ')}</span>
              </button>
              <button className="logout-btn" onClick={logout}>
                <span>⏻</span><span className="nav-label">{t('btn_logout')}</span>
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
