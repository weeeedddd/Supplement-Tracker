// ═══════════════════════════════════════════════════════════════════
//  ◈ SHADOW NEXUS — Community-Chat (WebSocket ans Python-Backend)
//  · Globaler Kanal + sprachbasierte Räume (de/en/ja/ko/es)
//  · Live-Präsenz-Sidebar (aktive User, pulsierender Aktivitätspunkt)
//  · Ausgerüsteter Titel bei jedem User (Chat + Sidebar)
//  · Foto-Upload · Markdown (**fett** / *kursiv* / `code`)
//  · Shadow-Bot-Moderation + Befehle (!profile / !loadout …)
//  Ohne Backend (GitHub Pages pur): Offline-Panel mit Server-Eingabe.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/storage';
import { t, lang } from '../lib/i18n';
import { useAppState } from '../lib/store';
import { theme } from '../lib/themes';
import { buildStatsSnapshot, equippedTitleName, getXPRankData } from '../lib/engine';
import { renderMarkdown } from '../lib/markdown';
import {
  getBackendUrl, setBackendUrl, backendHealth, chatSocketUrl, uploadChatMedia,
  syncProfileToBackend, type ChatMsg, type RosterUser,
} from '../lib/backend';

const IconGroup = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconSend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconCamera = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;
const IconWifiOff = <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>;
const IconUsers = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

const LANG_ROOM_LABEL: Record<string, string> = { de: '🇩🇪 Deutsch', en: '🇬🇧 English', ja: '🇯🇵 日本語', ko: '🇰🇷 한국어', es: '🇪🇸 Español' };

