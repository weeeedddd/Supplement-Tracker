// ── Profil-Overlay (RPG-Akte), Complete-Overlay, Briefing-Modal — TS-Port
import { useMemo } from 'react';
import { S } from '../lib/storage';
import { t } from '../lib/i18n';
import { refresh, useAppState } from '../lib/store';
import { theme } from '../lib/themes';
import {
  getStreak, getXPRankData, calcRPGStats, buildRadarSVG, calcBuffsDebuffs,
  ACHIEVE_DEFS, getUnlockedAchievements, getEquippedTitle, equipTitle,
  SDEFS, type Macros, type Profile, type ProtocolItem,
} from '../lib/engine';

const AV = ['◈', '◉', '◊'];

export function ProfileOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useAppState();
  const th = theme();
  const auth = S.get<any>('auth');
  const profile = S.get<Profile>('profile');
  const macros = S.get<Macros>('macros');
  const protocol = S.get<ProtocolItem[]>('protocol') || [];
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

  return (
    <div className={`profile-overlay${open ? ' open' : ''}`} id="po">
      <button className="po-close" onClick={onClose}>✕</button>
      <div className="po-c">
        <div className="po-av">{profile.avatarPhoto ? <img src={profile.avatarPhoto} alt="av" /> : (AV[profile.avatarIdx] || '◈')}</div>
        <div className="po-tag">{th.title}</div>
        <div className="po-uid">{auth.userId || '#001'}</div>
        <div className="po-nm">{profile.firstName || auth.username || 'Shadow'}</div>
        <div className="po-rk">{th.ranks[xpData.idx] || th.ranks[0]}</div>

        <div className="po-xp-wrap">
          <div className="po-xp-label">
            <span>{th.xpLabel} <span className="xp-curr">{xpData.xp}</span></span>
            <span>{xpData.nextXp === Infinity ? '/ MAX' : `/ ${xpData.nextXp} XP`}</span>
          </div>
          <div className="po-xp-track"><div className="po-xp-fill" style={{ width: xpData.pct + '%' }} /></div>
        </div>

        <div className="po-title-tag">◈ {(ACHIEVE_DEFS[equipped]?.name || 'SHADOW NOVICE').toUpperCase()}</div>

        <div className="po-grid">
          <div className="po-stat"><div className="po-stat-l">{t('po_age')}</div><div className="po-stat-v">{profile.age || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_height')}</div><div className="po-stat-v">{profile.height || '–'} cm</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_weight')}</div><div className="po-stat-v">{profile.weight || '–'} kg</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_gender')}</div><div className="po-stat-v">{gMap[profile.gender] || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_goal')}</div><div className="po-stat-v">{goalMap[profile.goal] || '–'}</div></div>
          <div className="po-stat"><div className="po-stat-l">{t('po_bmi')}</div><div className="po-stat-v">{bmi ? bmi.toFixed(1) : '–'}</div></div>
        </div>

        <div className="po-sec-title">◈ ATTRIBUT-MATRIX</div>
        <div className="rpg-radar-wrap">
          <div dangerouslySetInnerHTML={{ __html: buildRadarSVG(stats, th.attrs) }} />
        </div>

        <div className="rpg-attrs">
          {th.attrs.map((k: string, i: number) => (
            <div className="attr-row" key={k}>
              <div className="attr-label"><span>{k}</span><span className="av">{attrVals[i]}</span></div>
              <div className="attr-track"><div className="attr-fill" style={{ width: attrVals[i] + '%' }} /></div>
            </div>
          ))}
        </div>

        <div className="po-sec-title">⚡ GEFÄSS-STATUS</div>
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
              <div><div className="status-name">Keine aktiven Statuseffekte</div>
                <div className="status-desc">Supplements abhaken für Buff-Aktivierung.</div></div>
            </div>
          )}
        </div>

        <div className="po-sec-title">{t('po_macros')}</div>
        <div className="po-macro-grid">
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

        <div className="po-sec-title">{t('po_protocol')}</div>
        <div className="po-supp-tags">
          {protocol.map(s => SDEFS[s.id] ? <span className="po-stag" key={s.id}>{t(SDEFS[s.id].nk)}</span> : null)}
        </div>

        <div className="po-sec-title">◈ TITEL AUSRÜSTEN</div>
        <div className="po-title-chips">
          {Object.entries(ACHIEVE_DEFS).map(([id, def]) => {
            const isUnlocked = unlocked.includes(id);
            const cls = equipped === id ? 'equipped' : isUnlocked ? '' : 'locked';
            return (
              <span key={id} className={`title-chip ${cls}`}
                onClick={isUnlocked ? () => { equipTitle(id); refresh(); } : undefined}>{def.name}</span>
            );
          })}
        </div>

        <div className="po-sec-title">🏆 ERRUNGENSCHAFTEN</div>
        <div className="po-achieve-grid">
          {Object.entries(ACHIEVE_DEFS).map(([id, def]) => {
            const isUnlocked = unlocked.includes(id);
            return (
              <div className={`achieve-card ${isUnlocked ? 'unlocked' : ''}`} key={id}>
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
  if (streak === null) return null;
  return (
    <div className="complete-ov show">
      <span className="big-sigil">◈</span>
      <h2>{t('complete_title')}</h2>
      <p>{t('complete_streak').replace('{n}', String(streak))}</p>
      <button className="dismiss-btn" onClick={onDismiss}>{t('btn_dismiss')}</button>
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
