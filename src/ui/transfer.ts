/**
 * Copy / paste / move / duplicate from the UI: the clipboard, paste with a question when names
 * already exist, "move or copy to another event", and drag-and-drop with the Windows rule:
 * inside the same event a drag moves, onto another event it copies; Ctrl (or Alt) forces a copy,
 * Shift forces a move. Everything goes through the store, so it can be undone.
 */
import { createElement } from 'react';
import { create } from 'zustand';
import * as C from '../domain/clipboard';
import type { Clip, ConflictMode, PasteResult } from '../domain/clipboard';
import { accepts, budgetStore, type PasteTarget } from '../store';
import { choiceDialog, openDialog, toast } from './uiStore';
import { TransferDialog, type TransferWhat } from './views/TransferDialog';

const S = () => budgetStore.getState();
const B = () => {
  const b = S().budget;
  if (!b) throw new Error('no budget');
  return b;
};

/* ------------------------------ clipboard ------------------------------ */

/** The clipboard lives outside the budget: it survives switching budgets (copy from one, paste in another). */
export const useClip = create<{ clip: Clip | null }>(() => ({ clip: null }));

export function setClip(clip: Clip): void {
  useClip.setState({ clip });
  toast(`הועתק: ${C.describeClip(clip)}. אפשר להדביק במפעל אחר או בתקציב אחר.`);
}

export const clearClip = (): void => useClip.setState({ clip: null });

export const copyLines = (evId: string, ids: string[]): void => setClip(C.copyLines(B(), evId, ids));
export const copyIncome = (evId: string, ids: string[]): void => setClip(C.copyIncome(B(), evId, ids));
export const copyParams = (evId: string, ids: string[]): void => setClip(C.copyParams(B(), evId, ids));
export const copyCategory = (evId: string, catId: string): void => setClip(C.copyCategory(B(), evId, catId));
export const copyEvent = (evId: string): void => setClip(C.copyEvent(B(), evId));
export const copyPrices = (ids: string[]): void => setClip(C.copyPrices(B(), ids));
export const copySalary = (ids: string[]): void => setClip(C.copySalary(B(), ids));

function report(done: string, res: PasteResult): void {
  toast([done, ...res.notes, 'אפשר לבטל עם Ctrl+Z'].join('. '));
}

const CONFLICT_WHAT: Partial<Record<Clip['kind'], string>> = { params: 'פרמטרים', prices: 'פריטי מחירון', salary: 'שורות שכר' };

/** Paste the clipboard (or a given clip) into a target. Asks what to do with names that already exist. */
export async function pasteClip(target: PasteTarget, clip: Clip | null = useClip.getState().clip): Promise<PasteResult | null> {
  if (!clip) return null;
  if (!accepts(target, clip)) {
    toast('אי אפשר להדביק את זה כאן');
    return null;
  }
  let mode: ConflictMode = 'skip';
  const conflicts = C.pasteConflicts(B(), clip, target.kind === 'event' ? target.evId : undefined);
  if (conflicts.length) {
    const choice = await choiceDialog<ConflictMode>({
      title: 'שמות שכבר קיימים',
      message: `${CONFLICT_WHAT[clip.kind]} בשמות האלה כבר קיימים כאן: ${conflicts.join(', ')}. מה לעשות איתם?`,
      choices: [
        { value: 'skip', label: 'לדלג עליהם', primary: true },
        { value: 'overwrite', label: 'להחליף אותם', danger: true },
      ],
    });
    if (!choice) return null;
    mode = choice;
  }
  const res = S().paste(target, clip, mode);
  report('הודבק: ' + C.describeClip(clip), res);
  return res;
}

/** Open the "move or copy to another event" dialog. */
export function openTransfer(what: TransferWhat): void {
  openDialog(createElement(TransferDialog, { what, onGo: (to: string, copy: boolean, cat?: string) => void transfer(what, to, copy, cat) }));
}

/** Carry out the dialog's choice. */
export async function transfer(what: TransferWhat, toEvId: string, copy: boolean, cat?: string): Promise<void> {
  const s = S();
  const names = (): string => B().events.find((e) => e.id === toEvId)?.name ?? '';
  if (copy) {
    const clip =
      what.kind === 'lines'
        ? C.copyLines(B(), what.evId, what.ids)
        : what.kind === 'income'
          ? C.copyIncome(B(), what.evId, what.ids)
          : what.kind === 'params'
            ? C.copyParams(B(), what.evId, what.ids)
            : C.copyCategory(B(), what.evId, what.catId);
    await pasteClip({ kind: 'event', evId: toEvId, cat: what.kind === 'lines' ? cat : undefined }, clip);
    return;
  }
  const res =
    what.kind === 'lines'
      ? s.transferLines(what.evId, what.ids, toEvId, { cat })
      : what.kind === 'income'
        ? s.transferIncome(what.evId, what.ids, toEvId)
        : what.kind === 'category'
          ? s.transferCategory(what.evId, what.catId, toEvId)
          : null;
  if (res) report('הועבר אל ' + names(), res);
}

/* ------------------------------ drag and drop ------------------------------ */

export type DragPayload =
  | { kind: 'lines'; evId: string; ids: string[] }
  | { kind: 'income'; evId: string; ids: string[] }
  | { kind: 'params'; evId: string; ids: string[] }
  | { kind: 'category'; evId: string; catId: string }
  | { kind: 'event'; evId: string }
  | { kind: 'price'; id: string }
  | { kind: 'salary'; id: string };

