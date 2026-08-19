// ── Gilde, geräteübergreifender Sync und Wochen-Raids.
//    Folgt der Modal-Struktur des NotificationCenter; lokal-first: ohne
//    Backend zeigt das Panel offen, was fehlt, statt Funktionen vorzugaukeln.
import { useCallback, useEffect, useState } from 'react';

import { getBackendUrl } from '../lib/backend';
import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import {
  contributeRaid, createGuild, createInvite, fetchGuild, fetchRaid, getAccount,
  getSyncLast, joinGuild, leaveGuild, loginAccount, logoutAccount, registerAccount,
  resolveWithRemote, startRaid, syncNow, weekContribution,
  type GuildView, type RaidKind, type RaidView,
} from '../lib/guild';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string): string => lang === 'de' ? de : en;

const RAID_KINDS: { id: RaidKind; label: [string, string] }[] = [
  { id: 'volume', label: ['Gesamtvolumen', 'Total volume'] },
  { id: 'consistency', label: ['Konstanz', 'Consistency'] },
  { id: 'sessions', label: ['Einheiten', 'Sessions'] },
];

const ROLE_LABEL: Record<string, [string, string]> = {
  owner: ['Gründer', 'Founder'],
  officer: ['Offizier', 'Officer'],
  member: ['Mitglied', 'Member'],
};

