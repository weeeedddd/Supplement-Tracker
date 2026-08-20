// ── Profil-Overlay (RPG-Akte), Complete-Overlay, Briefing-Modal — TS-Port
import { useMemo } from 'react';
import { S } from '../lib/storage';
import { lang, t } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { refresh, useAppState } from '../lib/store';
import { theme } from '../lib/themes';
import {
  getStreak, getXPRankData, calcRPGStats, buildRadarSVG, calcBuffsDebuffs,
  ACHIEVE_DEFS, getUnlockedAchievements, getEquippedTitle, equipTitle, asArray,
  SDEFS, type Macros, type Profile, type ProtocolItem,
} from '../lib/engine';
import { SystemIcon } from './SystemIcon';

const AV = ['◈', '◉', '◊'];

export function ProfileOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useAppState();
  const th = theme();
  const auth = S.get<any>('auth');
  const profile = S.get<Profile>('profile');
  const macros = S.get<Macros>('macros');
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  const stats = useMemo(() => calcRPGStats(), [open]);

  if (!auth || !profile) return null;
  const xpData = getXPRankData();
  const equipped = getEquippedTitle();
  const unlocked = getUnlockedAchievements();
  const { buffs, debuffs } = calcBuffsDebuffs(th);
  const gMap: Record<string, string> = { m: t('gender_m'), f: t('gender_f'), x: t('gender_x') };
  const goalMap: Record<string, string> = { bulk: t('goal_bulk'), cut: t('goal_cut'), perf: t('goal_perf'), long: t('goal_long') };
  const bmi = profile.height ? profile.weight / Math.pow(profile.height / 100, 2) : null;
  const attrVals = [stats.STR, stats.VIT, stats.AGI, stats.INT, stats.MAG];
  // Härtung: Theme-Arrays defensiv — Attribut-Labels & Ränge nie undefined
  const attrs: string[] = Array.isArray(th?.attrs) ? th.attrs : ['STR', 'VIT', 'AGI', 'INT', 'MAG'];

  return (
    <div className={`profile-overlay${open ? ' open' : ''}`} id="po">
      <button className="po-close" onClick={onClose}>✕</button>
      <div className="po-c">
        <div className="po-av">{profile.avatarPhoto ? <img src={profile.avatarPhoto} alt="av" /> : (AV[profile.avatarIdx] || '◈')}</div>
        <div className="po-tag">{th?.title ?? 'SHADOW AGENT AKTE'}</div>
        <div className="po-uid">{auth.userId || '#001'}</div>
        <div className="po-nm">{profile.firstName || auth.username || 'Shadow'}</div>
        <div className="po-rk">{th?.ranks?.[xpData.idx] ?? th?.ranks?.[0] ?? 'Shadow Novice'}</div>

        <div className="po-xp-wrap">
          <div className="po-xp-label">
            <span>{th?.xpLabel ?? 'XP'} <span className="xp-curr">{xpData.xp}</span></span>
            <span>{xpData.nextXp === Infinity ? '/ MAX' : `/ ${xpData.nextXp} XP`}</span>
          </div>
          <div className="po-xp-track"><div className="po-xp-fill" style={{ width: xpData.pct + '%' }} /></div>
        </div>

        <div className="po-title-tag">◈ {(ACHIEVE_DEFS[equipped]?.name || 'SHADOW NOVICE').toUpperCase()}</div>

        <div className="po-grid">
          <div className="po-stat"><div className="po-stat-l">{t('po_age')}</div><div className="po-stat-v">{profile.age || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_height')}</div><div className="po-stat-v">{profile.height || '–'}<em>cm</em></div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_weight')}</div><div className="po-stat-v">{profile.weight || '–'}<em>kg</em></div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_gender')}</div><div className="po-stat-v">{gMap[profile.gender] || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_goal')}</div><div className="po-stat-v">{goalMap[profile.goal] || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_bmi')}</div><div className="po-stat-v">{bmi ? bmi.toFixed(1) : '–'}</div></div>
        </div>

        {/* ── Attribut-Matrix + Makros als zusammenhängender Block ── */}
        <div className="po-sec-title">◈ {t('po_matrix')}</div>
        <div className="po-matrix">
          <div className="rpg-radar-wrap">
            <div dangerouslySetInnerHTML={{ __html: buildRadarSVG(stats, attrs) }} />
          </div>
          <div className="rpg-attrs">
            {attrs.map((k: string, i: number) => (
              <div className="attr-row" key={k}>
                <div className="attr-label"><span>{k}</span><span className="av">{attrVals[i]}</span></div>
                <div className="attr-track"><div className="attr-fill" style={{ width: attrVals[i] + '%' }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="po-macro-grid po-macro-tight">
          {macros ? (
            <>
              <div className="po-macro-item"><div className="po-macro-l">{t('m_kcal')}</div><div className="po-macro-v">{macros.kcal}</div></div>
              <div className="po-macro-item"><div className="po-macro-l">{t('m_prot')}</div><div className="po-macro-v">{macros.prot}g</div></div>
              <div className="po-macro-item"><div className="po-macro-l">{t('m_carb')}</div><div className="po-macro-v">{macros.carb}g</div></div>
              <div className="po-macro-item"><div className="po-macro-l">{t('m_fat')}</div><div className="po-macro-v">{macros.fat}g</div></div>
              <div className="po-macro-item"><div className="po-macro-l">{t('m_sug')}</div><div className="po-macro-v">{macros.sug}g</div></div>
            </>
          ) : <div style={{ fontSize: '.75rem', color: 'var(--text3)' }}>–</div>}
        </div>

        <div className="po-sec-title">⚡ {t('po_status')}</div>
        <div className="po-status-grid">
          {[...debuffs.map(d => ({ ...d, cls: 'debuff' })), ...buffs.map(b => ({ ...b, cls: 'buff' }))].map((s, i) => (
            <div className={`status-badge ${s.cls}`} key={i}>
              <span className="status-icon">{s.icon}</span>
              <div><div className="status-name">{s.name}</div><div className="status-desc">{s.desc}</div></div>
            </div>
          ))}
          {!buffs.length && !debuffs.length && (
            <div className="status-badge neutral">
              <span className="status-icon">◈</span>
              <div><div className="status-name">{t('po_status_none')}</div>
                <div className="status-desc">{t('po_status_hint')}</div></div>
            </div>
          )}
        </div>

        <div className="po-sec-title">{t('po_protocol')}</div>
        <div className="po-supp-tags">
          {protocol.map(s => SDEFS[s.id] ? <span className="po-stag" key={s.id}>{t(SDEFS[s.id].nk)}</span> : null)}
        </div>

        {/* ── Errungenschaften: freigeschaltete Karte = Titel ausrüsten (klick) ── */}
        <div className="po-sec-title">🏆 {t('po_achieve')} <span className="po-sec-hint">· {t('po_equip_hint')}</span></div>
        <div className="po-achieve-grid">
          {Object.entries(ACHIEVE_DEFS).map(([id, def]) => {
            const isUnlocked = unlocked.includes(id);
            const isEquipped = equipped === id;
            return (
              <div className={`achieve-card${isUnlocked ? ' unlocked' : ''}${isEquipped ? ' equipped' : ''}`} key={id}
                role={isUnlocked ? 'button' : undefined} tabIndex={isUnlocked ? 0 : undefined}
                onClick={isUnlocked ? () => { equipTitle(id); refresh(); } : undefined}
                onKeyDown={isUnlocked ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); equipTitle(id); refresh(); } }) : undefined}>
                {isEquipped && <span className="achieve-eq">{t('po_equipped')}</span>}
                <div className="achieve-icon">{def.icon}</div>
                <div className="achieve-name">{def.name}</div>
                <div className="achieve-desc">{def.desc}{isUnlocked ? '' : <em> (+{def.xp} XP)</em>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CompleteOverlay({ streak, onDismiss }: { streak: number | null; onDismiss: () => void }) {
  useModalIsolation(streak !== null, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onDismiss,
  });

  if (streak === null) return null;
  const isGerman = lang === 'de';
  return (
    <div className="system-dialog-backdrop complete-system-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onDismiss();
    }}>
      <section className="system-dialog complete-system-dialog" role="dialog" aria-modal="true" aria-labelledby="complete-title" aria-describedby="complete-description">
        <header>
          <h2 id="complete-title">{isGerman ? 'Routine gespeichert' : 'Routine saved'}</h2>
          <button className="system-icon-button" type="button" onClick={onDismiss} aria-label={isGerman ? 'Bestätigung schließen' : 'Close confirmation'}>
            <SystemIcon name="close" />
          </button>
        </header>
        <div className="complete-system-body">
          <span className="complete-system-mark" aria-hidden="true"><SystemIcon name="check" /></span>
          <div>
            <strong>{isGerman ? 'Heutige Auswahl abgeschlossen' : 'Today’s selection completed'}</strong>
            <p id="complete-description">
              {isGerman
                ? `Alle ausgewählten Routine-Einträge sind dokumentiert. Aktuelle Serie: ${streak} ${streak === 1 ? 'Tag' : 'Tage'}.`
                : `All selected routine items are documented. Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}.`}
            </p>
          </div>
        </div>
        <footer>
          <button className="system-button" type="button" onClick={onDismiss}>{isGerman ? 'Weiter' : 'Continue'}</button>
        </footer>
      </section>
    </div>
  );
}

export function BriefingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop open">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{t('modal_title')}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="bp">
            <span className="sigil-b">◈</span>
            <p>{t('briefing_ph')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
