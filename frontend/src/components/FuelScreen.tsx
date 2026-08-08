// ═══════════════════════════════════════════════════════════════════
//  ◈ MATERIA FUEL — Ernährungs-Hub (Gerichte, Makros, Rezept schmieden)
//  Mobile-first, Glassmorphism, Neon-Makrobalken, Lucide-Icons.
//  · Rezeptbilder + Schritt-für-Schritt-Zubereitung
//  · Teilen-Button → Rezept-Card im Community-Chat
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { refresh } from '../lib/store';
import { S } from '../lib/storage';
import { calcConsumed, type Macros } from '../lib/engine';
import {
  fetchDishes, createDish, logMeal, shareRecipeToChat, locDish,
  estimateCaloriesFromMacros, normalizeNutrition, nutritionFromDish, validateNutrition,
  type Dish,
} from '../lib/fitness';
import '../fuel.css';

const IconPot = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="m7 8 1-4"/><path d="m12 8 .5-4"/><path d="m17 8-1-4"/></svg>;
const IconPlus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconX = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconClock = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconZap = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconAir = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><circle cx="12" cy="14" r="3"/></svg>;
const IconRice = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 18 0"/><rect x="2" y="12" width="20" height="8" rx="2"/><path d="M7 8v-.5"/><path d="M17 8v-.5"/></svg>;
const IconShare = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
const IconList = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;

const CATS = ['all', 'breakfast', 'main', 'dessert', 'snack'];
const EQUIP = [{ id: 'airfryer', icon: IconAir }, { id: 'ricecooker', icon: IconRice }];
const PAGE_SIZE = 24;

function isOfflineSafeImage(source?: string): boolean {
  if (!source) return false;
  if (source.startsWith('data:image/') || source.startsWith('blob:')) return true;
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source);
}

