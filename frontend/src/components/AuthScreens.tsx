// ── Login / Verify / Onboarding — TS-Port der Vanilla-Flows
import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/storage';
import { t } from '../lib/i18n';
import { showScreen } from '../lib/store';

const IconMail = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
const IconCamera = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;
const IconUser = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconLock = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconCheck = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconPlus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

export function LoginScreen() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [err, setErr] = useState('');
  const [lEmail, setLEmail] = useState(''); const [lPw, setLPw] = useState('');
  const [rEmail, setREmail] = useState(''); const [rUser, setRUser] = useState(''); const [rPw, setRPw] = useState('');

  const handleLogin = () => {
    setErr('');
    if (!lEmail.trim() || !lPw) { setErr(t('err_fields')); return; }
    const auth = S.get<any>('auth');
    if (!auth || auth.email !== lEmail.trim()) { setErr(t('err_notfound')); return; }
    if (auth.pw !== b64(lPw)) { setErr(t('err_pw_wrong')); return; }
    S.set('session', { email: lEmail.trim(), ts: Date.now() });
    const profile = S.get('profile'), protocol = S.get('protocol');
    if (!profile) showScreen('onboard');
    else if (!protocol) showScreen('ki');
    else showScreen('dashboard');
  };

  const handleRegister = () => {
    setErr('');
    if (!rEmail.trim() || !rUser.trim() || !rPw) { setErr(t('err_fields')); return; }
    if (rPw.length < 6) { setErr(t('err_pw')); return; }
    if (S.get<any>('auth')?.email === rEmail.trim()) { setErr(t('err_exists')); return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    S.set('_pending', { email: rEmail.trim(), username: rUser.trim(), pw: b64(rPw), code });
    showScreen('verify');
  };

  return (
    <div className="screen active" id="screen-login">
      <div className="login-wrap">
        <div className="login-logo">
          <span className="sigil">◈</span>
          <h1>SHADOW~1</h1>
          <p>{t('login_sub')}</p>
        </div>
        <div className="glass-card">
          <div className="tab-row">
            <button className={`tab-btn${tab === 'login' ? ' active' : ''}`} onClick={() => setTab('login')}>{t('tab_login')}</button>
            <button className={`tab-btn${tab === 'register' ? ' active' : ''}`} onClick={() => setTab('register')}>{t('tab_register')}</button>
          </div>
          {tab === 'login' ? (
            <div>
              <div className="fg"><input id="l-email" type="email" placeholder=" " value={lEmail} onChange={e => setLEmail(e.target.value)} /><label>{t('field_email')}</label></div>
              <div className="fg"><input id="l-pw" type="password" placeholder=" " value={lPw} onChange={e => setLPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} /><label>{t('field_pw')}</label></div>
              <div className="err-msg">{err}</div>
              <button className="action-btn" onClick={handleLogin}>{t('btn_login')}</button>
            </div>
          ) : (
            <div>
              <div className="fg"><input id="r-email" type="email" placeholder=" " value={rEmail} onChange={e => setREmail(e.target.value)} /><label>{t('field_email')}</label></div>
              <div className="fg"><input id="r-user" type="text" placeholder=" " value={rUser} onChange={e => setRUser(e.target.value)} /><label>{t('field_username')}</label></div>
              <div className="fg"><input id="r-pw" type="password" placeholder=" " value={rPw} onChange={e => setRPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} /><label>{t('field_pw')}</label></div>
              <div className="err-msg">{err}</div>
              <button className="action-btn" onClick={handleRegister}>{t('btn_register')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerifyScreen() {
  const pending = S.get<any>('_pending');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);
  if (!pending) { showScreen('login'); return null; }

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[i] = d; setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const verify = (code?: string) => {
    const entered = code || digits.join('');
    setErr('');
    if (entered.length < 6) { setErr(t('err_code_short')); return; }
    if (entered !== pending.code) { setErr(t('err_code_wrong')); return; }
    const uid = (S.get<number>('_uidctr') || 0) + 1;
    S.set('_uidctr', uid);
    S.set('auth', { email: pending.email, username: pending.username, pw: pending.pw, userId: '#' + String(uid).padStart(3, '0') });
    S.del('_pending');
    S.set('session', { email: pending.email, ts: Date.now() });
    showScreen('onboard');
  };

  return (
    <div className="screen active" id="screen-verify">
      <div className="verify-wrap">
        <div className="glass-card">
          <div className="verify-icon-wrap">{IconMail}</div>
          <div className="verify-title">{t('verify_title')}</div>
          <div className="verify-sub">{t('verify_sub')}</div>
          <div className="verify-email">{pending.email}</div>
          <div className="verify-hint">{t('verify_hint')} <span style={{ color: 'var(--gold)', fontWeight: 700, letterSpacing: '.2em' }}>{pending.code}</span></div>
          <div className="code-row">
            {digits.map((d, i) => (
              <input key={i} ref={el => { refs.current[i] = el; }} className="code-digit" maxLength={1} type="text" inputMode="numeric"
                value={d} onChange={e => setDigit(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
                  if (e.key === 'Enter') verify();
                }}
                onPaste={e => {
                  e.preventDefault();
                  const paste = e.clipboardData.getData('text').replace(/\D/g, '');
                  const next = paste.split('').slice(0, 6);
                  while (next.length < 6) next.push('');
                  setDigits(next);
                  if (paste.length >= 6) verify(paste.slice(0, 6));
                }} />
            ))}
          </div>
          <div className="err-msg">{err}</div>
          <button className="action-btn" onClick={() => verify()}>{t('btn_verify')}</button>
        </div>
      </div>
    </div>
  );
}

const AVATARS = ['◈', '◉', '◊'];

export function OnboardScreen() {
  const [step, setStep] = useState(1);
  const [avIdx, setAvIdx] = useState(0);
  const [avPhoto, setAvPhoto] = useState<string | null>(null);
  const [fn, setFn] = useState(''); const [age, setAge] = useState(''); const [ht, setHt] = useState(''); const [wt, setWt] = useState('');
  const [gender, setGender] = useState('m');
  const [goal, setGoal] = useState('bulk');

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { setAvPhoto(ev.target?.result as string); setAvIdx(99); };
    r.readAsDataURL(f);
  };

  const finish = () => {
    // Datenschutz: neutrale Defaults statt persönlicher Beispieldaten
    S.set('profile', {
      firstName: fn.trim() || 'Shadow',
      age: parseFloat(age) || 25, height: parseFloat(ht) || 180, weight: parseFloat(wt) || 80,
      gender, goal, avatarIdx: avIdx, avatarPhoto: avPhoto,
    });
    showScreen('ki');
  };

  return (
    <div className="screen active" id="screen-onboard">
      <div className="ob-wrap">
        {step === 1 && (
          <div className="ob-step active">
            <div className="glass-card">
              <div className="ob-title">{t('ob_av_title')}</div>
              <div className="ob-sub">{t('ob_av_sub')}</div>
              <div className="av-grid">
                {AVATARS.map((a, i) => (
                  <div key={i} className={`av-opt${avIdx === i ? ' sel' : ''}`} onClick={() => { setAvIdx(i); setAvPhoto(null); }}
                    style={{ fontSize: '1.7rem' }}>{a}</div>
                ))}
                <label className="av-opt">
                  <div className="av-up-label">{IconCamera}<span>{t('ob_upload')}</span></div>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={upload} />
                </label>
                {avPhoto && <div className={`av-opt${avIdx === 99 ? ' sel' : ''}`} onClick={() => setAvIdx(99)}><img src={avPhoto} alt="avatar" /></div>}
              </div>
              <button className="action-btn" onClick={() => setStep(2)}>{t('btn_next')}</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="ob-step active" id="ob2">
            <div className="glass-card">
              <div className="ob-title">{t('ob_prof_title')}</div>
              <div className="ob-sub">{t('ob_prof_sub')}</div>
              <div className="fg"><input id="ob-fn" type="text" placeholder=" " value={fn} onChange={e => setFn(e.target.value)} /><label>{t('ob_first')}</label></div>
              <div className="fg"><input id="ob-age" type="number" placeholder=" " value={age} onChange={e => setAge(e.target.value)} /><label>{t('ob_age')}</label></div>
              <div className="fg"><input id="ob-ht" type="number" placeholder=" " value={ht} onChange={e => setHt(e.target.value)} /><label>{t('ob_height')}</label></div>
              <div className="fg"><input id="ob-wt" type="number" placeholder=" " value={wt} onChange={e => setWt(e.target.value)} /><label>{t('ob_weight')}</label></div>
              <span className="gender-label">{t('ob_gender')}</span>
              <div className="gender-row">
                {(['m', 'f', 'x'] as const).map(g => (
                  <button key={g} className={`gender-btn${gender === g ? ' sel' : ''}`} data-g={g} onClick={() => setGender(g)}>
                    {t('gender_' + g)}
                  </button>
                ))}
              </div>
              <span className="gender-label">{t('ob_goal')}</span>
              <div className="goal-grid">
                {(['bulk', 'cut', 'perf', 'long'] as const).map(g => (
                  <button key={g} className={`goal-btn${goal === g ? ' sel' : ''}`} data-goal={g} onClick={() => setGoal(g)}>
                    {t('goal_' + g)}
                  </button>
                ))}
              </div>
              <button className="action-btn" onClick={finish}>{t('btn_continue')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
