/**
 * Hash routing (#summary, #ev-<id>, #params ...). Works on GitHub Pages without server config.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { view: 'summary' }
  | { view: 'event'; evId: string }
  | { view: 'params' }
  | { view: 'salary' }
  | { view: 'priority' }
  | { view: 'data' };

const STATIC = ['summary', 'params', 'salary', 'priority', 'data'] as const;

export function parseHash(hash: string): Route {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('ev-') && h.length > 3) return { view: 'event', evId: h.slice(3) };
  const s = STATIC.find((x) => x === h);
  return s ? ({ view: s } as Route) : { view: 'summary' };
}

export const hrefOf = (r: Route): string => '#' + (r.view === 'event' ? 'ev-' + r.evId : r.view);

export const eventHref = (evId: string): string => hrefOf({ view: 'event', evId });

export function navigate(r: Route | string): void {
  const href = typeof r === 'string' ? r : hrefOf(r);
  if (location.hash !== href) {
    location.hash = href;
    window.scrollTo(0, 0);
  }
}

const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseHash(hash);
}
