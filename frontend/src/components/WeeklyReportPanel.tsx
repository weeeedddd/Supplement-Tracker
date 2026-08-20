// ── Wochen-Systembericht.
//    Formwahl nach Aufgabe: Balken für Grössen, Punkte für Tageszustände.
//    Farbe ist nie das einzige Signal — jede Zahl steht daneben, und jede
//    Empfehlung nennt ihren Beleg.
import { useMemo } from 'react';

import { lang } from '../lib/i18n';
import { useModalIsolation } from '../lib/modal';
import { MUSCLE_LOAD_STORAGE_KEY, sanitizeMuscleLoadEntries } from '../lib/muscleLoad';
import { S } from '../lib/storage';
import {
  buildWeeklyReport, type RecommendationId, type RecommendationTone, type RegionId,
} from '../lib/weeklyReport';
import { SystemIcon } from './SystemIcon';

const copy = (de: string, en: string): string => lang === 'de' ? de : en;

const REGION_LABEL: Record<RegionId, [string, string]> = {
  push: ['Druck', 'Push'],
  pull: ['Zug', 'Pull'],
  legs: ['Beine', 'Legs'],
  core: ['Rumpf', 'Core'],
};

const RECOMMENDATION_TEXT: Record<RecommendationId, [string, string]> = {
  'low-data': ['Zu wenige Einträge für belastbare Aussagen — die Datenlage trägt noch nicht.',
               'Too few entries for reliable statements — the data does not carry yet.'],
  imbalance: ['Deutliches Ungleichgewicht zwischen den Bereichen.',
              'Clear imbalance between regions.'],
  balanced: ['Alle Bereiche liegen nah beieinander.', 'All regions sit close together.'],
  'volume-spike': ['Volumen stark gestiegen — das Verletzungsrisiko steigt mit.',
                   'Volume rose sharply — injury risk rises with it.'],
  'volume-drop': ['Volumen deutlich gefallen.', 'Volume dropped noticeably.'],
  'volume-growth': ['Volumen wächst kontrolliert.', 'Volume is growing under control.'],
  'nutrition-gap': ['Ernährung nur lückenhaft erfasst — Makro-Aussagen sind entsprechend unsicher.',
                    'Nutrition logged only patchily — macro statements are uncertain accordingly.'],
  'nutrition-good': ['Ernährung konstant erfasst.', 'Nutrition logged consistently.'],
  'calories-under': ['Im Schnitt unter dem Kalorienziel.', 'Averaging below the calorie target.'],
  'calories-over': ['Im Schnitt über dem Kalorienziel.', 'Averaging above the calorie target.'],
  'protocol-gap': ['Protokoll selten vollständig.', 'Protocol rarely completed.'],
  'protocol-good': ['Protokoll zuverlässig eingehalten.', 'Protocol followed reliably.'],
  'frequency-low': ['Nur eine Einheit in dieser Woche.', 'Only one session this week.'],
};

const TONE_MARK: Record<RecommendationTone, string> = { good: '✓', info: '•', warn: '!', bad: '!!' };

