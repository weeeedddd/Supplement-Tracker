// ── Dashboard — TS-Port: Protokoll, Makros, Materia-Scanner 2.1,
//    Smart Cart mit Live-Preisen, Mana, Mission Log, Dynamic Glow
import { useEffect, useRef, useState } from 'react';
import { S, dateKey } from '../lib/storage';
import { t } from '../lib/i18n';
import { refresh, useAppState } from '../lib/store';
import { theme, getCurrentTheme } from '../lib/themes';
import {
  SDEFS, gainXP, checkAchievements, getStreak, finaliseStreak, completedToday,
  getXPRankData, calcConsumed, getFoodLog, saveFoodLog, updateDynamicGlow, playSound, asArray,
  type FoodEntry, type Macros, type ProtocolItem, type Profile,
} from '../lib/engine';
import { analyzeImageLocally, analyzeTextLocally } from '../lib/scanner';
import { syncLivePrices, priceSyncState, runSmartCart, fmtEUR, LIVE_PRICES, MARKET_DB, MARKET_LOCATIONS, storeMapsLink, type CartResult } from '../lib/cart';
import { syncScanToBackend } from '../lib/backend';
import { getActiveBuffs, fmtRemaining } from '../lib/fitness';

const IconZapBuff = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;

const IconFlame = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>;
const IconWater = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>;
const IconCamera = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;
const IconEdit = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>;
const IconTrash = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconPen = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>;
const IconShoppingCart = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const IconActivity = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconDatabase = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
const IconScroll = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M12 19v-6"/><path d="M12 13l-2-2"/><path d="M12 13l2-2"/></svg>;
const IconRefresh = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>;
const IconStore = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0v0a2 2 0 0 1-2-2V7"/></svg>;
const IconMapPin = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>;
const IconExternal = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
const IconXstore = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconCheck = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconPlus = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconInfo = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>;
const IconTarget = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getChecked(): string[] { return S.get('day_' + dateKey()) || []; }

export function Dashboard({ onComplete }: { onComplete: (n: number) => void }) {
  useAppState();
  const th = theme();
  const protocol = asArray<ProtocolItem>(S.get('protocol'));
  const checked = getChecked();

  useEffect(() => { syncLivePrices(); }, []);
  useEffect(() => { updateDynamicGlow(getChecked()); });

  const toggle = (id: string) => {
    const ids = protocol.map(s => s.id);
    if (!ids.includes(id)) return;
    const cur = getChecked();
    const i = cur.indexOf(id);
    const adding = i === -1;
    if (i > -1) cur.splice(i, 1); else cur.push(id);
    S.set('day_' + dateKey(), cur);
    if (adding) gainXP(5);
    if (ids.every(pid => cur.includes(pid)) && !completedToday()) {
      gainXP(20);
      S.set('complete_days_count', (S.get<number>('complete_days_count') || 0) + 1);
      checkAchievements();
      const n = finaliseStreak();
      playSound();
      onComplete(n);
    }
    refresh();
  };

  const total = protocol.length;
  const done = checked.filter(id => protocol.some(s => s.id === id)).length;
  const circ = 2 * Math.PI * 38;
  const xpData = getXPRankData();
  // Härtung: Theme-Felder defensiv lesen — nie undefined.toUpperCase()
  const rankName = String(th?.ranks?.[xpData.idx] ?? th?.ranks?.[0] ?? 'Shadow Novice').toUpperCase();

  return (
    <div className="screen active" id="screen-dashboard">
      <div className="status-bar">
        <span>{th?.sigil ?? '◈ SHADOW~1'}</span>
        <span className="sb-rank">{rankName}</span>
        <span className="sb-streak">{IconFlame} {getStreak().count}</span>
      </div>
      <div className="dash-scroll">
        <div className="prog-area">
          <div className="prw">
            <svg width="90" height="90" viewBox="0 0 90 90">
              <defs>
                <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <circle className="pr-bg" cx="45" cy="45" r="38" />
              <circle className="pr-fill" id="prog-ring" cx="45" cy="45" r="38"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - (total ? done / total : 0))} />
            </svg>
            <div className="pr-center">
              <span className="pr-num">{done}/{total}</span>
              <span className="pr-label">{t('prog_done')}</span>
            </div>
          </div>
        </div>
        <BuffWidget />
        <MacroWidget />
        <ScannerWidget />
        <PhaseCards protocol={protocol} checked={checked} toggle={toggle} />
        <SmartCartWidget />
        <ManaWidget />
        <MissionLog />
      </div>
    </div>
  );
}

