/**
 * Formula autocomplete logic (CLAUDE.md section 8.3, "שדרוג רצוי"). Pure functions, unit tested.
 */
import { createContext } from 'react';

export type SuggestionKind = 'param' | 'global' | 'price' | 'fn';

export interface Suggestion {
  name: string;
  kind: SuggestionKind;
  /** Short hint shown next to the name (current value, price label, what a function does). */
  hint?: string;
}

/** Names a formula field may use. null = this field has no autocomplete (e.g. global params). */
export const FormulaNamesContext = createContext<Suggestion[] | null>(null);

export const FUNCTION_HINTS: Record<string, string> = {
  'למעלה': 'עיגול כלפי מעלה',
  'למטה': 'עיגול כלפי מטה',
  'עגל': 'עיגול',
  'מקס': 'הגדול מבין הערכים',
  'מינ': 'הקטן מבין הערכים',
  'שכר': 'שכר מנחה מטבלת השכר',
  ROUNDUP: 'עיגול כלפי מעלה',
  ROUND: 'עיגול',
  MAX: 'הגדול מבין הערכים',
  MIN: 'הקטן מבין הערכים',
};

/** The name being typed just before the caret, or null (not a formula, inside "quotes", no name). */
export function fragmentAt(text: string, caret: number): { start: number; frag: string } | null {
  if (!text.trimStart().startsWith('=')) return null;
  const before = text.slice(0, caret);
  if ((before.match(/"/g)?.length ?? 0) % 2 === 1) return null;
  const m = /[\p{L}_][\p{L}\p{N}_]*$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[0].length, frag: m[0] };
}

/** Names that start with the fragment first, then names that contain it. The exact name itself is left out. */
export function suggest(all: Suggestion[], frag: string, max = 8): Suggestion[] {
  const f = frag.toLowerCase();
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const add = (s: Suggestion): void => {
    if (seen.has(s.name) || s.name === frag) return;
    seen.add(s.name);
    out.push(s);
  };
  all.filter((s) => s.name.toLowerCase().startsWith(f)).forEach(add);
  all.filter((s) => s.name.toLowerCase().includes(f)).forEach(add);
  return out.slice(0, max);
}

/** Replace the whole name around the caret with the suggestion. Functions get "(" (and שכר gets '("'). */
export function applySuggestion(text: string, start: number, caret: number, s: Suggestion): { text: string; caret: number } {
  const insert = s.kind === 'fn' ? s.name + (s.name === 'שכר' ? '("' : '(') : s.name;
  const after = text.slice(caret);
  const rest = /^[\p{L}\p{N}_]*/u.exec(after)?.[0] ?? '';
  return { text: text.slice(0, start) + insert + after.slice(rest.length), caret: start + insert.length };
}
