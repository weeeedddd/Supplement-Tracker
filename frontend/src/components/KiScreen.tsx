import { useMemo, useState } from 'react';
import { S } from '../lib/storage';
import { showScreen } from '../lib/store';
import { SAFE_SUPPLEMENT_CATALOG, sanitizeRoutineSelection, toProtocol } from '../lib/supplements';
import type { ProtocolItem } from '../lib/engine';

export function KiScreen() {
  const initial = useMemo(() => {
    const current = S.get<ProtocolItem[]>('protocol') || [];
    return sanitizeRoutineSelection(current.map(item => item.id));
  }, []);
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = (id: string) => {
    setSelected(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  const save = () => {
    S.set('protocol', toProtocol(selected));
    showScreen('dashboard');
  };

  const skip = () => {
    S.set('protocol', []);
    showScreen('dashboard');
  };

  return (
    <main className="screen active" id="screen-ki">
      <div className="routine-shell">
        <header className="routine-hero">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div>
            <span className="eyebrow">Optional routine</span>
            <h1>Track what you already chose</h1>
            <p>CORELINE does not diagnose a deficiency, prescribe a dose, or build a medical supplement stack. Select only products you already use or have discussed with a qualified clinician.</p>
          </div>
        </header>

        <div className="safety-note" role="note">
          <strong>Label-led by design.</strong>
          <span>Dose and product decisions stay with you, the product label, and your clinician. Food and sleep remain the foundation.</span>
        </div>

        <section className="routine-grid" aria-label="Common supplement tracking choices">
          {SAFE_SUPPLEMENT_CATALOG.map(item => {
            const active = selected.includes(item.id);
            return (
              <button key={item.id} className={active ? 'routine-card selected' : 'routine-card'}
                onClick={() => toggle(item.id)} aria-pressed={active}>
                <span className="routine-check" aria-hidden="true">{active ? '✓' : '+'}</span>
                <span className="routine-copy">
                  <strong>{item.label}</strong>
                  <span>{item.purpose}</span>
                  <small>{item.timingLabel} · {item.guidance}</small>
                  <em>{item.caution}</em>
                </span>
              </button>
            );
          })}
        </section>

        <footer className="routine-actions">
          <button className="secondary-button" onClick={skip}>Skip supplements</button>
          <button className="action-btn" onClick={save}>
            Save {selected.length ? `${selected.length} item${selected.length === 1 ? '' : 's'}` : 'empty routine'}
          </button>
        </footer>
      </div>
    </main>
  );
}
