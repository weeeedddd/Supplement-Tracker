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
  syncProfileToBackend, type ChatMsg, type RosterUser, type SharedRecipe,
} from '../lib/backend';

const IconGroup = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconSend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconCamera = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;
const IconWifiOff = <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>;
const IconUsers = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconClock = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconChevron = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IconXsm = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconPot = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="m7 8 1-4"/><path d="m12 8 .5-4"/><path d="m17 8-1-4"/></svg>;

const LANG_ROOM_LABEL: Record<string, string> = { de: '🇩🇪 Deutsch', en: '🇬🇧 English', tr: '🇹🇷 Türkçe' };

/** Lokalisierte Sicht auf ein geteiltes Rezept je nach aktiver Sprache. */
function locRec(r: SharedRecipe): SharedRecipe {
  const loc = r.i18n?.[lang];
  if (!loc) return r;
  return {
    ...r,
    name: loc.name || r.name,
    ingredients: loc.ingredients?.length ? loc.ingredients : r.ingredients,
    steps: loc.steps?.length ? loc.steps : r.steps,
  };
}

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
  const [preview, setPreview] = useState<SharedRecipe | null>(null);
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
                  if (m.recipe) {
                    return (
                      <div className={`ki-msg ${mine ? 'user' : 'ai'}`} key={i}>
                        <RecipeCard recipe={m.recipe} onOpen={() => setPreview(m.recipe!)} />
                        <div className="ki-msg-ts">
                          {mine ? t('ki_you') : <>{m.user} {m.uid || ''}</>}
                          {!mine && m.title && <span className="msg-title"> · {m.title}</span>}
                          {' · '}{m.ts ? new Date(m.ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                    );
                  }
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
      {preview && <RecipePreview recipe={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Rezept-Card im Chat (auffällig, klickbar → Preview) ──────────────
function RecipeCard({ recipe: r0, onOpen }: { recipe: SharedRecipe; onOpen: () => void }) {
  const recipe = locRec(r0);
  return (
    <button className="chat-recipe-card" onClick={onOpen}>
      {recipe.image && <img className="crc-img" src={recipe.image} alt="" loading="lazy" />}
      <div className="crc-body">
        <div className="crc-badge">{IconPot} {t('fuel_shared_badge')}</div>
        <div className="crc-name">{recipe.icon} {recipe.name}</div>
        <div className="crc-macros">
          <span className="crc-k">{recipe.kcal} kcal</span>
          <span className="crc-p">{recipe.prot}g P</span>
          <span className="crc-c">{recipe.carb}g C</span>
          <span className="crc-f">{recipe.fat}g F</span>
        </div>
        <div className="crc-open">{t('recipe_open')} {IconChevron}</div>
      </div>
    </button>
  );
}

// ── Interaktives Glassmorphism-Vorschaufenster ───────────────────────
function RecipePreview({ recipe: r0, onClose }: { recipe: SharedRecipe; onClose: () => void }) {
  const recipe = locRec(r0);
  return (
    <div className="recipe-modal" onClick={onClose}>
      <div className="recipe-box" onClick={e => e.stopPropagation()}>
        <button className="recipe-close" onClick={onClose} aria-label="close">{IconXsm}</button>
        {recipe.image && <img className="recipe-hero" src={recipe.image} alt={recipe.name} loading="lazy" />}
        <div className="recipe-scroll">
          <div className="recipe-title">{recipe.icon} {recipe.name}</div>
          <div className="recipe-sub">
            <span>{t('cat_' + recipe.category)}</span>
            <span className="recipe-dot">·</span>
            <span>{IconClock} {recipe.prep_min} min</span>
          </div>
          <div className="recipe-macros">
            <div className="rmx"><b>{recipe.kcal}</b><span>kcal</span></div>
            <div className="rmx"><b>{recipe.prot}g</b><span>{t('m_prot')}</span></div>
            <div className="rmx"><b>{recipe.carb}g</b><span>{t('m_carb')}</span></div>
            <div className="rmx"><b>{recipe.fat}g</b><span>{t('m_fat')}</span></div>
          </div>
          {recipe.ingredients?.length > 0 && (
            <>
              <div className="recipe-sec">{t('fuel_ingredients')}</div>
              <ul className="ingredient-list">
                {recipe.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
              </ul>
            </>
          )}
          {recipe.steps?.length > 0 && (
            <>
              <div className="recipe-sec">{t('fuel_steps')}</div>
              <ol className="step-list">
                {recipe.steps.map((s, i) => (
                  <li key={i}><span className="step-num">{i + 1}</span><span>{s}</span></li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
