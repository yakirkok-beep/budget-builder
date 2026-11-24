/**
 * Page header, the same on every screen (like the portal's .ez-page-head):
 * hand-written eyebrow, title, gold brush stroke, a line of text, actions on the other side.
 */
import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  /** A string, or an element (e.g. an editable title input). */
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function PageHead({ eyebrow, title, sub, actions }: Props) {
  return (
    <div className="page-head">
      <div className="text">
        <span className="eyebrow">{eyebrow}</span>
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        <span className="stroke" aria-hidden="true" />
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
