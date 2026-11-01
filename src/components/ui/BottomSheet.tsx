import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Hide the visible title (it is still announced to screen readers). */
  hideTitle?: boolean;
  /** Extra controls placed in the header, left of the close button. */
  headerExtra?: ReactNode;
  /** Non-scrolling area between the header and the body. */
  subheader?: ReactNode;
  /** Sticky area under the scrolling body, e.g. a Save button. */
  footer?: ReactNode;
  children: ReactNode;
  /** Classes for the scrolling body. */
  bodyClassName?: string;
  /**
   * false = the body doesn't scroll; children lay themselves out as a flex
   * column and decide which part shrinks (used by quick-add to pin the keypad).
   */
  scrollBody?: boolean;
  /** No header row at all (the title stays for screen readers); the content must provide its own close button. */
  bare?: boolean;
}

const EXIT_MS = 350;

/**
 * Slide-up sheet built on a native modal <dialog>: focus is trapped, Esc and a
 * tap on the backdrop close it. Content stays mounted until the exit
 * animation has finished.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  hideTitle,
  headerExtra,
  subheader,
  footer,
  children,
  bodyClassName = '',
  scrollBody = true,
  bare = false,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setMounted(true);
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Without a recent tap, Android back (CloseWatcher) can't be cancelled: let onClose below handle it.
        if (!e.cancelable) return;
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser closed it on its own (e.g. Android back): sync the state.
        if (open) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {mounted && (
        <div className="pb-safe flex max-h-[inherit] flex-col">
          {!bare && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />}
          {bare ? (
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
          ) : (
            <header className="flex shrink-0 items-center gap-2 px-4 pt-1">
              <h2 id={titleId} className={hideTitle ? 'sr-only' : 'min-w-0 flex-1 truncate text-lg font-semibold'}>
                {title}
              </h2>
              {headerExtra}
              <IconButton label="Close" onClick={onClose}>
                <X size={20} />
              </IconButton>
            </header>
          )}
          {subheader && <div className="shrink-0 px-4">{subheader}</div>}
          <div
            className={`min-h-0 flex-1 px-4 pb-4 ${scrollBody ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden'} ${bodyClassName}`}
          >
            {children}
          </div>
          {footer && <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
