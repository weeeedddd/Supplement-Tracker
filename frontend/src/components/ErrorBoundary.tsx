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
    console.error(`[SHADOW~1] ◈ ErrorBoundary <${this.props.label}>:`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="eb-panel" role="alert">
          <span className="eb-sigil">◈</span>
          <h2>RISS IN DER VOID</h2>
          <p>Ein Modul ist abgestürzt — der Rest der App läuft weiter.<br />
            <em>A module crashed — the rest of the app keeps running.</em></p>
          <pre className="eb-msg">{String(this.state.error?.message ?? this.state.error)}</pre>
          <div className="eb-actions">
            <button onClick={() => this.setState({ error: null })}>↻ Modul neu laden</button>
            <button onClick={() => location.reload()}>◈ App neu starten</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
