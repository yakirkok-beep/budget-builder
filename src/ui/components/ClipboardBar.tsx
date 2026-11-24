/** Shows what is on the clipboard, with "paste here" when the current screen can take it. */
import { describeClip, type Clip } from '../../domain/clipboard';
import { accepts, type PasteTarget } from '../../store';
import { eventHref, navigate, type Route } from '../router';
import { clearClip, pasteClip, useClip } from '../transfer';

function targetFor(route: Route, clip: Clip): PasteTarget {
  if (route.view === 'event' && !['event', 'prices', 'salary'].includes(clip.kind)) return { kind: 'event', evId: route.evId };
  return { kind: 'budget' };
}

const WHERE: Record<string, string> = {
  event: 'הדבקת המפעל לתקציב הזה',
  prices: 'הדבקה למחירון',
  salary: 'הדבקה לטבלת השכר',
};

export function ClipboardBar({ route }: { route: Route }) {
  const clip = useClip((s) => s.clip);
  if (!clip) return null;
  const target = targetFor(route, clip);
  // prices and salary rows are pasted on their own screens
  const fits =
    accepts(target, clip) &&
    !(clip.kind === 'prices' && route.view !== 'params') &&
    !(clip.kind === 'salary' && route.view !== 'salary');
  return (
    <div className="clipbar" role="region" aria-label="לוח העתקה" data-testid="clipbar">
      <span className="clip-what">
        <span className="clip-label">בלוח:</span> {describeClip(clip)}
      </span>
      {fits && (
        <button
          className="btn small primary"
          data-testid="clip-paste"
          onClick={async () => {
            const res = await pasteClip(target);
            if (clip.kind === 'event' && res?.ids[0]) navigate(eventHref(res.ids[0]));
          }}
        >
          {WHERE[clip.kind] ?? 'הדבקה כאן'}
        </button>
      )}
      <button className="btn small ghost" onClick={clearClip}>
        ניקוי
      </button>
    </div>
  );
}
