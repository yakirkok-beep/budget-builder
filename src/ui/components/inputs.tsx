/**
 * Editable cells.
 * - FxInput: number or formula, light yellow like an Excel input cell, result below a formula ("= 1,234"),
 *   and name autocomplete inside formulas when a FormulaNamesContext is provided.
 * - TextInput: plain text, saved on every keystroke.
 * - KeyInput: names used in formulas and category names; applied on Enter/blur (rename updates formulas).
 * All keep their own text while focused, so typing is never interrupted by a recompute.
 */
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { FieldResult, Period, Val } from '../../domain/types';
import type { RenameResult } from '../../domain/rename';
import { fmtS } from '../format';
import { toast } from '../uiStore';
import { clearLastFx, setLastFx, type FxTarget } from './fxFocus';
import { applySuggestion, FormulaNamesContext, fragmentAt, suggest, type Suggestion } from '../autocomplete';

const valText = (v: Val | null | undefined): string => (v == null ? '' : String(v));

function useSyncedText(value: string): [string, (t: string) => void, React.MutableRefObject<boolean>] {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  // layout effect: re-sync before an undo/redo puts the focus back (see ui/undo.ts)
  useLayoutEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return [text, setText, focused];
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>): void => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

interface FxProps {
  value: Val;
  onChange(text: string): void;
  result?: FieldResult;
  label: string;
  className?: string;
  placeholder?: string;
  testId?: string;
  /** Don't show "= result" under the field (when the table has its own result column). */
  hideResult?: boolean;
}

export function FxInput({ value, onChange, result, label, className = '', placeholder, testId, hideResult }: FxProps) {
  const [text, setText, focused] = useSyncedText(valText(value));
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const outId = useId();
  const listId = useId();
  const names = useContext(FormulaNamesContext);
  type Ac = { items: Suggestion[]; index: number; start: number; caret: number; rect: DOMRect };
  const [ac, setAc] = useState<Ac | null>(null);

  const updateAc = (el: HTMLInputElement): void => {
    if (!names) return;
    const caret = el.selectionStart ?? el.value.length;
    const f = fragmentAt(el.value, caret);
    const items = f ? suggest(names, f.frag) : [];
    setAc(f && items.length ? { items, index: 0, start: f.start, caret, rect: el.getBoundingClientRect() } : null);
  };

  const accept = (s: Suggestion): void => {
    const el = ref.current;
    if (!el || !ac) return;
    const r = applySuggestion(el.value, ac.start, ac.caret, s);
    setText(r.text);
    onChangeRef.current(r.text);
    setAc(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  // the list is fixed-positioned: follow the field when the page or a table scrolls, or the layout shifts
  const acOpen = ac !== null;
  useEffect(() => {
    if (!acOpen) return;
    const follow = (): void => {
      const el = ref.current;
      if (el) setAc((a) => (a ? { ...a, rect: el.getBoundingClientRect() } : a));
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [acOpen]);

  const target = useRef<FxTarget>({
    insert(name) {
      const el = ref.current;
      if (!el) return;
      let v = el.value;
      let caret: number;
      if (!v.trim().startsWith('=')) {
        v = '=' + name;
        caret = v.length;
      } else {
        const s = el.selectionStart ?? v.length;
        const e = el.selectionEnd ?? v.length;
        v = v.slice(0, s) + name + v.slice(e);
        caret = s + name.length;
      }
      setText(v);
      onChangeRef.current(v);
      el.focus();
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    },
  });
  useEffect(() => {
    const mine = target.current;
    return () => {
      clearLastFx(mine);
    };
  }, []);

  const err = result?.err;
  const isFormula = text.trim().startsWith('=');
  const out = hideResult ? '' : err ? '⚠ ' + err : isFormula && result?.v != null ? '= ' + fmtS(result.v) : '';

  return (
    <>
      <input
        ref={ref}
        className={`cell val fx num ${err ? 'bad' : ''} ${className}`}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={err ? true : undefined}
        aria-describedby={out ? outId : undefined}
        title={text}
        data-testid={testId}
        dir="auto"
        role={names ? 'combobox' : undefined}
        aria-autocomplete={names ? 'list' : undefined}
        aria-expanded={names ? ac !== null : undefined}
        aria-controls={ac ? listId : undefined}
        aria-activedescendant={ac ? `${listId}-${ac.index}` : undefined}
        onFocus={() => {
          focused.current = true;
          setLastFx(target.current);
        }}
        onBlur={() => {
          focused.current = false;
          setAc(null);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
          updateAc(e.target);
        }}
        onKeyDown={(e) => {
          if (ac) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const d = e.key === 'ArrowDown' ? 1 : -1;
              setAc({ ...ac, index: (ac.index + d + ac.items.length) % ac.items.length });
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              accept(ac.items[ac.index]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setAc(null);
              return;
            }
          }
          blurOnEnter(e);
        }}
      />
      <span id={outId} className={`out ${err ? 'err' : ''}`}>
        {out}
      </span>
      {ac &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            aria-label="שמות זמינים"
            className="ac-list"
            style={{ top: ac.rect.bottom + 2, right: window.innerWidth - ac.rect.right, minWidth: Math.max(ac.rect.width, 180) }}
          >
            {ac.items.map((s, i) => (
              <li
                key={s.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === ac.index}
                // keep focus in the field
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
              >
                <span className="ac-name">{s.name}</span>
                {s.hint && <span className="ac-hint">{s.hint}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

interface TextProps {
  value: string;
  onChange(text: string): void;
  label: string;
  className?: string;
  placeholder?: string;
  testId?: string;
  autoFocus?: boolean;
  id?: string;
}

export function TextInput({ value, onChange, label, className = 'cell', placeholder, testId, autoFocus, id }: TextProps) {
  const [text, setText, focused] = useSyncedText(value);
  return (
    <input
      id={id}
      className={className}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      title={text}
      data-testid={testId}
      autoFocus={autoFocus}
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={blurOnEnter}
    />
  );
}

interface KeyProps {
  value: string;
  /** Apply the new name. On failure the field goes back to the old name and the error is shown. */
  onCommit(text: string): RenameResult;
  label: string;
  className?: string;
  testId?: string;
  autoFocus?: boolean;
}

export function KeyInput({ value, onCommit, label, className = 'cell', testId, autoFocus }: KeyProps) {
  const [text, setText, focused] = useSyncedText(value);
  const commit = (): void => {
    if (text === value) return;
    const res = onCommit(text);
    if (res.ok) setText(res.key);
    else {
      toast(res.error);
      setText(value);
    }
  };
  return (
    <input
      className={className}
      value={text}
      aria-label={label}
      title={text}
      data-testid={testId}
      autoFocus={autoFocus}
      onFocus={(e) => {
        focused.current = true;
        if (autoFocus) e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value);
          requestAnimationFrame(() => e.currentTarget?.blur());
        }
      }}
    />
  );
}

const PERIOD_OPTIONS: Period[] = ['', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'שנתי'];

export function PeriodSelect({ value, onChange }: { value: Period; onChange(p: string): void }) {
  return (
    <select className="cell" value={String(value ?? '')} aria-label="תקופה" onChange={(e) => onChange(e.target.value)}>
      {PERIOD_OPTIONS.map((o) => (
        <option key={String(o)} value={String(o)}>
          {o === '' ? '-' : o}
        </option>
      ))}
    </select>
  );
}