export function WeeklyReportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useModalIsolation(open, {
    backgroundSelectors: ['.system-topbar', '#coreline-main', '.system-bottom-nav'],
    onEscape: onClose,
  });

  const report = useMemo(
    () => open ? buildWeeklyReport(sanitizeMuscleLoadEntries(S.get<unknown>(MUSCLE_LOAD_STORAGE_KEY))) : null,
    [open],
  );

  if (!open || !report) return null;

  const peakVolume = Math.max(1, ...report.volume.map(week => week.volume));
  const loggedDays = report.nutrition.filter(day => day.logged).length;

  return (
    <div className="product-modal report-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="report-panel" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <header className="guild-header">
          <div>
            <span><SystemIcon name="history" />{copy('WOCHENBERICHT', 'WEEKLY REPORT')}</span>
            <h2 id="report-title">{copy('System-Bericht', 'System report')}</h2>
          </div>
          <button type="button" className="system-icon-button" onClick={onClose}
            aria-label={copy('Schliessen', 'Close')}>
            <SystemIcon name="close" />
          </button>
        </header>

        <div className="report-body">
          {/* Muskelbalance — Grösse gegen Wochenziel, direkt beschriftet */}
          <section className="report-section">
            <p className="guild-section-title">{copy('Muskelbalance', 'Muscle balance')}</p>
            {report.balance.map(row => (
              <div className="report-balance" key={row.id}>
                <span className="report-balance-label">{copy(...REGION_LABEL[row.id])}</span>
                <span className="report-balance-track">
                  <i style={{ width: `${Math.min(100, row.pct)}%` }} />
                </span>
                <span className="report-balance-value">{row.pct}%</span>
              </div>
            ))}
            <p className="report-note">
              {copy('100 % = Wochenziel des Bereichs', '100% = the region’s weekly target')}
            </p>
          </section>

          {/* Volumenverlauf — eine Grösse über vier Wochen */}
          <section className="report-section">
            <p className="guild-section-title">{copy('Volumenverlauf', 'Volume progression')}</p>
            <div className="report-columns">
              {report.volume.map(week => (
                <div className="report-column" key={week.weeksAgo}>
                  <span className="report-column-value">{week.volume}</span>
                  <span className="report-column-bar"
                    style={{ height: `${Math.max(3, (week.volume / peakVolume) * 62)}px` }} />
                  <span className="report-column-label">
                    {week.weeksAgo === 0 ? copy('Diese Woche', 'This week') : `−${week.weeksAgo}`}
                  </span>
                  <span className="report-column-sub">
                    {week.sessions} {copy('Einheiten', 'sessions')}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Ernährung — Tageszustand als Punktreihe plus Zahl */}
          <section className="report-section">
            <p className="guild-section-title">{copy('Konstanz', 'Consistency')}</p>
            <div className="report-days" role="img" aria-label={`${loggedDays}/7`}>
              {report.nutrition.map(day => (
                <span key={day.key} className={day.logged ? 'report-day on' : 'report-day'} title={day.key} />
              ))}
              <span className="report-days-value">{loggedDays}/7 · {report.nutritionPct}%</span>
            </div>
            <div className="report-kv">
              <span>{copy('Protokoll-Treue', 'Protocol adherence')}</span><strong>{report.protocolPct}%</strong>
            </div>
            {report.caloriePct !== null && (
              <div className="report-kv">
                <span>{copy('Kalorienziel', 'Calorie target')}</span><strong>{report.caloriePct}%</strong>
              </div>
            )}
          </section>

          {report.records.length > 0 && (
            <section className="report-section">
              <p className="guild-section-title">{copy('Rekorde', 'Records')}</p>
              {report.records.map(record => (
                <div className="report-kv" key={record.kind}>
                  <span>{recordLabel(record.kind, record.label)}</span>
                  <strong>{record.value}{record.kind === 'streak' ? ` ${copy('Tage', 'days')}` : ''}</strong>
                </div>
              ))}
            </section>
          )}

          <section className="report-section">
            <p className="guild-section-title">{copy('Empfehlungen', 'Recommendations')}</p>
            {report.recommendations.map(recommendation => (
              <div className={`report-recommendation ${recommendation.tone}`} key={recommendation.id}>
                <span className="report-mark" aria-hidden="true">{TONE_MARK[recommendation.tone]}</span>
                <div>
                  <p>{copy(...RECOMMENDATION_TEXT[recommendation.id])}</p>
                  <small>{copy('Beleg', 'Evidence')}: {recommendation.evidence}</small>
                </div>
              </div>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}

function recordLabel(kind: string, label: string): string {
  if (kind === 'week') return copy('Stärkste Woche', 'Best week');
  if (kind === 'streak') return copy('Längste Serie', 'Longest streak');
  if (kind === 'day') return copy('Stärkster Tag', 'Best day') + ` · ${label}`;
  return copy('Härtester Satz', 'Hardest set') + ` · ${label}`;
}
