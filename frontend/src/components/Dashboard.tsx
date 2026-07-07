// ── Dashboard — TS-Port: Protokoll, Makros, Materia-Scanner 2.1,
//    Smart Cart mit Live-Preisen, Mana, Mission Log, Dynamic Glow
import { useEffect, useRef, useState } from 'react';
import { S, dateKey } from '../lib/storage';
import { t } from '../lib/i18n';
import { refresh, useAppState } from '../lib/store';
import { theme, getCurrentTheme } from '../lib/themes';
import {
  SDEFS, gainXP, checkAchievements, getStreak, finaliseStreak, completedToday,
  getXPRankData, calcConsumed, getFoodLog, saveFoodLog, updateDynamicGlow, playSound,
  type FoodEntry, type Macros, type ProtocolItem, type Profile,
} from '../lib/engine';
import { analyzeImageLocally, analyzeTextLocally } from '../lib/scanner';
import { syncLivePrices, priceSyncState, runSmartCart, fmtEUR, LIVE_PRICES, MARKET_DB, type CartResult } from '../lib/cart';
import { syncScanToBackend } from '../lib/backend';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function getChecked(): string[] { return S.get('day_' + dateKey()) || []; }

export function Dashboard({ onComplete }: { onComplete: (n: number) => void }) {
  useAppState();
  const th = theme();
  const protocol = S.get<ProtocolItem[]>('protocol') || [];
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
  const rankName = (th.ranks[xpData.idx] || th.ranks[0]).toUpperCase();

  return (
    <div className="screen active" id="screen-dashboard">
      <div className="status-bar">
        <span>{th.sigil}</span>
        <span className="sb-rank">{rankName}</span>
        <span className="sb-streak">🔥 {getStreak().count}</span>
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
    setBusy(true);
    if (imgB64) setScanning(true);
    try {
      let result;
      if (imgB64) [result] = await Promise.all([analyzeImageLocally(imgB64, q), sleep(2000)]);
      else result = await analyzeTextLocally(q);
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
          📷
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
                <button className="ta-edit-btn" onClick={() => setEditing(e)}>✎</button>
                <button className="ta-del-btn" onClick={() => del(e.id)}>✕</button>
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
                  <div className="sc-chk">{done ? '✓' : ''}</div>
                  <div className="sc-info">
                    <div className="sc-name">{t(d.nk)}</div>
                    <div className="sc-dose">{t(d.dk)}</div>
                    {d.ok && <div className="sc-note">{t(d.ok)}</div>}
                    {s.wk && <div className="sc-note">◈ {t(s.wk)}</div>}
                    {hasInfo && <div className={`sc-infobox${openInfo === s.id ? ' open' : ''}`}>◈ {infoTxt}</div>}
                  </div>
                  {hasInfo && (
                    <button className="sc-ib" aria-label="Info"
                      onClick={ev => { ev.stopPropagation(); setOpenInfo(openInfo === s.id ? null : s.id); }}>i</button>
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
                <div className="cart-dist">📍 <span>{t('cart_nearest')}: <b>{result.cheapest.name}</b> · {String(cd.dist).replace('.', ',')} km · ~{Math.round(cd.dist * 12)} min 🚶</span></div>
                <div className="cart-dist-list">
                  {result.dists.slice().sort((a, b) => a.dist - b.dist).map(d => (
                    <span className="cart-dist-chip" key={d.id}>{d.name} · {String(d.dist).replace('.', ',')} km</span>
                  ))}
                </div>
              </>
            )}
            {Object.entries(result.groups).map(([mid, list]) => {
              const m = MARKET_DB.markets.find(x => x.id === mid)!;
              const sub = list.reduce((a, i) => a + i.price * i.qty, 0);
              return (
                <div className="cart-market" key={mid}>
                  <div className="cart-market-hd"><span>🏪 {m.name}</span><small>{list.length} · {fmtEUR(sub)}</small></div>
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
          <div key={i} className={`drop${i < count ? ' filled' : ''}`} title={`${i + 1}/8`} onClick={() => setCount(i)}>💧</div>
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
