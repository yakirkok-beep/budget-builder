/** The last focused value field, so the formula-help chips can insert a name into it. */

export type FxTarget = { insert(name: string): void };

let lastFx: FxTarget | null = null;

export function setLastFx(t: FxTarget): void {
  lastFx = t;
}

export function clearLastFx(t: FxTarget): void {
  if (lastFx === t) lastFx = null;
}

/** Insert a name into the last focused value field. Returns false if there is none. */
export function insertIntoLastFx(name: string): boolean {
  if (!lastFx) return false;
  lastFx.insert(name);
  return true;
}
