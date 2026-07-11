// ═══════════════════════════════════════════════════════════════════
//  ◈ PROTOCOL TRAINING — Trainings-Hub mit Live-Set-Tracker (OLED)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { refresh } from '../lib/store';
import {
  fetchWorkouts, createWorkout, logWorkout, generatePlan,
  type Workout, type Exercise, type PlanLevel, type PlanGoal, type PlanFocus,
} from '../lib/fitness';

const IconDumbbell = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>;
const IconPlus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconX = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconCheck = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconZap = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconClock = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconSpark = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>;

export function TrainingScreen() {
  const [plans, setPlans] = useState<Workout[]>([]);
  const [active, setActive] = useState<Workout | null>(null);
  const [creating, setCreating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => { fetchWorkouts().then(setPlans); };
  useEffect(load, []);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const onFinish = async (w: Workout) => {
    const buff = await logWorkout({ name: w.name, kind: w.kind });
    setActive(null);
    refresh();
    flash(`${buff.icon} ${buff.label} · ${buff.desc}`);
  };

  const onGenerated = (w: Workout) => {
    setBuilding(false);
    load();
    setActive(w);   // direkt live tracken
    flash(`${IconZapTxt} ${t('ai_created')}`);
  };

  return (
    <div className="screen active" id="screen-training">
      <div className="hub-wrap">
        <div className="ki-chat-hd">
          <div className="ki-sigil-sm">{IconDumbbell}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ki-chat-hd-title">{t('train_title')}</div>
            <div className="ki-chat-hd-sub">{t('train_sub')}</div>
          </div>
        </div>

        <div className="hub-scroll">
          <button className="ai-cta" onClick={() => setBuilding(true)}>
            <span className="ai-cta-ic">{IconSpark}</span>
            <span className="ai-cta-tx"><b>{t('ai_title')}</b><span>{t('ai_sub')}</span></span>
            <span className="ai-cta-go">{IconPlus}</span>
          </button>
          <div className="hub-filters">
            <button className="chip chip-forge" onClick={() => setCreating(true)}>{IconPlus}{t('train_forge')}</button>
          </div>
          <div className="plan-list">
            {plans.map(w => (
              <button className="plan-card" key={String(w.id)} onClick={() => setActive(w)}>
                <div className="plan-ic">{w.icon}</div>
                <div className="plan-body">
                  <div className="plan-name">{w.name}</div>
                  <div className="plan-focus">{w.focus}</div>
                </div>
                <div className="plan-count"><b>{w.exercises.length}</b><span>{t('train_ex')}</span></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {active && <LiveTracker plan={active} onClose={() => setActive(null)} onFinish={() => onFinish(active)} />}
      {creating && <WorkoutCreator onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {building && <AIBuilder onClose={() => setBuilding(false)} onGenerated={onGenerated} />}
      {toast && <div className="buff-toast">{IconZap}<span>{toast}</span></div>}
    </div>
  );
}

const IconZapTxt = '⚡';

function LiveTracker({ plan, onClose, onFinish }: { plan: Workout; onClose: () => void; onFinish: () => void }) {
  // pro Übung ein Array gecheckter Sätze
  const [done, setDone] = useState<Record<number, boolean[]>>(() =>
    Object.fromEntries(plan.exercises.map((e, i) => [i, Array(e.sets).fill(false)])));

  const toggle = (ei: number, si: number) => {
    setDone(prev => {
      const next = { ...prev, [ei]: [...prev[ei]] };
      next[ei][si] = !next[ei][si];
      return next;
    });
  };
  const total = plan.exercises.reduce((a, e) => a + e.sets, 0);
  const checked = Object.values(done).reduce((a, arr) => a + arr.filter(Boolean).length, 0);

  return (
    <div className="hub-modal open" onClick={onClose}>
      <div className="hub-box hub-box-lg" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">{plan.icon} {plan.name}</span>
          <button className="modal-close" onClick={onClose}>{IconX}</button>
        </div>
        <div className="tracker-prog">
          <div className="tracker-prog-bar"><div style={{ width: (total ? checked / total * 100 : 0) + '%' }} /></div>
          <span>{checked}/{total} {t('train_sets')}</span>
        </div>
        <div className="hub-box-body">
          {plan.exercises.map((e: Exercise, ei) => (
            <div className="tx-exercise" key={ei}>
              <div className="tx-head">
                <span className="tx-name">{e.name}</span>
                <span className="tx-spec">{e.reps} × {e.weight} · {IconClock}{e.rest}s</span>
              </div>
              <div className="tx-sets">
                {done[ei].map((ok, si) => (
                  <button key={si} className={`tx-set${ok ? ' done' : ''}`} onClick={() => toggle(ei, si)}
                    title={`Satz ${si + 1}`}>
                    {ok ? IconCheck : si + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="action-btn hub-log-btn" onClick={onFinish}>{IconZap} {t('train_finish')}</button>
        </div>
      </div>
    </div>
  );
}

function WorkoutCreator({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('split');
  const [focus, setFocus] = useState('');
  const [rows, setRows] = useState<Exercise[]>([{ name: '', sets: 3, reps: '10', weight: '', rest: 60 }]);

  const setRow = (i: number, patch: Partial<Exercise>) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRow = () => setRows([...rows, { name: '', sets: 3, reps: '10', weight: '', rest: 60 }]);
  const delRow = (i: number) => setRows(rows.filter((_, j) => j !== i));

  const save = async () => {
    const ex = rows.filter(r => r.name.trim());
    if (!name.trim() || !ex.length) return;
    await createWorkout({ name: name.trim(), kind, focus: focus.trim(), exercises: ex, icon: '🏋' });
    onSaved();
  };

  return (
    <div className="hub-modal open" onClick={onClose}>
      <div className="hub-box hub-box-lg" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">◈ {t('train_forge')}</span>
          <button className="modal-close" onClick={onClose}>{IconX}</button>
        </div>
        <div className="hub-box-body">
          <input className="hub-input" placeholder={t('train_f_name')} value={name} onChange={e => setName(e.target.value)} />
          <div className="hub-row2">
            <select className="hub-input" value={kind} onChange={e => setKind(e.target.value)}>
              {['split', 'fullbody', 'push', 'pull', 'legs'].map(x => <option key={x} value={x}>{t('kind_' + x)}</option>)}
            </select>
            <input className="hub-input" placeholder={t('train_f_focus')} value={focus} onChange={e => setFocus(e.target.value)} />
          </div>
          <div className="tx-editor">
            {rows.map((r, i) => (
              <div className="tx-erow" key={i}>
                <input className="hub-input tx-en" placeholder={t('train_f_ex')} value={r.name} onChange={e => setRow(i, { name: e.target.value })} />
                <input className="hub-input tx-es" type="number" inputMode="numeric" value={r.sets} onChange={e => setRow(i, { sets: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)) })} title="Sätze" />
                <input className="hub-input tx-er" placeholder={t('train_f_reps')} value={r.reps} onChange={e => setRow(i, { reps: e.target.value })} />
                <input className="hub-input tx-ew" placeholder="kg" value={r.weight} onChange={e => setRow(i, { weight: e.target.value })} />
                {rows.length > 1 && <button className="tx-del" onClick={() => delRow(i)}>{IconX}</button>}
              </div>
            ))}
            <button className="chip chip-forge tx-add" onClick={addRow}>{IconPlus}{t('train_add_ex')}</button>
          </div>
          <button className="action-btn" onClick={save}>{t('train_f_save')}</button>
        </div>
      </div>
    </div>
  );
}

// ── AI PROTOCOL BUILDER — KI-gestützter Trainingsplan-Generator ──────
function AIBuilder({ onClose, onGenerated }: { onClose: () => void; onGenerated: (w: Workout) => void }) {
  const [level, setLevel] = useState<PlanLevel>('beginner');
  const [goal, setGoal] = useState<PlanGoal>('muscle');
  const [focus, setFocus] = useState<PlanFocus>('push');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);

  const levels: PlanLevel[] = ['beginner', 'advanced', 'elite'];
  const goals: PlanGoal[] = ['muscle', 'strength', 'endurance', 'definition'];
  const focuses: PlanFocus[] = ['push', 'pull', 'legs', 'fullbody'];

  const preview = generatePlan({ level, goal, focus, days });

  const generate = async () => {
    setBusy(true);
    const saved = await createWorkout(preview);
    onGenerated(saved);
  };

  return (
    <div className="hub-modal open" onClick={onClose}>
      <div className="hub-box hub-box-lg" onClick={e => e.stopPropagation()}>
        <div className="hub-box-hd">
          <span className="hub-box-title">{IconSpark} {t('ai_title')}</span>
          <button className="modal-close" onClick={onClose}>{IconX}</button>
        </div>
        <div className="hub-box-body">
          <div className="ai-field">
            <label className="ai-label">{t('ai_level')}</label>
            <div className="ai-seg">
              {levels.map(l => (
                <button key={l} className={`ai-opt${level === l ? ' sel' : ''}`} onClick={() => setLevel(l)}>{t('lvl_' + l)}</button>
              ))}
            </div>
          </div>
          <div className="ai-field">
            <label className="ai-label">{t('ai_goal')}</label>
            <div className="ai-seg ai-seg-2">
              {goals.map(g => (
                <button key={g} className={`ai-opt${goal === g ? ' sel' : ''}`} onClick={() => setGoal(g)}>{t('goal_' + g)}</button>
              ))}
            </div>
          </div>
          <div className="ai-field">
            <label className="ai-label">{t('ai_focus')}</label>
            <div className="ai-seg ai-seg-2">
              {focuses.map(f => (
                <button key={f} className={`ai-opt${focus === f ? ' sel' : ''}`} onClick={() => setFocus(f)}>{t('kind_' + f)}</button>
              ))}
            </div>
          </div>
          <div className="ai-field">
            <label className="ai-label">{t('ai_days')}: <b className="ai-days-val">{days}×</b></label>
            <div className="ai-seg">
              {[2, 3, 4, 5, 6].map(d => (
                <button key={d} className={`ai-opt${days === d ? ' sel' : ''}`} onClick={() => setDays(d)}>{d}</button>
              ))}
            </div>
          </div>

          {/* Live-Vorschau des generierten Protokolls */}
          <div className="ai-preview">
            <div className="ai-preview-hd">{IconSpark}<span>{preview.name}</span></div>
            <div className="ai-preview-focus">{preview.focus}</div>
            <div className="ai-preview-list">
              {preview.exercises.map((ex, i) => (
                <div className="ai-preview-ex" key={i}>
                  <span className="ai-px-n">{ex.name}</span>
                  <span className="ai-px-s">{ex.sets}×{ex.reps} · {IconClock}{ex.rest}s</span>
                </div>
              ))}
            </div>
          </div>

          <button className="action-btn ai-gen-btn" onClick={generate} disabled={busy}>
            {IconSpark} {busy ? '…' : t('ai_generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