export function FuelScreen() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [cat, setCat] = useState('all');
  const [equip, setEquip] = useState<string | null>(null);
  const [detail, setDetail] = useState<Dish | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = () => {
    setVisibleCount(PAGE_SIZE);
    fetchDishes(cat === 'all' ? undefined : cat, equip || undefined).then(setDishes);
  };
  useEffect(load, [cat, equip]);

  const goals = S.get<Macros>('macros');
  const c = calcConsumed();
  const bars: { key: keyof Macros; label: string; cls: string; unit: string }[] = [
    { key: 'kcal', label: t('m_kcal'), cls: 'nb-kcal', unit: '' },
    { key: 'prot', label: t('m_prot'), cls: 'nb-prot', unit: 'g' },
    { key: 'carb', label: t('m_carb'), cls: 'nb-carb', unit: 'g' },
    { key: 'fat', label: t('m_fat'), cls: 'nb-fat', unit: 'g' },
    { key: 'sug', label: t('m_sug'), cls: 'nb-sug', unit: 'g' },
  ];

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };
  const visibleDishes = dishes.slice(0, visibleCount);

  const onLog = async (d: Dish) => {
    const buff = await logMeal({ name: d.name, ...nutritionFromDish(d) });
    setDetail(null);
    refresh();
    flash(`${buff.icon} ${buff.label} · ${buff.desc}`);
  };

  const onShare = async (d: Dish) => {
    const ok = await shareRecipeToChat(d);
    flash(ok ? `${d.icon} ${t('fuel_shared')}` : t('fuel_share_offline'));
  };

  return (
    <div className="screen active" id="screen-fuel">
      <div className="hub-wrap">
        <div className="ki-chat-hd">
          <div className="ki-sigil-sm">{IconPot}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ki-chat-hd-title">Nutrition</div>
            <div className="ki-chat-hd-sub">Log meals, review targets, and keep recipes close.</div>
          </div>
        </div>

        <div className="hub-scroll">
          {/* Neon-Makrobalken */}
          {goals && (
            <div className="widget neon-macros">
              <div className="w-title">{t('fuel_macros')}</div>
              {bars.map(b => {
                const pct = goals[b.key] > 0 ? Math.min(100, c[b.key] / goals[b.key] * 100) : 0;
                return (
                  <div className="neon-row" key={b.key}>
                    <span className="neon-label">{b.label}</span>
                    <div className="neon-track"><div className={`neon-fill ${b.cls}`} style={{ width: pct + '%' }} /></div>
                    <span className="neon-val">{c[b.key]}<span className="neon-goal">/{goals[b.key]}{b.unit}</span></span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filter */}
          <div className="hub-filters">
            {CATS.map(x => (
              <button key={x} className={`chip${cat === x ? ' sel' : ''}`} onClick={() => setCat(x)}>{t('cat_' + x)}</button>
            ))}
            {EQUIP.map(e => (
              <button key={e.id} className={`chip chip-eq${equip === e.id ? ' sel' : ''}`}
                onClick={() => setEquip(equip === e.id ? null : e.id)}>{e.icon}{t('eq_' + e.id)}</button>
            ))}
            <button className="chip chip-forge" onClick={() => setCreating(true)}>{IconPlus}{t('fuel_forge')}</button>
          </div>

          {/* Gerichte-Grid */}
          <div className="dish-grid">
            {visibleDishes.map(d0 => {
              const d = locDish(d0);
              return (
                <article className="dish-card" key={String(d0.id)}>
                  <button className="dish-open" type="button" onClick={() => setDetail(d0)} aria-label={`${d.name} öffnen`}>
                    {isOfflineSafeImage(d.image)
                      ? <img className="dish-thumb" src={d.image} alt="" loading="lazy" />
                      : <span className="dish-ic" aria-hidden="true">{d.icon}</span>}
                    <span className="dish-body">
                      <span className="dish-name">{d.name}</span>
                      <span className="dish-meta">
                        <span className="dish-cat">{t('cat_' + d.category)}</span>
                        <span className="dish-time">{IconClock}{d.prep_min}′</span>
                      </span>
                      <span className="dish-macros">
                        <span className="dm dm-k">{d.kcal} kcal</span>
                        <span className="dm dm-p">{d.prot}g P</span>
                        {d.equipment.filter(e => e === 'airfryer' || e === 'ricecooker').map(e => (
                          <span className="dm dm-eq" key={e}>{e === 'airfryer' ? '♨' : '🍚'}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                  <button className="dish-share" type="button" title={t('fuel_share')} aria-label={`${d.name}: ${t('fuel_share')}`}
                    onClick={() => onShare(d0)}>{IconShare}</button>
                </article>
              );
            })}
            {!dishes.length && <div className="ta-empty">{t('fuel_none')}</div>}
          </div>
          {visibleCount < dishes.length && (
            <button className="system-button quiet dish-load-more" type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
              Mehr Rezepte laden · {Math.min(PAGE_SIZE, dishes.length - visibleCount)} von {dishes.length - visibleCount}
            </button>
          )}
        </div>
      </div>

      {detail && <DishDetail dish={detail} onClose={() => setDetail(null)} onLog={() => onLog(detail)} onShare={() => onShare(detail)} />}
      {creating && <DishCreator onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {toast && <div className="buff-toast">{IconZap}<span>{toast}</span></div>}
    </div>
  );
}

function DishDetail({ dish: dish0, onClose, onLog, onShare }: { dish: Dish; onClose: () => void; onLog: () => void; onShare: () => void }) {
  const dish = locDish(dish0);
  return (
    <div className="hub-modal open" onClick={onClose}>
      <div className="hub-box" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">{dish.icon} {dish.name}</span>
          <button className="modal-close" onClick={onClose}>{IconX}</button>
        </div>
        <div className="hub-box-body">
          {isOfflineSafeImage(dish.image) && <img className="detail-hero" src={dish.image} alt={dish.name} loading="lazy" />}
          <div className="detail-macros">
            <div className="dmx"><b>{dish.kcal}</b><span>kcal</span></div>
            <div className="dmx"><b>{dish.prot}g</b><span>{t('m_prot')}</span></div>
            <div className="dmx"><b>{dish.carb}g</b><span>{t('m_carb')}</span></div>
            <div className="dmx"><b>{dish.fat}g</b><span>{t('m_fat')}</span></div>
            <div className="dmx"><b>{dish.sug || 0}g</b><span>{t('m_sug')}</span></div>
          </div>
          <div className="detail-sec">{IconList} {t('fuel_ingredients')} · {IconClock} {dish.prep_min} min</div>
          <ul className="ingredient-list">
            {dish.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
          {dish.steps && dish.steps.length > 0 && (
            <>
              <div className="detail-sec">{IconPot} {t('fuel_steps')}</div>
              <ol className="step-list">
                {dish.steps.map((s, i) => (
                  <li key={i}><span className="step-num">{i + 1}</span><span>{s}</span></li>
                ))}
              </ol>
            </>
          )}
          <div className="detail-actions">
            <button className="action-btn hub-log-btn" onClick={onLog}>{IconZap} {t('fuel_log')}</button>
            <button className="hub-share-btn" onClick={onShare}>{IconShare} {t('fuel_share')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DishCreator({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('main');
  const [prep, setPrep] = useState('');
  const [ing, setIng] = useState('');
  const [steps, setSteps] = useState('');
  const [m, setM] = useState({ kcal: '', prot: '', carb: '', fat: '', sug: '' });
  const [eq, setEq] = useState<string[]>([]);
  const [error, setError] = useState('');
  const num = (v: string) => Number.parseFloat(v) || 0;
  const toggleEq = (x: string) => setEq(eq.includes(x) ? eq.filter(e => e !== x) : [...eq, x]);

  const save = async () => {
    setError('');
    const nutrition = normalizeNutrition({
      kcal: num(m.kcal), prot: num(m.prot), carb: num(m.carb), fat: num(m.fat), sug: num(m.sug),
    });
    const issues = validateNutrition(nutrition);
    if (!name.trim() || !ing.trim() || num(prep) <= 0 || issues.length) {
      setError(issues.some(issue => issue.code === 'sugar-exceeds-carbs')
        ? `${t('m_sug')} ≤ ${t('m_carb')}`
        : 'Name, Zutaten, Zeit und gültige Nährwerte sind erforderlich.');
      return;
    }
    try {
      await createDish({
      name: name.trim(), category, prep_min: num(prep),
      ingredients: ing.split('\n').map(s => s.trim()).filter(Boolean),
      steps: steps.split('\n').map(s => s.trim()).filter(Boolean),
      ...nutrition,
      equipment: eq.length ? eq : ['none'], icon: '🍳', image: '',
      });
      onSaved();
    } catch {
      setError('Die Nährwerte konnten nicht gespeichert werden.');
    }
  };

  return (
    <div className="hub-modal open" onClick={onClose}>
      <div className="hub-box" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">◈ {t('fuel_forge')}</span>
          <button className="modal-close" onClick={onClose}>{IconX}</button>
        </div>
        <div className="hub-box-body">
          <input className="hub-input" placeholder={t('fuel_f_name')} value={name} onChange={e => setName(e.target.value)} />
          <div className="hub-row2">
            <select className="hub-input" value={category} onChange={e => setCategory(e.target.value)}>
              {['breakfast', 'main', 'dessert', 'snack'].map(x => <option key={x} value={x}>{t('cat_' + x)}</option>)}
            </select>
            <input className="hub-input" type="number" inputMode="numeric" placeholder={t('fuel_f_prep')} value={prep} onChange={e => setPrep(e.target.value)} />
          </div>
          <textarea className="hub-input hub-area" placeholder={t('fuel_f_ing')} rows={3} value={ing} onChange={e => setIng(e.target.value)} />
          <textarea className="hub-input hub-area" placeholder={t('fuel_f_steps')} rows={3} value={steps} onChange={e => setSteps(e.target.value)} />
          <div className="hub-macro-grid hub-macro-grid-five">
            {(['kcal', 'prot', 'carb', 'fat', 'sug'] as const).map(k => (
              <div className="hub-mf" key={k}>
                <label>{t('m_' + (k === 'kcal' ? 'kcal' : k))}</label>
                <input type="number" inputMode="decimal" min="0" step="0.1" value={m[k]}
                  aria-invalid={Boolean(error)} onChange={e => setM({ ...m, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="nutrition-estimate">
            ≈ {estimateCaloriesFromMacros({ prot: num(m.prot), carb: num(m.carb), fat: num(m.fat), sug: num(m.sug) })} kcal aus Makros
          </div>
          {error && <div className="fuel-form-error" role="alert">{error}</div>}
          <div className="hub-eq-row">
            <button className={`chip chip-eq${eq.includes('airfryer') ? ' sel' : ''}`} onClick={() => toggleEq('airfryer')}>{IconAir}{t('eq_airfryer')}</button>
            <button className={`chip chip-eq${eq.includes('ricecooker') ? ' sel' : ''}`} onClick={() => toggleEq('ricecooker')}>{IconRice}{t('eq_ricecooker')}</button>
          </div>
          <button className="action-btn" onClick={save}>{t('fuel_f_save')}</button>
        </div>
      </div>
    </div>
  );
}
