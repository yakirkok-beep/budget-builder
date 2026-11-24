/**
 * Data model (CLAUDE.md section 5) and computed-result types (section 7).
 * The shape of Budget is exactly the shape of data/seed-2027.json.
 */

/** A number, an empty string, or a formula that starts with "=". */
export type Val = number | string;

/** 1..12 = month, "שנתי" = spread evenly over 12, "" = not set. */
export type Period = number | 'שנתי' | '';

export const LEVELS = ['מתחיל', 'בכיר', 'ותיק', 'רביעי'] as const;
export type Level = (typeof LEVELS)[number];

export const CURRENT_SCHEMA = 1 as const;

export interface Budget {
  schema: typeof CURRENT_SCHEMA;
  name: string;
  year: number;
  /** התייקרות, מעמ, מעביד, בלתם, דולר, שכר_מינימום, רמת_שכר */
  globals: Record<string, Val>;
  globalNotes: Record<string, string>;
  prices: Price[];
  salary: SalaryRow[];
  events: BudgetEvent[];
  nextId: number;
}

export interface Price {
  id: string;
  key: string;
  label: string;
  value: Val;
  unit: string;
}

export interface SalaryRow {
  id: string;
  name: string;
  hours: Val;
  levels: Record<Level, Val>;
  note: string;
}

export interface Param {
  id: string;
  key: string;
  value: Val;
  note: string;
}

export interface IncomeLine {
  id: string;
  label: string;
  qty: Val;
  price: Val;
  note: string;
}

export interface ExpenseLine {
  id: string;
  /** Category is linked by name: line.cat === cat.name */
  cat: string;
  item: string;
  qty: Val;
  days: Val;
  price: Val;
  note: string;
}

export interface Category {
  id: string;
  name: string;
  /** Priority code, e.g. 8.83.910-1 */
  code: string;
  period: Period;
  /** true = computed contingency (בלת"ם) category; lines are never assigned to it */
  blat: boolean;
  /** 2026 plan, for comparison only */
  plan: number | null;
  /** 2026 corrected actual (to 24.11.2026), for comparison only */
  act: number | null;
}

export interface BudgetEvent {
  id: string;
  name: string;
  active: boolean;
  sub: string;
  params: Param[];
  income: IncomeLine[];
  lines: ExpenseLine[];
  cats: Category[];
  /** Which param counts as "participants" for per-head cost */
  partKey: string | null;
  /** Income code in Priority */
  incCode: string | null;
  incPlan?: number | null;
  incAct?: number | null;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Computed results                                                    */
/* ------------------------------------------------------------------ */

/** A single evaluated field: either a value (null = empty) or a Hebrew error. */
export type FieldResult = { v: number | null; err?: undefined } | { v?: undefined; err: string };

export interface LineResult {
  q: FieldResult;
  d: FieldResult;
  p: FieldResult;
  /** Line total. 0 when there is an error or qty/price are empty. */
  t: number;
  err: string | null;
}

export interface IncomeResult {
  q: FieldResult;
  p: FieldResult;
  t: number;
  err: string | null;
}

export type IssueKind =
  | 'param-error'
  | 'line-error'
  | 'income-error'
  | 'uncategorized'
  | 'no-code'
  | 'no-period'
  | 'no-income-code';

export interface Issue {
  ev: string;
  name: string;
  kind: IssueKind;
  msg: string;
}

export interface EventResult {
  params: Record<string, FieldResult>;
  lines: Record<string, LineResult>;
  income: Record<string, IncomeResult>;
  /** Amount per category id (blat categories included). */
  cats: Record<string, number>;
  issues: Issue[];
  /** Total expenses: all categories (incl. blat) + uncategorized */
  exp: number;
  inc: number;
  def: number;
  /** Value of the partKey param, or null */
  part: number | null;
  /** Expenses per participant (exp / part), null when there are no participants */
  perHead: number | null;
  /** Subsidy per participant (def / part) */
  subsidyPerHead: number | null;
  unassigned: number;
  /** Contingency percent actually used (event's אחוז_בלתם or globals.בלתם) */
  pct: number;
  plan26: number;
  act26: number;
  incPlan26: number;
  incAct26: number;
}

export interface Totals {
  exp: number;
  inc: number;
  def: number;
  plan26: number;
  act26: number;
  incPlan26: number;
  incAct26: number;
}

export interface PriorityRow {
  code: string;
  label: string;
  /** P = expense, S = income */
  type: 'P' | 'S';
  amt: number;
  period: Period;
  ev: string;
  /** Amount per period 1..12 (index 0 = period 1) */
  m: number[];
  /** Amount with no period */
  none: number;
}

export interface PrioritySummary {
  m: number[];
  none: number;
  total: number;
}

export interface PriorityTable {
  rows: PriorityRow[];
  expenses: PrioritySummary;
  income: PrioritySummary;
}

export interface BudgetResult {
  ev: Record<string, EventResult>;
  tot: Totals;
  /** Issues of active events only */
  issues: Issue[];
  priority: PriorityTable;
  /** Numeric globals (רמת_שכר excluded). A global with an error counts as 0. */
  globals: Record<string, number>;
  globalErrors: Record<string, string>;
  /** Price value by key. A price with an error counts as 0. */
  prices: Record<string, number>;
  priceErrors: Record<string, string>;
}