export type DropTarget =
  | { kind: 'line'; evId: string; lineId: string; cat: string }
  | { kind: 'group'; evId: string; cat: string }
  | { kind: 'catRow'; evId: string; catId: string; cat: string; blat: boolean }
  | { kind: 'param'; evId: string; id: string }
  | { kind: 'income'; evId: string; id: string }
  | { kind: 'event'; evId: string }
  | { kind: 'price'; id: string }
  | { kind: 'salary'; id: string };

let dragging: DragPayload | null = null;

export function startDrag(e: React.DragEvent, payload: DragPayload, image?: Element | null): void {
  dragging = payload;
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/plain', 'budget-item'); // Firefox needs data to start a drag
  if (image) e.dataTransfer.setDragImage(image, 24, 12);
  document.body.classList.add('is-dragging');
}

/** What is being dragged right now (to choose the drop marker). */
export const dragKind = (): DragPayload['kind'] | null => dragging?.kind ?? null;

export function endDrag(): void {
  dragging = null;
  document.body.classList.remove('is-dragging');
}

const evOf = (p: DragPayload): string | null => ('evId' in p ? p.evId : null);

/** Can this payload be dropped on this target? */
export function canDrop(t: DropTarget, p: DragPayload | null = dragging): boolean {
  if (!p) return false;
  switch (t.kind) {
    case 'line':
    case 'group':
      return p.kind === 'lines' && p.evId === t.evId && !(t.kind === 'line' && p.ids.includes(t.lineId));
    case 'catRow':
      return (p.kind === 'lines' && p.evId === t.evId && !t.blat) || (p.kind === 'category' && p.evId === t.evId && p.catId !== t.catId);
    case 'param':
      return p.kind === 'params' && !p.ids.includes(t.id);
    case 'income':
      return p.kind === 'income' && !p.ids.includes(t.id);
    case 'event':
      if (p.kind === 'event') return p.evId !== t.evId;
      return ['lines', 'income', 'params', 'category'].includes(p.kind) && evOf(p) !== t.evId;
    case 'price':
      return p.kind === 'price' && p.id !== t.id;
    case 'salary':
      return p.kind === 'salary' && p.id !== t.id;
  }
}

/** Windows rule: same place moves, another event copies; Ctrl/Alt copy, Shift move. */
export function isCopy(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean }, t: DropTarget, p: DragPayload | null = dragging): boolean {
  if (!p) return false;
  if (e.ctrlKey || e.altKey) return true;
  if (e.shiftKey) return false;
  const otherEvent = t.kind === 'event' && p.kind !== 'event';
  return otherEvent || p.kind === 'params'; // params going to another event are always copied
}

/** Do the drop. */
export async function drop(t: DropTarget, e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): Promise<void> {
  const p = dragging;
  endDrag();
  if (!p || !canDrop(t, p)) return;
  const copy = isCopy(e, t, p);
  const s = S();
  switch (t.kind) {
    case 'line':
    case 'group':
    case 'catRow': {
      if (p.kind === 'lines') {
        const opts = t.kind === 'line' ? { cat: t.cat, beforeId: t.lineId } : { cat: t.cat };
        if (copy) await pasteClip({ kind: 'event', evId: t.evId, ...opts }, C.copyLines(B(), p.evId, p.ids));
        else s.moveLines(p.evId, p.ids, opts);
      } else if (p.kind === 'category' && t.kind === 'catRow') {
        if (copy) s.duplicateCategory(p.evId, p.catId);
        else s.reorder('cats', t.evId, p.catId, t.catId);
      }
      return;
    }
    case 'param':
      if (p.kind !== 'params') return;
      if (p.evId === t.evId && !copy) p.ids.forEach((id) => s.reorder('params', t.evId, id, t.id));
      else await pasteClip({ kind: 'event', evId: t.evId }, C.copyParams(B(), p.evId, p.ids));
      return;
    case 'income':
      if (p.kind !== 'income') return;
      if (p.evId === t.evId && !copy) p.ids.forEach((id) => s.reorder('income', t.evId, id, t.id));
      else await pasteClip({ kind: 'event', evId: t.evId, beforeId: t.id }, C.copyIncome(B(), p.evId, p.ids));
      return;
    case 'event':
      if (p.kind === 'event') {
        if (copy) {
          const id = s.duplicateEvent(p.evId);
          s.reorderBudget('events', id, t.evId);
          toast('נוצר עותק של המפעל');
        } else s.reorderBudget('events', p.evId, t.evId);
        return;
      }
      if (copy || p.kind === 'params') {
        const clip =
          p.kind === 'lines'
            ? C.copyLines(B(), p.evId, p.ids)
            : p.kind === 'income'
              ? C.copyIncome(B(), p.evId, p.ids)
              : p.kind === 'params'
                ? C.copyParams(B(), p.evId, p.ids)
                : p.kind === 'category'
                  ? C.copyCategory(B(), p.evId, p.catId)
                  : null;
        if (clip) await pasteClip({ kind: 'event', evId: t.evId }, clip);
      } else if (p.kind === 'lines' || p.kind === 'income' || p.kind === 'category') {
        await transfer(p.kind === 'category' ? { kind: 'category', evId: p.evId, catId: p.catId } : { kind: p.kind, evId: p.evId, ids: p.ids }, t.evId, false);
      }
      return;
    case 'price':
      if (p.kind === 'price') {
        if (copy) s.duplicatePrice(p.id);
        else s.reorderBudget('prices', p.id, t.id);
      }
      return;
    case 'salary':
      if (p.kind === 'salary') {
        if (copy) s.duplicateSalaryRow(p.id);
        else s.reorderBudget('salary', p.id, t.id);
      }
      return;
  }
}
