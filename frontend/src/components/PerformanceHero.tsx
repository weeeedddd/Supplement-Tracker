import type { ReactNode } from 'react';

import { SystemIcon, type SystemIconName } from './SystemIcon';

type PerformanceHeroVariant = 'today' | 'food' | 'training' | 'supplements';

interface PerformanceHeroProps {
  title: string;
  description: string;
  icon: SystemIconName;
  variant: PerformanceHeroVariant;
  status?: ReactNode;
  actions?: ReactNode;
}

export function PerformanceHero({
  title,
  description,
  icon,
  variant,
  status,
  actions,
}: PerformanceHeroProps) {
  return (
    <header className={`performance-hero performance-hero-${variant}`}>
      <div className="performance-hero-copy">
        <span className="performance-hero-mark" aria-hidden="true">
          <SystemIcon name={icon} />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {(status || actions) && (
        <div className="performance-hero-command">
          {status && <div className="performance-hero-status">{status}</div>}
          {actions && <div className="performance-hero-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}
