/**
 * The "⋯" menu on every row: duplicate, copy, move to another event, delete...
 * Opens in a layer above the page (tables scroll, so it can't live inside them).
 * Keyboard: arrows move, Enter chooses, Escape closes and returns focus.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  onSelect(): void;
  danger?: boolean;
  hidden?: boolean;
}

const MENU_WIDTH = 220;

export function RowMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);
  const open = at !== null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setAt(null);
    };
    // On scroll or resize the menu follows its button (a scroll can arrive just after the tap that
    // opened it, e.g. a table scrolled sideways on a phone), and closes once the button is off screen.
    const follow = (e: Event): void => {
      if (e.target instanceof Node && menu.current?.contains(e.target)) return;
      const r = btn.current?.getBoundingClientRect();
      setAt(r && r.bottom > 0 && r.top < window.innerHeight ? r : null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open]);

  const close = (focus = true): void => {
    setAt(null);
    if (focus) btn.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      buttons[(i + d + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="iconbtn menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={() => setAt(at ? null : btn.current!.getBoundingClientRect())}
      >
        ⋯
      </button>
      {at &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            className="row-menu"
            style={{ top: Math.min(at.bottom + 4, window.innerHeight - 40 * visible.length - 16), left: Math.max(8, Math.min(at.left, window.innerWidth - MENU_WIDTH - 8)), width: MENU_WIDTH }}
            onKeyDown={onKey}
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : ''}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
