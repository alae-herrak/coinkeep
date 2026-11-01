import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: ReactNode;
}

const LOCK_DISTANCE = 10;
const DELETE_FRACTION = 0.4;

/**
 * Swipe a row left to delete it. Vertical drags are left to the browser for
 * scrolling (touch-action: pan-y). The parent should offer Undo, and a
 * non-gesture way to delete for keyboard/screen-reader users.
 */
export function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; pointerId: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onPointerDown = (e: PointerEvent) => {
    if (removing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, axis: null };
    suppressClick.current = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.axis === null) {
      if (Math.abs(mx) > LOCK_DISTANCE && Math.abs(mx) > Math.abs(my)) {
        d.axis = 'x';
        setDragging(true);
        ref.current?.setPointerCapture(e.pointerId);
      } else if (Math.abs(my) > LOCK_DISTANCE) {
        d.axis = 'y';
      }
    }
    if (d.axis === 'x') setDx(Math.min(0, mx));
  };

  const finish = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    suppressClick.current = true;
    setDragging(false);
    const width = ref.current?.offsetWidth ?? 320;
    if (-dx > width * DELETE_FRACTION && e.type === 'pointerup') {
      setRemoving(true);
      setDx(-width);
      setTimeout(onDelete, 180);
    } else {
      setDx(0);
    }
  };

  const progress = Math.min(1, -dx / ((ref.current?.offsetWidth ?? 320) * DELETE_FRACTION));

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end bg-expense pr-6 text-white"
        style={{ opacity: dx === 0 ? 0 : 0.35 + progress * 0.65 }}
      >
        <Trash2 size={22} style={{ transform: `scale(${0.8 + progress * 0.3})` }} />
      </div>
      <div
        ref={ref}
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          // A swipe shouldn't also count as a tap on the row.
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
