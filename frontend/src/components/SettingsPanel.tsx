import { useEffect, useRef, useState } from 'react';
import { LANG_NAMES, LANGS, lang, setLang } from '../lib/i18n';
import { applyTheme, getCurrentTheme } from '../lib/themes';
import { collectExportableLocalData, LOCAL_SYNC_STATE } from '../lib/localMode';
import { S } from '../lib/storage';

const THEME_CHOICES = [
  { id: 'shadow', label: 'Night' },
  { id: 'system', label: 'Pulse' },
  { id: 'ghoul', label: 'Ember' },
] as const;

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onLocalReset: () => void;
}

export function SettingsPanel({ open, onClose, onLocalReset }: SettingsPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setResetArmed(false);
      return;
    }
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const exportData = () => {
    const snapshot = collectExportableLocalData(localStorage);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coreline-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetLocalData = () => {
    const appKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(S._p)) appKeys.push(key);
    }
    appKeys.forEach(key => localStorage.removeItem(key));
    onClose();
    onLocalReset();
  };

  return (
    <div className="product-modal" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <span className="eyebrow">Local workspace</span>
            <h2 id="settings-title">Settings & data</h2>
          </div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close settings">×</button>
        </header>

        <div className="settings-section sync-state" aria-label="Account and sync status">
          <div className="status-dot" aria-hidden="true" />
          <div>
            <strong>Saved on this device</strong>
            <p>Your profile, plan, meals, and sessions work without an account. Cloud accounts and encrypted sync are a future integration—not simulated here.</p>
            <code>{LOCAL_SYNC_STATE.mode} · schema {LOCAL_SYNC_STATE.schemaVersion}</code>
          </div>
        </div>

        <div className="settings-grid">
          <fieldset className="settings-section">
            <legend>Language</legend>
            <div className="choice-row">
              {LANGS.map(code => (
                <button key={code} className={lang === code ? 'choice active' : 'choice'}
                  onClick={() => setLang(code)} aria-pressed={lang === code}>
                  {LANG_NAMES[code] || code.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Visual mode</legend>
            <div className="choice-row">
              {THEME_CHOICES.map(choice => (
                <button key={choice.id} className={getCurrentTheme() === choice.id ? 'choice active' : 'choice'}
                  onClick={() => applyTheme(choice.id)} aria-pressed={getCurrentTheme() === choice.id}>
                  {choice.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="settings-section data-actions">
          <div>
            <strong>Portable backup</strong>
            <p>Download a JSON snapshot. Obsolete demo-login credentials are always excluded.</p>
          </div>
          <button className="secondary-button" onClick={exportData}>Export local data</button>
        </div>

        <div className="settings-section danger-zone">
          <div>
            <strong>Reset this device</strong>
            <p>Deletes all CORELINE data stored by this browser. Export first if you need a backup.</p>
          </div>
          {!resetArmed ? (
            <button className="danger-button" onClick={() => setResetArmed(true)}>Prepare reset</button>
          ) : (
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setResetArmed(false)}>Cancel</button>
              <button className="danger-button" onClick={resetLocalData}>Delete local data</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