export function GuildPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [guild, setGuild] = useState<GuildView | null>(null);
  const [raid, setRaid] = useState<RaidView | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ remote: Record<string, unknown>; rev: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [account, setAccountState] = useState(getAccount);

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  const backend = getBackendUrl();
  const say = (text: string, bad = false) => setMessage({ text, bad });

  const load = useCallback(async () => {
    if (!backend || !getAccount()) { setLoaded(true); return; }
    try {
      const current = await fetchGuild();
      setGuild(current);
      if (current) setRaid((await fetchRaid()).raid);
    } catch (error) { say(String((error as Error).message), true); }
    setLoaded(true);
  }, [backend]);

  useEffect(() => { if (open) void load(); }, [open, load, account?.token]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await action(); } catch (error) { say(String((error as Error).message), true); }
    setBusy(false);
  };

  if (!open) return null;

  return (
    <div className="product-modal guild-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="guild-panel" role="dialog" aria-modal="true" aria-labelledby="guild-panel-title">
        <header className="guild-header">
          <div>
            <span><SystemIcon name="shield" />{copy('GILDE', 'GUILD')}</span>
            <h2 id="guild-panel-title">{guild ? guild.name : copy('Gilde', 'Guild')}</h2>
          </div>
          <button type="button" className="system-icon-button" onClick={onClose}
            aria-label={copy('Schliessen', 'Close')}>
            <SystemIcon name="close" />
          </button>
        </header>

        <div className="guild-body">
          {!backend ? (
            <p className="guild-empty">
              {copy('Gilden brauchen einen verbundenen Server. Hinterlege die Backend-URL in den Einstellungen.',
                    'Guilds need a connected server. Set the backend URL in settings.')}
            </p>
          ) : !account ? (
            <AccountForm onDone={next => { setAccountState(next); void load(); }} />
          ) : (
            <>
              <div className="guild-account-row">
                <span><strong>{account.username}</strong> <em>{account.uid}</em></span>
                <button type="button" className="guild-ghost-button" onClick={() => {
                  logoutAccount(); setAccountState(null); setGuild(null); setRaid(null);
                }}>{copy('Abmelden', 'Sign out')}</button>
              </div>

              <div className="guild-sync-row">
                <span>
                  <SystemIcon name="sync" />
                  {copy('Synchronisiert', 'Synced')}: {getSyncLast()
                    ? new Date(getSyncLast()).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')
                    : copy('nie', 'never')}
                </span>
                <button type="button" className="guild-ghost-button" disabled={busy} onClick={() => run(async () => {
                  const result = await syncNow();
                  if (result.status === 'conflict') setConflict({ remote: result.remote, rev: result.rev });
                  else if (result.status === 'pulled') say(copy(`${result.applied} Einträge vom Server übernommen`, `Pulled ${result.applied} entries from server`));
                  else say(copy('Daten hochgeladen', 'Data uploaded'));
                })}>{copy('Jetzt synchronisieren', 'Sync now')}</button>
              </div>

              {conflict && (
                <div className="guild-conflict" role="alert">
                  <p>{copy('Konflikt: ein anderes Gerät war zuerst da.', 'Conflict: another device got there first.')}</p>
                  <div className="guild-actions">
                    <button type="button" className="guild-ghost-button" onClick={() => run(async () => {
                      const applied = resolveWithRemote(conflict.remote, conflict.rev);
                      setConflict(null);
                      say(copy(`${applied} Einträge übernommen`, `Applied ${applied} entries`));
                    })}>{copy('Server übernehmen', 'Take server version')}</button>
                    <button type="button" className="guild-primary-button" onClick={() => run(async () => {
                      await syncNow(true); setConflict(null);
                      say(copy('Dieses Gerät hochgeladen', 'This device uploaded'));
                    })}>{copy('Dieses Gerät', 'This device')}</button>
                  </div>
                </div>
              )}

              {message && (
                <p className={message.bad ? 'guild-message bad' : 'guild-message'} role="status">{message.text}</p>
              )}

              {!loaded ? <p className="guild-empty">…</p>
                : !guild ? (
                  <NoGuild busy={busy}
                    onCreate={(name, tag, motto) => run(async () => { setGuild(await createGuild(name, tag, motto)); })}
                    onJoin={code => run(async () => {
                      setGuild(await joinGuild(code));
                      setRaid((await fetchRaid()).raid);
                    })} />
                ) : (
                  <>
                    <GuildCard guild={guild} invite={invite}
                      onInvite={() => run(async () => { setInvite((await createInvite()).code); })}
                      onLeave={() => run(async () => {
                        const result = await leaveGuild();
                        setGuild(null); setRaid(null); setInvite(null);
                        say(result.disbanded
                          ? copy('Gilde aufgelöst.', 'Guild disbanded.')
                          : copy('Gilde verlassen.', 'Left the guild.'));
                      })} />
                    <RaidCard raid={raid} busy={busy}
                      onStart={kind => run(async () => { setRaid((await startRaid(kind)).raid); })}
                      onContribute={() => run(async () => {
                        if (!raid) return;
                        setRaid((await contributeRaid(weekContribution(raid.kind))).raid);
                      })} />
                  </>
                )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function AccountForm({ onDone }: { onDone: (account: ReturnType<typeof getAccount>) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const account = mode === 'login'
        ? await loginAccount(email.trim(), password)
        : await registerAccount(email.trim(), name.trim() || 'Operator', password);
      onDone(account);
    } catch (caught) { setError(String((caught as Error).message)); }
    setBusy(false);
  };

  return (
    <div className="guild-auth">
      <p className="guild-section-title">{copy('Gilden-Konto', 'Guild account')}</p>
      <div className="guild-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'}
          className={mode === 'login' ? 'guild-tab active' : 'guild-tab'}
          onClick={() => setMode('login')}>{copy('Anmelden', 'Sign in')}</button>
        <button type="button" role="tab" aria-selected={mode === 'register'}
          className={mode === 'register' ? 'guild-tab active' : 'guild-tab'}
          onClick={() => setMode('register')}>{copy('Registrieren', 'Register')}</button>
      </div>
      {mode === 'register' && (
        <label className="guild-field">
          <span>{copy('Name', 'Name')}</span>
          <input value={name} onChange={event => setName(event.target.value)} maxLength={80} />
        </label>
      )}
      <label className="guild-field">
        <span>{copy('E-Mail', 'Email')}</span>
        <input type="email" autoComplete="email" value={email}
          onChange={event => setEmail(event.target.value)} />
      </label>
      <label className="guild-field">
        <span>{copy('Passwort', 'Password')}</span>
        <input type="password" value={password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onChange={event => setPassword(event.target.value)} />
      </label>
      {error && <p className="guild-message bad">{error}</p>}
      <button type="button" className="guild-primary-button" disabled={busy || !email || password.length < 6}
        onClick={submit}>{mode === 'login' ? copy('Anmelden', 'Sign in') : copy('Registrieren', 'Register')}</button>
    </div>
  );
}

function NoGuild({ busy, onCreate, onJoin }: {
  busy: boolean;
  onCreate: (name: string, tag: string, motto: string) => void;
  onJoin: (code: string) => void;
}) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [motto, setMotto] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="guild-card">
      <p className="guild-empty">{copy('Du bist in keiner Gilde.', 'You are not in a guild.')}</p>

      <p className="guild-section-title">{copy('Gilde gründen', 'Found a guild')}</p>
      <label className="guild-field">
        <span>{copy('Gildenname', 'Guild name')}</span>
        <input value={name} maxLength={64} onChange={event => setName(event.target.value)} />
      </label>
      <div className="guild-field-row">
        <label className="guild-field">
          <span>{copy('Kürzel', 'Tag')}</span>
          <input value={tag} maxLength={8} onChange={event => setTag(event.target.value)} />
        </label>
        <label className="guild-field">
          <span>{copy('Motto', 'Motto')}</span>
          <input value={motto} maxLength={160} onChange={event => setMotto(event.target.value)} />
        </label>
      </div>
      <button type="button" className="guild-primary-button" disabled={busy || name.trim().length < 3}
        onClick={() => onCreate(name, tag, motto)}>{copy('Gilde gründen', 'Found guild')}</button>

      <p className="guild-section-title guild-divider">{copy('Beitreten', 'Join')}</p>
      <div className="guild-field-row">
        <label className="guild-field">
          <span>{copy('Einladungscode', 'Invite code')}</span>
          <input value={code} maxLength={16}
            onChange={event => setCode(event.target.value.toUpperCase())} />
        </label>
        <button type="button" className="guild-primary-button" disabled={busy || code.trim().length < 4}
          onClick={() => onJoin(code.trim())}>{copy('Beitreten', 'Join')}</button>
      </div>
    </div>
  );
}

function GuildCard({ guild, invite, onInvite, onLeave }: {
  guild: GuildView; invite: string | null; onInvite: () => void; onLeave: () => void;
}) {
  const canInvite = guild.members.some(member => member.me && (member.role === 'owner' || member.role === 'officer'));

  return (
    <div className="guild-card">
      <div className="guild-card-head">
        <div>
          <strong>{guild.name}</strong>
          {guild.tag && <em>[{guild.tag}]</em>}
        </div>
        <span className="guild-presence-count">
          {guild.onlineCount}/{guild.memberCount} {copy('online', 'online')}
        </span>
      </div>
      {guild.motto && <p className="guild-motto">{guild.motto}</p>}

      <p className="guild-section-title">{copy('Mitglieder', 'Members')}</p>
      <ul className="guild-members">
        {guild.members.map(member => (
          <li key={member.uid} className={member.me ? 'guild-member me' : 'guild-member'}>
            <span className={member.online ? 'guild-presence online' : 'guild-presence'} aria-hidden="true" />
            <strong>{member.username}</strong>
            <em>{member.uid}</em>
            <span className="guild-role">{copy(...(ROLE_LABEL[member.role] || ['Mitglied', 'Member']))}</span>
          </li>
        ))}
      </ul>

      <div className="guild-actions">
        {canInvite && (
          <button type="button" className="guild-ghost-button" onClick={onInvite}>
            {copy('Einladung erzeugen', 'Create invite')}
          </button>
        )}
        <button type="button" className="guild-ghost-button danger" onClick={onLeave}>
          {copy('Gilde verlassen', 'Leave guild')}
        </button>
      </div>
      {invite && (
        <p className="guild-invite"><code>{invite}</code><span>{copy('7 Tage gültig', 'valid 7 days')}</span></p>
      )}
    </div>
  );
}

function RaidCard({ raid, busy, onStart, onContribute }: {
  raid: RaidView | null; busy: boolean;
  onStart: (kind: RaidKind) => void; onContribute: () => void;
}) {
  const [kind, setKind] = useState<RaidKind>('volume');

  return (
    <div className="guild-card">
      <p className="guild-section-title">{copy('Wochen-Raid', 'Weekly raid')}</p>
      {!raid ? (
        <>
          <p className="guild-empty">{copy('Diese Woche läuft kein Raid.', 'No raid running this week.')}</p>
          <div className="guild-tabs" role="tablist">
            {RAID_KINDS.map(option => (
              <button key={option.id} type="button" role="tab" aria-selected={kind === option.id}
                className={kind === option.id ? 'guild-tab active' : 'guild-tab'}
                onClick={() => setKind(option.id)}>{copy(...option.label)}</button>
            ))}
          </div>
          <button type="button" className="guild-primary-button" disabled={busy}
            onClick={() => onStart(kind)}>{copy('Raid starten', 'Start raid')}</button>
        </>
      ) : (
        <>
          <div className="guild-card-head">
            <strong>{copy(...(RAID_KINDS.find(option => option.id === raid.kind)?.label || ['Raid', 'Raid']))}</strong>
            <span className="guild-presence-count">{raid.weekKey}</span>
          </div>
          <div className="guild-raid-track" role="img"
            aria-label={`${raid.total} / ${raid.goal} · ${raid.pct}%`}>
            <i style={{ width: `${raid.pct}%` }} />
          </div>
          <p className="guild-raid-numbers"><strong>{raid.total}</strong> <span>/ {raid.goal} · {raid.pct}%</span></p>

          <p className="guild-section-title">{copy('Rangliste', 'Leaderboard')}</p>
          <ul className="guild-board">
            {raid.contributors.map((entry, index) => (
              <li key={entry.uid} className={entry.me ? 'guild-board-row me' : 'guild-board-row'}>
                <span className="guild-board-rank">{index + 1}</span>
                <strong>{entry.username}</strong>
                <span>{entry.value}</span>
              </li>
            ))}
            {raid.contributors.length === 0 && <li className="guild-empty">—</li>}
          </ul>

          <button type="button" className="guild-primary-button" disabled={busy} onClick={onContribute}>
            {copy('Beitrag melden', 'Report contribution')} · {weekContribution(raid.kind)}
          </button>
        </>
      )}
    </div>
  );
}