// ═══ STAT-BUFF-WIDGET (Mega-Feature: temporäre Attribut-Boosts) ══════
function BuffWidget() {
  useAppState();
  const [, tick] = useState(0);
  // Countdown jede Minute aktualisieren + abgelaufene Buffs entfernen
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 60000); return () => clearInterval(id); }, []);
  const buffs = getActiveBuffs();
  if (!buffs.length) return null;
  return (
    <div className="widget buff-widget">
      <div className="w-title">{IconZapBuff} {t('buff_active')}</div>
      <div className="buff-list">
        {buffs.map((b, i) => (
          <div className="buff-item" key={i}>
            <span className="buff-ic">{b.icon}</span>
            <div className="buff-meta">
              <div className="buff-label">{b.label}</div>
              <div className="buff-desc">{b.desc}</div>
            </div>
            <span className="buff-timer">{fmtRemaining(b.expires_at - Date.now())}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ MAKRO-WIDGET ════════════════════════════════════════════════════
function MacroWidget() {
  const goals = S.get<Macros>('macros');
  if (!goals) return null;
  const c = calcConsumed();
  const rows: { key: keyof Macros; label: string; cls: string; unit: string }[] = [
    { key: 'kcal', label: t('m_kcal'), cls: 'mb-kcal', unit: '' },
    { key: 'prot', label: t('m_prot'), cls: 'mb-prot', unit: 'g' },
    { key: 'carb', label: t('m_carb'), cls: 'mb-carb', unit: 'g' },
    { key: 'fat', label: t('m_fat'), cls: 'mb-fat', unit: 'g' },
    { key: 'sug', label: t('m_sug'), cls: 'mb-sug', unit: 'g' },
  ];
  return (
    <div className="widget" id="macro-widget">
      <div className="w-title">{t('w_macro')}</div>
      <div className="macro-grid">
        {rows.map(r => {
          const pct = goals[r.key] > 0 ? Math.min(110, c[r.key] / goals[r.key] * 100) : 0;
          return (
            <div className="macro-item" key={r.key}>
              <span className="macro-cg">
                <span className="macro-curr">{c[r.key]}{r.unit}</span>
                <span className="macro-sep">/</span>
                <span className="macro-goal">{goals[r.key]}{r.unit}</span>
              </span>
              <div className="macro-bar-wrap">
                <div className={`macro-bar ${r.cls}${pct > 100 ? ' over' : ''}`} style={{ width: Math.min(100, pct) + '%' }} />
              </div>
              <span className="macro-label">{r.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ MATERIA-SCANNER 2.1 ═════════════════════════════════════════════
function ScannerWidget() {
  const [txt, setTxt] = useState('');
  const [imgB64, setImgB64] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const log = getFoodLog();
  const c = calcConsumed();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setImgB64(ev.target?.result as string);
    r.readAsDataURL(f);
    e.target.value = '';
  };

  const clearImage = () => { setImgB64(null); setScanning(false); if (fileRef.current) fileRef.current.value = ''; };

  const submit = async () => {
    const q = txt.trim();
    if (!q && !imgB64) return;
    setBusy(true); setScanErr('');
    if (imgB64) setScanning(true);
    try {
      let result;
      if (imgB64) [result] = await Promise.all([analyzeImageLocally(imgB64, q), sleep(2000)]);
      else result = await analyzeTextLocally(q);
      // Ehrlichkeit statt Mock: nichts erkannt → Hinweis, KEIN Fantasie-Eintrag
      if (!result) {
        setScanErr(t('scan_fail'));
        return;
      }
      const entry: FoodEntry = { id: Date.now(), name: result.name || q || '📷 Scan', ...result.macros, ts: Date.now() };
      const l = getFoodLog(); l.push(entry); saveFoodLog(l);
      syncScanToBackend({ name: entry.name, kcal: entry.kcal, prot: entry.prot, carb: entry.carb, fat: entry.fat, sug: entry.sug });
      setTxt(''); clearImage();
      gainXP(3); checkAchievements();
      refresh();
    } finally {
      setBusy(false); setScanning(false);
    }
  };

  const del = (id: number) => { saveFoodLog(getFoodLog().filter(e => e.id !== id)); refresh(); };
  const saveEdit = (e: FoodEntry) => {
    saveFoodLog(getFoodLog().map(x => x.id === e.id ? e : x));
    setEditing(null); refresh();
  };

  return (
    <div className="widget" id="scanner-widget">
      <div className="w-title">{t('w_scanner')}</div>
      <div className="scanner-row">
        <input type="text" className="scanner-input" value={txt} placeholder={t('scanner_ph')}
          onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
        <label className="scanner-file-btn" title={t('chat_upload')}>
          {IconCamera}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
        </label>
      </div>
      {imgB64 && (
        <div className={`scan-stage${scanning ? ' scanning' : ''}`} style={{ display: 'flex' }}>
          <img className="scan-preview" src={imgB64} alt="Materia Preview" />
          <div className="scan-overlay">
            <div className="scan-grid" /><div className="scan-beam" />
            <div className="scan-status">{t('scan_scanning')}</div>
          </div>
          <button className="scan-clear" onClick={clearImage}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <button className="scan-btn" disabled={busy} onClick={submit}>{t('scan_btn')}</button>
        {busy && <span className="scan-loading" style={{ display: 'block' }}>{t('scan_loading')}</span>}
      </div>
      {scanErr && <div className="terminal-err" style={{ display: 'block' }}>{scanErr}</div>}
      <div className="tages-akte">
        <div className="ta-header">
          <span className="ta-title">{t('ta_title')}</span>
          <span style={{ fontSize: '.62rem', color: 'var(--text3)' }}>{log.length ? `${c.kcal} kcal total` : ''}</span>
        </div>
        <div>
          {!log.length && <div className="ta-empty">{t('ta_empty')}</div>}
          {log.map(e => (
            <div className="ta-item" key={e.id}>
              <div className="ta-item-top">
                <span className="ta-name">{e.name}</span>
                <button className="ta-edit-btn" onClick={() => setEditing(e)} title={t('edit_title')}>{IconEdit}</button>
                <button className="ta-del-btn" onClick={() => del(e.id)} title={t('edit_cancel')}>{IconTrash}</button>
              </div>
              <div className="ta-badges">
                <span className="ta-badge tb-kcal">{e.kcal} kcal</span>
                <span className="ta-badge tb-prot">{e.prot}g P</span>
                <span className="ta-badge tb-carb">{e.carb}g C</span>
                <span className="ta-badge tb-fat">{e.fat}g F</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && <EditFoodModal entry={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditFoodModal({ entry, onSave, onClose }: { entry: FoodEntry; onSave: (e: FoodEntry) => void; onClose: () => void }) {
  const [e, setE] = useState({ ...entry });
  const num = (v: string) => parseFloat(v) || 0;
  return (
    <div className="edit-modal open">
      <div className="edit-box">
        <h3>{t('edit_title')}</h3>
        <input className="edit-name-input" value={e.name} onChange={ev => setE({ ...e, name: ev.target.value })} />
        <div className="edit-macro-grid">
          <div className="edit-field"><label>KCAL</label><input type="number" value={e.kcal} onChange={ev => setE({ ...e, kcal: num(ev.target.value) })} /></div>
          <div className="edit-field"><label>PROTEIN (g)</label><input type="number" value={e.prot} onChange={ev => setE({ ...e, prot: num(ev.target.value) })} /></div>
          <div className="edit-field"><label>CARBS (g)</label><input type="number" value={e.carb} onChange={ev => setE({ ...e, carb: num(ev.target.value) })} /></div>
          <div className="edit-field"><label>FETT (g)</label><input type="number" value={e.fat} onChange={ev => setE({ ...e, fat: num(ev.target.value) })} /></div>
          <div className="edit-field"><label>ZUCKER (g)</label><input type="number" value={e.sug} onChange={ev => setE({ ...e, sug: num(ev.target.value) })} /></div>
        </div>
        <div className="edit-actions">
          <button className="edit-cancel" onClick={onClose}>{t('edit_cancel')}</button>
          <button className="edit-save" onClick={() => onSave(e)}>{t('edit_save')}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ PHASE-CARDS mit Info-Icons ══════════════════════════════════════
function PhaseCards({ protocol, checked, toggle }: { protocol: ProtocolItem[]; checked: string[]; toggle: (id: string) => void }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const phConf = {
    alpha: { cls: 'alpha', nk: 'phase_alpha', tk: 'phase_alpha_time' },
    beta: { cls: 'beta', nk: 'phase_beta', tk: 'phase_beta_time' },
    gamma: { cls: 'gamma', nk: 'phase_gamma', tk: 'phase_gamma_time' },
  } as const;
  return (
    <div id="phase-cards">
      {(['alpha', 'beta', 'gamma'] as const).map(ph => {
        const items = protocol.filter(s => s.phase === ph);
        if (!items.length) return null;
        const pc = phConf[ph];
        return (
          <div className="phase-section" key={ph}>
            <div className="phase-header">
              <span className={`phase-badge ${pc.cls}`}>{t(pc.nk)}</span>
              <span className="phase-time">{t(pc.tk)}</span>
            </div>
            {items.map(s => {
              const d = SDEFS[s.id]; if (!d) return null;
              const done = checked.includes(s.id);
              const infoTxt = t(d.nk + '_info');
              const hasInfo = infoTxt !== d.nk + '_info';
              return (
                <div className={`supp-card${done ? ' done' : ''}`} key={s.id} onClick={() => toggle(s.id)}>
                  <div className="sc-chk">{done ? IconCheck : IconPlus}</div>
                  <div className="sc-info">
                    <div className="sc-name">{t(d.nk)}</div>
                    <div className="sc-dose">{t(d.dk)}</div>
                    {d.ok && <div className="sc-note">{t(d.ok)}</div>}
                    {s.wk && <div className="sc-note">◈ {t(s.wk)}</div>}
                    {hasInfo && <div className={`sc-infobox${openInfo === s.id ? ' open' : ''}`}>◈ {infoTxt}</div>}
                  </div>
                  {hasInfo && (
                    <button className="sc-ib" aria-label="Info" title={infoTxt}
                      onClick={ev => { ev.stopPropagation(); setOpenInfo(openInfo === s.id ? null : s.id); }}>{IconInfo}</button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ═══ SMART CART ══════════════════════════════════════════════════════
function SmartCartWidget() {
  const cfg = S.get<any>('cart_cfg') || {};
  const [period, setPeriod] = useState<'week' | 'month'>(cfg.period || 'week');
  const [budget, setBudget] = useState<number>(cfg.budget || 20);
  const [addr, setAddr] = useState<string>(cfg.addr || '');
  const [result, setResult] = useState<CartResult | null>(null);
  const [store, setStore] = useState<{ id: string; name: string; dist?: number } | null>(null);

  const openStore = (id: string, name: string) => {
    const dist = result?.dists?.find(d => d.id === id)?.dist;
    setStore({ id, name, dist });
  };

  const calc = () => {
    const goal = (S.get<Profile>('profile') || {}).goal || 'bulk';
    setResult(runSmartCart(period, budget, addr.trim(), goal));
  };

  const ps = priceSyncState;
  const totalProducts = MARKET_DB.products.length;
  const statusCls = ps.running ? 'loading' : ps.count > 0 ? 'ok' : 'err';
  const statusTxt = ps.running ? '◈ ' + t('price_status_loading')
    : ps.count > 0 ? `◈ ${ps.count}/${totalProducts} ${t('price_status_live')} · ${ps.ts ? new Date(ps.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}`
    : '◈ ' + t('price_status_sim');

  const cd = result?.dists?.find(d => d.id === result.cheapest.id);

  return (
    <div className="widget" id="cart-widget">
      <div className="w-title">{t('w_cart')}</div>
      <div className="price-status-row">
        <span className={`price-status ${statusCls}`}>{statusTxt}</span>
        <button className="seg-btn" onClick={() => syncLivePrices(true)}>{t('price_sync')}</button>
      </div>
      <div className="cart-form">
        <div className="cart-row">
          <span className="cart-label">{t('cart_period')}</span>
          <div className="seg-row">
            <button className={`seg-btn${period === 'week' ? ' sel' : ''}`} onClick={() => setPeriod('week')}>{t('cart_week')}</button>
            <button className={`seg-btn${period === 'month' ? ' sel' : ''}`} onClick={() => setPeriod('month')}>{t('cart_month')}</button>
          </div>
        </div>
        <div className="cart-row">
          <span className="cart-label">{t('cart_budget')}</span>
          <div className="seg-row">
            {[10, 20, 30, 50].map(b => (
              <button key={b} className={`seg-btn${budget === b ? ' sel' : ''}`} data-budget={b} onClick={() => setBudget(b)}>{b}€</button>
            ))}
          </div>
        </div>
        <input type="text" className="cart-addr" value={addr} placeholder={t('cart_addr_ph')} onChange={e => setAddr(e.target.value)} />
        <button className="scan-btn cart-calc-btn" onClick={calc}>{t('cart_calc')}</button>
      </div>
      <div className="cart-results">
        {result === null ? null : (
          <>
            <div className="cart-summary">
              <div className="cart-stat"><span>{t('cart_total')}</span><b>{fmtEUR(result.total)}</b></div>
              <div className="cart-stat"><span>{t('cart_saved')}</span><b style={{ color: 'var(--success)' }}>{fmtEUR(result.saved)}</b></div>
              <div className="cart-stat"><span>{t('cart_fit')}</span><b>{result.util}%</b></div>
            </div>
            <div className="cart-budget-bar"><div className="cart-budget-fill" style={{ width: Math.min(100, result.util) + '%' }} /></div>
            {result.dists && cd && (
              <>
                <div className="cart-dist">{IconMapPin} <span>{t('cart_nearest')}: <b>{result.cheapest.name}</b> · {String(cd.dist).replace('.', ',')} km · ~{Math.round(cd.dist * 12)} min 🚶</span></div>
                <div className="cart-dist-list">
                  {result.dists.slice().sort((a, b) => a.dist - b.dist).map(d => (
                    <button className="cart-dist-chip" key={d.id} onClick={() => openStore(d.id, d.name)}
                      title={t('store_open')}>{IconMapPin}{d.name} · {String(d.dist).replace('.', ',')} km</button>
                  ))}
                </div>
              </>
            )}
            {Object.entries(result.groups).map(([mid, list]) => {
              const m = MARKET_DB.markets.find(x => x.id === mid)!;
              const sub = list.reduce((a, i) => a + i.price * i.qty, 0);
              return (
                <div className="cart-market" key={mid}>
                  <button className="cart-market-hd" onClick={() => openStore(mid, m.name)} title={t('store_open')}>
                    <span>{IconStore} {m.name} <span className="cart-market-tap">{IconMapPin}</span></span>
                    <small>{list.length} · {fmtEUR(sub)}</small>
                  </button>
                  {list.map(i => (
                    <div className="cart-item" key={i.product.id}>
                      <span className="cart-item-ic">{i.product.icon}</span>
                      <span className="cart-item-nm">{i.product.name}</span>
                      <span className="cart-item-qty">×{i.qty}</span>
                      {LIVE_PRICES[i.product.id] && <span className="cart-live">{t('cart_live')}</span>}
                      {i.disc > 0 && <span className="cart-deal">−{Math.round(i.disc * 100)}% {t('cart_deal')}</span>}
                      <span className="cart-item-pr">{fmtEUR(i.price * i.qty)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="cart-hint">{t('cart_hint')}</div>
          </>
        )}
      </div>
      {store && <StoreModal store={store} addr={addr} onClose={() => setStore(null)} />}
    </div>
  );
}

// ── Standort-Vorschau je Supermarkt ──────────────────────────────────
function StoreModal({ store, addr, onClose }: { store: { id: string; name: string; dist?: number }; addr: string; onClose: () => void }) {
  const info = MARKET_LOCATIONS[store.id];
  return (
    <div className="hub-modal open store-modal" onClick={onClose}>
      <div className="store-box" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">{IconStore} {store.name}</span>
          <button className="modal-close" onClick={onClose}>{IconXstore}</button>
        </div>
        <div className="store-body">
          {store.dist != null && (
            <div className="store-dist">{IconMapPin}<span>{t('store_nearest')} · <b>{String(store.dist).replace('.', ',')} km</b> · ~{Math.round(store.dist * 12)} min 🚶</span></div>
          )}
          {info && (
            <div className="store-facts">
              <div className="store-fact"><span>{t('store_region')}</span><b>{info.region}</b></div>
              <div className="store-fact"><span>{t('store_hours')}</span><b>{info.hours}</b></div>
              <div className="store-fact"><span>{t('store_note')}</span><b>{info.note}</b></div>
            </div>
          )}
          <a className="action-btn store-maps" href={storeMapsLink(store.name, addr)} target="_blank" rel="noopener noreferrer">
            {IconExternal} {t('store_maps')}
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══ MANA & MISSION LOG ══════════════════════════════════════════════
function ManaWidget() {
  useAppState();
  const count = S.get<number>('mana_' + dateKey()) || 0;
  const setCount = (i: number) => {
    const next = i + 1 <= count ? i : i + 1;
    S.set('mana_' + dateKey(), next);
    refresh();
  };
  return (
    <div className="widget">
      <div className="w-title">{t('w_mana')}</div>
      <div className="mana-drops">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`drop${i < count ? ' filled' : ''}`} title={`${i + 1}/8`} onClick={() => setCount(i)}>{IconWater}</div>
        ))}
      </div>
      <div className="mana-count">{count} / 8 {t('mana_label')}</div>
    </div>
  );
}

function MissionLog() {
  const [note, setNote] = useState<string>(() => S.get<string>('note_' + dateKey()) || '');
  return (
    <div className="widget">
      <div className="w-title">{t('w_mission')}</div>
      <textarea className="mission-log" rows={4} value={note} placeholder={t('mission_ph')}
        onChange={e => { setNote(e.target.value); S.set('note_' + dateKey(), e.target.value); }} />
    </div>
  );
}