export function ChatScreen() {
  useAppState();
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [urlInput, setUrlInput] = useState(getBackendUrl());
  const [room, setRoom] = useState<string>('global');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const auth = S.get<any>('auth') || {};
  const profile = S.get<any>('profile') || {};
  const user = profile.firstName || auth.username || 'Shadow';
  const uid = auth.userId || '#000';
  const myTitle = equippedTitleName();

  const checkHealth = async () => {
    setHealth('checking');
    setHealth((await backendHealth()) ? 'online' : 'offline');
  };
  useEffect(() => { checkHealth(); }, []);

  // Raum-Verbindung: WS öffnen, Historie + Präsenz empfangen, bei Raumwechsel neu
  useEffect(() => {
    if (health !== 'online') return;
    setMsgs([]); setConnected(false); setRoster([]);
    let closed = false;
    const ws = new WebSocket(chatSocketUrl(room, user, uid, myTitle));
    wsRef.current = ws;
    ws.onopen = () => {
      if (closed) return;
      setConnected(true);
      // RPG-Snapshot spiegeln, damit der Shadow Bot !profile lesen kann
      const th = theme();
      const idx = getXPRankData().idx;
      const rank = String(th?.ranks?.[idx] ?? th?.ranks?.[0] ?? 'Shadow Novice');
      syncProfileToBackend(buildStatsSnapshot(uid, user, rank));
    };
    ws.onmessage = ev => {
      try {
        const m: ChatMsg = JSON.parse(ev.data);
        if (m.type === 'history' && Array.isArray(m.messages)) setMsgs(m.messages);
        else if (m.type === 'presence') { setOnline(m.count ?? 0); setRoster(m.roster ?? []); }
        else setMsgs(prev => [...prev.slice(-199), m]);
      } catch { /* malformed frame — ignorieren */ }
    };
    ws.onclose = () => { if (!closed) setConnected(false); };
    ws.onerror = () => { /* onclose folgt */ };
    return () => { closed = true; try { ws.close(); } catch { /* noop */ } };
  }, [health, room]);

  // Tab schließen / App verlassen → Socket sofort schließen (schnelleres
  // Roster-Update für alle anderen, statt auf Timeout zu warten)
  useEffect(() => {
    const close = () => { try { wsRef.current?.close(); } catch { /* noop */ } };
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  const send = (media?: string) => {
    const text = input.trim();
    if ((!text && !media) || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'msg', text, media: media || null }));
    setInput('');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = '';
    const url = await uploadChatMedia(f);
    if (url) send(url);
  };

  const connectBackend = async () => {
    setBackendUrl(urlInput);
    await checkHealth();
  };

  const rooms = [
    { id: 'global', label: t('chat_room_global') },
    { id: lang, label: LANG_ROOM_LABEL[lang] || lang.toUpperCase() },
  ];

  const warnText = (reason?: string) =>
    reason === 'toxic' ? t('chat_warn_toxic') : reason === 'spam' ? t('chat_warn_spam') : t('chat_warn_scam');

  return (
    <div className="screen active" id="screen-chat">
      <div className="chat-wrap">
        <div className="ki-chat-hd">
          <div className="ki-sigil-sm">{IconGroup}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ki-chat-hd-title">{t('chat_title')}</div>
            <div className="ki-chat-hd-sub">
              {health === 'online'
                ? `// ${t('chat_connected')} ${getBackendUrl().replace(/^https?:\/\//, '')} ${connected ? `· 👥 ${online} ◈` : '· …'}`
                : `// ${t('chat_offline')}`}
            </div>
          </div>
          <div className="chat-rooms">
            {rooms.map(r => (
              <button key={r.id} className={`seg-btn${room === r.id ? ' sel' : ''}`}
                onClick={() => setRoom(r.id)} disabled={health !== 'online'}>{r.label}</button>
            ))}
            {health === 'online' && (
              <button className={`seg-btn chat-roster-btn${sidebarOpen ? ' sel' : ''}`}
                title={t('chat_roster_title')} aria-label={t('chat_roster_title')}
                onClick={() => setSidebarOpen(o => !o)}>{IconUsers}<span>{online}</span></button>
            )}
          </div>
        </div>

        {health !== 'online' ? (
          <div className="chat-offline">
            <div className="verify-icon-wrap">{IconWifiOff}</div>
            <div className="verify-title">{t('chat_offline')}</div>
            <p className="chat-offline-hint">{t('chat_offline_hint')}</p>
            <span className="gender-label">{t('chat_backend_label')}</span>
            <input className="cart-addr" type="url" value={urlInput} placeholder={t('chat_backend_ph')}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && connectBackend()} />
            <button className="action-btn" style={{ marginTop: '.8rem' }} onClick={connectBackend}>
              {health === 'checking' ? '…' : t('chat_connect_btn')}
            </button>
          </div>
        ) : (
          <div className="chat-body">
            <div className="chat-main">
              <div className="ki-chat chat-list" ref={listRef}>
                {msgs.map((m, i) => {
                  if (m.type === 'warning') {
                    return (
                      <div className="chat-warn" key={i}>
                        <span className="chat-warn-bot">{t('chat_bot_name')}</span>
                        {warnText(m.reason)}
                      </div>
                    );
                  }
                  if (m.type === 'bot') {
                    return (
                      <div className="chat-bot-msg" key={i}>
                        <div className="chat-bot-hd">{t('chat_bot_name')}</div>
                        <div className="chat-bot-body">{renderMarkdown(m.text || '')}</div>
                      </div>
                    );
                  }
                  if (m.type === 'system') {
                    return <div className="chat-sys" key={i}>◈ {m.text}</div>;
                  }
                  const mine = m.uid === uid && m.user === user;
                  return (
                    <div className={`ki-msg ${mine ? 'user' : 'ai'}`} key={i}>
                      <div className="ki-msg-bubble">
                        {m.media && <img className="chat-media" src={m.media} alt="upload" loading="lazy" />}
                        {m.text && <span>{renderMarkdown(m.text)}</span>}
                      </div>
                      <div className="ki-msg-ts">
                        {mine ? t('ki_you') : <>{m.user} {m.uid || ''}</>}
                        {!mine && m.title && <span className="msg-title"> · {m.title}</span>}
                        {' · '}{m.ts ? new Date(m.ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="ki-input-row" style={{ display: 'flex' }}>
                <label className="scanner-file-btn" title={t('chat_upload')} style={{ alignSelf: 'center' }}>
                  {IconCamera}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
                </label>
                <input className="ki-text-input" type="text" value={input} disabled={!connected}
                  placeholder={t('chat_input_ph')}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(); }} />
                <button className="ki-send-btn" disabled={!connected} onClick={() => send()}>{IconSend}</button>
              </div>
            </div>

            {/* ◈ Live-Präsenz-Sidebar (einklappbar, Glassmorphism) */}
            <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`}>
              <div className="chat-sidebar-hd">{IconUsers}<span>{t('chat_roster_title')} · {online}</span></div>
              <div className="roster-list">
                {roster.length === 0 && <div className="roster-empty">{t('chat_roster_empty')}</div>}
                {roster.map(u => (
                  <div className="roster-item" key={u.uid}>
                    <span className="roster-dot" aria-hidden="true" />
                    <div className="roster-meta">
                      <div className="roster-name">
                        {u.user} <span className="roster-uid">{u.uid}</span>
                        {u.uid === uid && u.user === user && <span className="roster-you"> · {t('ki_you')}</span>}
                      </div>
                      {u.title && <div className="roster-title">◈ {u.title}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
            {sidebarOpen && <div className="chat-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
          </div>
        )}
      </div>
    </div>
  );
}
