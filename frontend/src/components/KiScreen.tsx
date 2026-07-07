// ── Shadow-KI Onboarding-Chat — TS-Port mit Sprach-Fix und
//    "ACCESS GRANTED"-Lesezeit (~12s Chat, Weiterleitung nach ~15,5s)
import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/storage';
import { t } from '../lib/i18n';
import { showScreen } from '../lib/store';
import { buildFallbackResponse, resetKiAns } from '../lib/ki';
import type { Profile } from '../lib/engine';

interface Msg { role: 'ai' | 'user'; content: string; ts: string; }

export function KiScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [genPhase, setGenPhase] = useState(false);
  const [status, setStatus] = useState('// Verbindung wird aufgebaut…');
  const chatRef = useRef<HTMLDivElement>(null);
  const histRef = useRef<{ role: string; content: string }[]>([]);
  const timers = useRef<number[]>([]);

  const now = () => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    resetKiAns();
    const profile = S.get<Profile>('profile');
    const name = profile?.firstName || 'Chosen One';
    const timer = window.setTimeout(() => {
      const greeting = t('ki_greeting').replace('{name}', name);
      histRef.current.push({ role: 'ai', content: greeting });
      setMsgs([{ role: 'ai', content: greeting, ts: now() }]);
      setStatus('// Online · Freier Antwort-Modus aktiv');
    }, 420);
    return () => { clearTimeout(timer); timers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, thinking]);

  const send = () => {
    const txt = input.trim();
    if (!txt || done || thinking) return;
    setInput('');
    histRef.current.push({ role: 'user', content: txt });
    setMsgs(m => [...m, { role: 'user', content: txt, ts: now() }]);
    setThinking(true);

    window.setTimeout(() => {
      const profile = S.get<Profile>('profile') || ({} as Partial<Profile>);
      const resp = buildFallbackResponse(histRef.current, profile);
      setThinking(false);
      histRef.current.push({ role: 'ai', content: resp.message });
      setMsgs(m => [...m, { role: 'ai', content: resp.message, ts: now() }]);

      if (resp.finalEvaluation) {
        setDone(true);
        S.set('ki_chat', histRef.current);
        if (resp.macros) S.set('macros', resp.macros);
        if (resp.protocol) S.set('protocol', resp.protocol);
        // "ACCESS GRANTED" in Ruhe lesbar: ~12s Chat, Weiterleitung nach ~15,5s
        setStatus(t('ki_redirect'));
        timers.current.push(window.setTimeout(() => setGenPhase(true), 12000));
        timers.current.push(window.setTimeout(() => showScreen('dashboard'), 15500));
      }
    }, 700 + Math.random() * 500);
  };

  return (
    <div className="screen active" id="screen-ki">
      <div className="ki-chat-wrap">
        <div className="ki-chat-hd">
          <div className="ki-sigil-sm">◈</div>
          <div>
            <div className="ki-chat-hd-title">{t('ki_title')}</div>
            <div className="ki-chat-hd-sub">{genPhase ? t('ki_saved') : status}</div>
          </div>
        </div>
        {!genPhase ? (
          <>
            <div className="ki-chat" ref={chatRef}>
              {msgs.map((m, i) => (
                <div key={i} className={`ki-msg ${m.role}`}>
                  <div className="ki-msg-bubble">{m.content.split('\n').map((l, j) => <span key={j}>{l}<br /></span>)}</div>
                  <div className="ki-msg-ts">{m.role === 'ai' ? '◈ SHADOW AI' : t('ki_you')} · {m.ts}</div>
                </div>
              ))}
            </div>
            {thinking && (
              <div className="ki-thinking" style={{ display: 'flex' }}>
                <span className="ki-think-dot" /><span className="ki-think-dot" /><span className="ki-think-dot" />
                <span className="ki-think-label">{t('ki_thinking')}</span>
              </div>
            )}
            <div className="ki-input-row" style={{ display: 'flex' }}>
              <input className="ki-text-input" type="text" value={input} disabled={done || thinking}
                placeholder={t('ki_input_ph')}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(); }} />
              <button className="ki-send-btn" disabled={done || thinking} onClick={send}>▶</button>
            </div>
          </>
        ) : (
          <div className="ki-gen" style={{ display: 'flex' }}>
            <div className="ki-rings"><div className="ki-sigil-c">◈</div></div>
            <p>{t('ki_generating')}</p>
            <div className="ki-api-status ok">{t('ki_saved')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
