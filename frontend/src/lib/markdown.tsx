// ── Minimaler, sicherer Markdown-Renderer für Chat-Nachrichten.
//    Unterstützt **fett**, *kursiv*, `code` und Zeilenumbrüche.
//    Baut ausschließlich React-Textknoten (kein dangerouslySetInnerHTML)
//    → keine HTML-Injection möglich.
import { Fragment, type ReactNode } from 'react';

// Reihenfolge wichtig: ** vor * (greedy-sicher durch [^*]/[^`])
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function renderInline(text: string, base: string): ReactNode[] {
  return text.split(INLINE).map((p, i) => {
    const key = `${base}-${i}`;
    if (p.length >= 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.length >= 2 && p.startsWith('*') && p.endsWith('*')) return <em key={key}>{p.slice(1, -1)}</em>;
    if (p.length >= 2 && p.startsWith('`') && p.endsWith('`')) return <code key={key} className="chat-code">{p.slice(1, -1)}</code>;
    return p ? <Fragment key={key}>{p}</Fragment> : null;
  });
}

export function renderMarkdown(text: string): ReactNode {
  const lines = (text || '').split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {renderInline(line, String(i))}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
}
