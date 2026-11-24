/** A grip to drag a row. The whole row is shown as the drag image. */
import { endDrag, startDrag, type DragPayload } from '../transfer';

export function DragHandle({ payload, label }: { payload: DragPayload; label: string }) {
  return (
    <span
      className="handle"
      draggable
      role="img"
      aria-label={label}
      title="גרירה: באותו מפעל מזיזה, למפעל אחר בתפריט הצד מעתיקה. Ctrl מעתיק, Shift מזיז."
      onDragStart={(e) => startDrag(e, payload, e.currentTarget.closest('tr') ?? e.currentTarget.closest('a'))}
      onDragEnd={endDrag}
    >
      ⠿
    </span>
  );
}
