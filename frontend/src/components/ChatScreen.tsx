// ═══════════════════════════════════════════════════════════════════
//  ◈ SHADOW NEXUS — Community-Chat (WebSocket ans Python-Backend)
//  · Globaler Kanal + sprachbasierte Räume (de/en/ja/ko/es)
//  · Foto-Upload in den Chat
//  · Shadow-Bot-Moderation: geblockte Nachrichten erscheinen als
//    mystische Verwarnung in der App-Sprache
//  Ohne Backend (GitHub Pages pur): Offline-Panel mit Server-Eingabe.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { S } from '../lib/storage';
import { t, lang } from '../lib/i18n';
import { useAppState } from '../lib/store';
import { getBackendUrl, setBackendUrl, backendHealth, chatSocketUrl, uploadChatMedia, type ChatMsg } from '../lib/backend';

const LANG_ROOM_LABEL: Record<string, string> = { de: '🇩🇪 Deutsch', en: '🇬🇧 English', ja: '🇯🇵 日本語', ko: '🇰🇷 한국어', es: '🇪🇸 Español' };

export function ChatScreen() {
  useAppState();
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [urlInput, setUrlInput] = useState(getBackendUrl());
  const [room, setRoom] = useState<string>('global');
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const auth = S.get<any>('auth') || {};
  const profile = S.get<any>('profile') || {};
  const user = profile.firstName || auth.username || 'Shadow';
  const uid = auth.userId || '#000';

  const checkHealth = async () => {
    setHealth('checking');
    setHealth((await backendHealth()) ? 'online' : 'offline');
  };
  useEffect(() => { checkHealth(); }, []);

  // Raum-Verbindung: WS öffnen, Historie empfangen, bei Raumwechsel neu
  useEffect(() => {
    if (health !== 'online') return;
    setMsgs([]); setConnected(false);
    let closed = false;
    const ws = new WebSocket(chatSocketUrl(room, user, uid));
    wsRef.current = ws;
    ws.onopen = () => { if (!closed) setConnected(true); };
    ws.onmessage = ev => {
      try {
        const m: ChatMsg = JSON.parse(ev.data);
        if (m.type === 'history' && Array.isArray(m.messages)) setMsgs(m.messages);
        else setMsgs(prev => [...prev.slice(-199), m]);
      } catch { /* malformed frame — ignorieren */ }
    };
    ws.onclose = () => { if (!closed) setConnected(false); };
    ws.onerror = () => { /* onclose folgt */ };
    return () => { closed = true; try { ws.close(); } catch { /* noop */ } };
  }, [health, room]);

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
          <div className="ki-sigil-sm">👥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ki-chat-hd-title">{t('chat_title')}</div>
            <div className="ki-chat-hd-sub">
              {health === 'online'
                ? `// ${t('chat_connected')} ${getBackendUrl().replace(/^https?:\/\//, '')} ${connected ? '· ◈' : '· …'}`
                : `// ${t('chat_offline')}`}
            </div>
          </div>
          <div className="chat-rooms">
            {rooms.map(r => (
              <button key={r.id} className={`seg-btn${room === r.id ? ' sel' : ''}`}
                onClick={() => setRoom(r.id)} disabled={health !== 'online'}>{r.label}</button>
            ))}
          </div>
        </div>

        {health !== 'online' ? (
          <div className="chat-offline">
            <span className="verify-icon">📡</span>
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
          <>
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
                if (m.type === 'system') {
                  return <div className="chat-sys" key={i}>◈ {m.text}</div>;
                }
                const mine = m.uid === uid && m.user === user;
                return (
                  <div className={`ki-msg ${mine ? 'user' : 'ai'}`} key={i}>
                    <div className="ki-msg-bubble">
                      {m.media && <img className="chat-media" src={m.media} alt="upload" loading="lazy" />}
                      {m.text && <span>{m.text}</span>}
                    </div>
                    <div className="ki-msg-ts">{mine ? t('ki_you') : `${m.user} ${m.uid || ''}`} · {m.ts ? new Date(m.ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </div>
                );
              })}
            </div>
            <div className="ki-input-row" style={{ display: 'flex' }}>
              <label className="scanner-file-btn" title={t('chat_upload')} style={{ alignSelf: 'center' }}>
                📷
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
              </label>
              <input className="ki-text-input" type="text" value={input} disabled={!connected}
                placeholder={t('chat_input_ph')}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(); }} />
              <button className="ki-send-btn" disabled={!connected} onClick={() => send()}>▶</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
