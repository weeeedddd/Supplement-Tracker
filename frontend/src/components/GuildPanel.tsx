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
import {
  compareWithFriend, fetchFriends, inviteFriend, publishSocialPresence,
  removeFriend, respondToFriend, sendFriendBuff,
  type FriendsView, type SocialProfileView,
} from '../lib/social';
import { SystemIcon } from './SystemIcon';
import { refresh } from '../lib/store';

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

const EMPTY_FRIENDS: FriendsView = { friends: [], incoming: [], outgoing: [], buffs: [] };
const CHARACTER_NAMES: Record<string, string> = {
  toji: 'Toji', goku: 'Son Goku', tanjiro: 'Tanjiro', kaneki: 'Ken Kaneki',
  sanji: 'Sanji', baki: 'Baki Hanma', mikasa: 'Mikasa',
};

function stampMs(value: number): number { return value > 0 && value < 10_000_000_000 ? value * 1000 : value; }

function relativeTime(value: number): string {
  const elapsed = Math.max(0, Date.now() - stampMs(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return copy('gerade eben', 'just now');
  if (minutes < 60) return copy(`vor ${minutes} Min.`, `${minutes}m ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy(`vor ${hours} Std.`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  return copy(`vor ${days} T.`, `${days}d ago`);
}

export function GuildPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [guild, setGuild] = useState<GuildView | null>(null);
  const [raid, setRaid] = useState<RaidView | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ remote: Record<string, unknown>; rev: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [account, setAccountState] = useState(getAccount);
  const [friends, setFriends] = useState<FriendsView>(EMPTY_FRIENDS);
  const [inspected, setInspected] = useState<SocialProfileView | null>(null);

  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  const backend = getBackendUrl();
  const say = (text: string, bad = false) => setMessage({ text, bad });

  const load = useCallback(async () => {
    if (!backend || !getAccount()) { setLoaded(true); return; }
    try {
      await publishSocialPresence();
      const [current, friendState] = await Promise.all([fetchGuild(), fetchFriends()]);
      setGuild(current);
      setFriends(friendState);
      if (current) setRaid((await fetchRaid()).raid);
    } catch (error) { say(String((error as Error).message), true); }
    setLoaded(true);
  }, [backend]);

  useEffect(() => { if (open) void load(); }, [open, load, account?.token]);

  useEffect(() => {
    if (!open || !backend || !account) return;
    const heartbeat = () => { if (document.visibilityState === 'visible') void load(); };
    const interval = window.setInterval(heartbeat, 30_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, [account, backend, load, open]);

  useEffect(() => {
    if (!open || !backend || !account) return;
    let active = true;
    const sync = async () => {
      try {
        const result = await syncNow();
        if (!active) return;
        if (result.status === 'conflict') setConflict({ remote: result.remote, rev: result.rev });
        if (result.status === 'pulled') refresh();
      } catch { /* presence can remain available when sync is temporarily offline */ }
    };
    void sync();
    const interval = window.setInterval(() => { void sync(); }, 90_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [account, backend, open]);

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
                  else if (result.status === 'unchanged') say(copy('Bereits aktuell', 'Already up to date'));
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

              <FriendsCard
                state={friends}
                busy={busy}
                onInspect={setInspected}
                onInvite={identifier => run(async () => {
                  await inviteFriend(identifier);
                  setFriends(await fetchFriends());
                  say(copy('Freundesanfrage gesendet.', 'Friend request sent.'));
                })}
                onRespond={(id, action) => run(async () => {
                  await respondToFriend(id, action);
                  setFriends(await fetchFriends());
                })}
              />

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
        {inspected && <FriendInspect friend={inspected} busy={busy} onClose={() => setInspected(null)}
          onBuff={kind => run(async () => {
            await sendFriendBuff(inspected.uid, kind);
            say(kind === 'aura' ? copy('Aura gesendet.', 'Aura sent.') : copy('Fokus gesendet.', 'Focus sent.'));
          })}
          onRemove={() => run(async () => {
            await removeFriend(inspected.uid);
            setInspected(null);
            setFriends(await fetchFriends());
            say(copy('Freund entfernt.', 'Friend removed.'));
          })} />}
      </section>
    </div>
  );
}

function FriendsCard({
  state,
  busy,
  onInspect,
  onInvite,
  onRespond,
}: {
  state: FriendsView;
  busy: boolean;
  onInspect: (friend: SocialProfileView) => void;
  onInvite: (identifier: string) => void;
  onRespond: (id: number, action: 'accept' | 'decline') => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const ranking = [...state.friends].sort((a, b) => (
    (b.weekly?.activeDays || 0) - (a.weekly?.activeDays || 0)
    || (b.weekly?.volumeKg || 0) - (a.weekly?.volumeKg || 0)
  ));
  return (
    <section className="guild-card guild-friends" aria-labelledby="friend-roster-title">
      <div className="guild-card-head">
        <div><strong id="friend-roster-title">{copy('Freundesliste', 'Friend list')}</strong></div>
        <span className="guild-presence-count">{state.friends.filter(friend => friend.online).length}/{state.friends.length} {copy('online', 'online')}</span>
      </div>

      {state.buffs.length > 0 && <div className="friend-buff-feed" role="status">
        {state.buffs.slice(0, 3).map(buff => <span key={buff.id}>
          <SystemIcon name="spark" /><strong>{buff.from.username}</strong> {buff.kind === 'aura' ? copy('sendet Aura', 'sent Aura') : copy('sendet Fokus', 'sent Focus')}
        </span>)}
      </div>}

      <form className="friend-invite-row" onSubmit={event => {
        event.preventDefault();
        if (!identifier.trim()) return;
        onInvite(identifier);
        setIdentifier('');
      }}>
        <label className="guild-field"><span>{copy('Name oder UID', 'Name or UID')}</span><input value={identifier} maxLength={80} placeholder="#004" onChange={event => setIdentifier(event.target.value)} /></label>
        <button type="submit" className="guild-primary-button" disabled={busy || identifier.trim().length < 2}><SystemIcon name="plus" />{copy('Hinzufügen', 'Add')}</button>
      </form>

      {state.incoming.length > 0 && <div className="friend-request-list">
        <p className="guild-section-title">{copy('Offene Anfragen', 'Incoming requests')}</p>
        {state.incoming.map(request => <div key={request.id} className="friend-request">
          <span><strong>{request.username}</strong><small>{request.uid}</small></span>
          <div><button type="button" disabled={busy} className="guild-primary-button" onClick={() => onRespond(request.id, 'accept')}>{copy('Annehmen', 'Accept')}</button><button type="button" disabled={busy} className="guild-ghost-button" onClick={() => onRespond(request.id, 'decline')}>{copy('Ablehnen', 'Decline')}</button></div>
        </div>)}
      </div>}
      {state.outgoing.length > 0 && <p className="friend-pending-line">{copy('Ausstehend', 'Pending')}: {state.outgoing.map(request => request.username).join(', ')}</p>}

      <div className="friend-roster">
        {state.friends.map(friend => <button type="button" className="friend-status-card" key={friend.uid} onClick={() => onInspect(friend)}>
          <span className={friend.online ? 'guild-presence online' : 'guild-presence'} aria-hidden="true" />
          <span className="friend-status-main">
            <strong>{friend.username}</strong>
            <small>{CHARACTER_NAMES[friend.characterPath] ? `${CHARACTER_NAMES[friend.characterPath]} Path` : copy('Eigener Pfad', 'Own path')} · {friend.activePlan || copy('Kein aktiver Plan', 'No active plan')}</small>
            <em>{friend.activity?.label || copy('Ruhetag', 'Rest day')} · {relativeTime(friend.activity?.at || friend.lastSeen)}</em>
          </span>
          <span className="friend-streak"><SystemIcon name="spark" /><strong>{friend.streak || 0}</strong><small>{copy('Tage', 'days')}</small></span>
          <SystemIcon name="chevron" />
        </button>)}
        {!state.friends.length && <p className="guild-empty">{copy('Noch keine bestätigten Freunde. Nutze den exakten Namen oder die UID eines echten CORELINE-Kontos.', 'No confirmed friends yet. Use the exact name or UID of a real CORELINE account.')}</p>}
      </div>

      {ranking.length > 0 && <div className="friend-leaderboard">
        <p className="guild-section-title">{copy('Wöchentliches Sparring', 'Weekly sparring')}</p>
        {ranking.slice(0, 6).map((friend, index) => <div key={friend.uid}>
          <b>{index + 1}</b><strong>{friend.username}</strong>
          <span>{friend.weekly?.activeDays || 0}/7 {copy('Tage', 'days')}</span>
          <span>{friend.weekly?.workouts || 0} {copy('Einheiten', 'sessions')}</span>
          <span>{Math.round(friend.weekly?.volumeKg || 0).toLocaleString()} kg</span>
        </div>)}
      </div>}
    </section>
  );
}

function FriendInspect({ friend, busy, onClose, onBuff, onRemove }: {
  friend: SocialProfileView;
  busy: boolean;
  onClose: () => void;
  onBuff: (kind: 'aura' | 'focus') => void;
  onRemove: () => void;
}) {
  const comparison = compareWithFriend(friend);
  const muscles = Object.entries(friend.muscleLoads || {})
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  return <div className="friend-inspect" role="dialog" aria-modal="true" aria-labelledby="friend-inspect-title">
    <header>
      <span><small>{copy('STAT-INSPEKTION', 'STAT INSPECTION')}</small><h3 id="friend-inspect-title">{friend.username}</h3><em>{friend.uid} · {friend.online ? copy('ONLINE', 'ONLINE') : relativeTime(friend.lastSeen)}</em></span>
      <button type="button" className="system-icon-button" onClick={onClose} aria-label={copy('Inspektion schließen', 'Close inspection')}><SystemIcon name="close" /></button>
    </header>
    <div className="friend-inspect-scroll">
      <section className="friend-path-line"><SystemIcon name="shield" /><span><strong>{CHARACTER_NAMES[friend.characterPath] || copy('Eigener Pfad', 'Own path')}</strong><small>{friend.activePlan || copy('Kein aktiver Plan', 'No active plan')}</small></span><b>{friend.streak || 0}<small>{copy(' TAGE', ' DAYS')}</small></b></section>
      <section className="friend-stat-grid">
        <span><small>{copy('Wochenvolumen', 'Weekly volume')}</small><strong>{Math.round(friend.weekly?.volumeKg || 0).toLocaleString()}<em> KG</em></strong></span>
        <span><small>{copy('Einheiten', 'Workouts')}</small><strong>{friend.weekly?.workouts || 0}</strong></span>
        <span><small>{copy('Aktive Tage', 'Active days')}</small><strong>{friend.weekly?.activeDays || 0}<em>/7</em></strong></span>
        <span><small>{copy('Quests', 'Quests')}</small><strong>{friend.weekly?.completedQuests || 0}</strong></span>
      </section>

      <section className="friend-inspect-section">
        <p className="guild-section-title">{copy('Muskelzustand', 'Muscle condition')}</p>
        <div className="friend-muscle-summary">{muscles.map(([id, load]) => <span key={id}><small>{id}</small><i><em style={{ width: `${Math.max(0, Math.min(100, load))}%` }} /></i><b>{Math.round(load)}%</b></span>)}</div>
        {!muscles.length && <p className="guild-empty">{copy('Noch keine Heatmap-Daten geteilt.', 'No heatmap data shared yet.')}</p>}
      </section>

      <section className="friend-inspect-section">
        <p className="guild-section-title">{copy('Top-Gewichte', 'Top lifts')}</p>
        <div className="friend-lifts">{friend.topLifts?.map(lift => <span key={lift.exerciseKey}><strong>{lift.name}</strong><b>{lift.weightKg} kg × {lift.reps}</b></span>)}</div>
        {!friend.topLifts?.length && <p className="guild-empty">{copy('Keine geloggten Gewichte in dieser Woche.', 'No logged weights this week.')}</p>}
      </section>

      <section className="friend-inspect-section">
        <p className="guild-section-title">{copy('Co-op Vergleich', 'Co-op comparison')}</p>
        <div className="coop-overview"><span>{copy('Du', 'You')} <b>{comparison.weeklyVolume.mine.toLocaleString()} kg</b></span><em>VS</em><span>{friend.username} <b>{comparison.weeklyVolume.theirs.toLocaleString()} kg</b></span></div>
        {comparison.shared.map(row => <div className="coop-row" key={row.exerciseKey}><strong>{row.name}</strong><span>{row.mine} kg</span><em>{row.delta === 0 ? '=' : row.delta > 0 ? `+${row.delta}` : row.delta}</em><span>{row.theirs} kg</span></div>)}
        {!comparison.shared.length && <p className="guild-empty">{copy('Noch keine identische Übung mit geloggtem Gewicht.', 'No identical exercise with logged weight yet.')}</p>}
      </section>

      {friend.achievement && <p className="friend-achievement"><SystemIcon name="spark" />{friend.achievement}</p>}
      <div className="friend-inspect-actions">
        <button type="button" className="guild-primary-button" disabled={busy} onClick={() => onBuff('aura')}><SystemIcon name="spark" />{copy('Aura senden', 'Send Aura')}</button>
        <button type="button" className="guild-ghost-button" disabled={busy} onClick={() => onBuff('focus')}><SystemIcon name="target" />{copy('Fokus senden', 'Send Focus')}</button>
        <button type="button" className="guild-ghost-button danger" disabled={busy} onClick={onRemove}>{copy('Entfernen', 'Remove')}</button>
      </div>
    </div>
  </div>;
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
      <button type="button" className="guild-primary-button" disabled={busy || !email || password.length < 8}
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
            <span className="guild-member-identity"><strong>{member.username}</strong><small>{member.activityLabel || member.activePlan || (member.online ? copy('Aktiv', 'Active') : relativeTime(member.lastSeen))}</small></span>
            <em>{CHARACTER_NAMES[member.characterPath || ''] || member.uid}</em>
            {Boolean(member.streak) && <b className="guild-member-streak">{member.streak}◇</b>}
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
