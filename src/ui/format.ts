/** Number formatting, as in the prototype. */

const nf0 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });

const bad = (v: number | null | undefined): v is null | undefined => v == null || isNaN(v);

/** Amounts: whole shekels (tiny non-zero values keep 2 decimals). */
export const fmt = (v: number | null | undefined): string =>
  bad(v) ? '' : Math.abs(v) < 0.5 && v !== 0 ? nf2.format(v) : nf0.format(Math.round(v));

/** Small values (params, unit prices): up to 2 decimals below 100. */
export const fmtS = (v: number | null | undefined): string =>
  bad(v) ? '' : Math.abs(v) < 100 && v % 1 !== 0 ? nf2.format(v) : nf0.format(Math.round(v));

export const fmtPct = (v: number | null | undefined): string => (bad(v) ? '' : nf2.format(v * 100) + '%');

const nfSigned = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0, signDisplay: 'exceptZero' });

/** "+1,234" for increases. Intl adds the direction mark, so the sign stays on the left in RTL. */
export const fmtSigned = (v: number): string => (bad(v) ? '' : nfSigned.format(Math.round(v)));

/** More spending/deficit is red, less is green. */
export const changeClass = (v: number): string => (v > 0.5 ? 'neg' : v < -0.5 ? 'pos' : '');

export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
