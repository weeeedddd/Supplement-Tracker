// ── ErrorBoundary: Ein abstürzendes Modul darf nie mehr die ganze App
//    schwärzen. Bewusst OHNE t()/Theme-Abhängigkeit — die könnten selbst
//    die Absturzursache sein. Texte daher fest zweisprachig.
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; label: string; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[CORELINE] ErrorBoundary <${this.props.label}>:`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="eb-panel" role="alert">
          <span className="eb-sigil" aria-hidden="true">◇</span>
          <h2>MODULFEHLER / MODULE ERROR</h2>
          <p>Dieser Bereich konnte nicht geladen werden; deine lokalen Daten wurden nicht verändert.<br />
            <em>This section could not load; your local data was not changed.</em></p>
          <pre className="eb-msg">{String(this.state.error?.message ?? this.state.error)}</pre>
          <div className="eb-actions">
            <button onClick={() => this.setState({ error: null })}>Bereich erneut laden / Retry section</button>
            <button onClick={() => location.reload()}>App neu laden / Reload app</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
