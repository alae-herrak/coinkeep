import { useEffect, useId, useRef } from 'react';
import { useUI } from '../../store/ui';
import { Button } from './Button';

/** Single app-wide confirm dialog, driven by `confirm()` from the UI store. */
export function ConfirmHost() {
  const request = useUI((s) => s.confirmRequest);
  const setRequest = useUI((s) => s.setConfirmRequest);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (request && !d.open) d.showModal();
    if (!request && d.open) d.close();
  }, [request]);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <dialog
      ref={ref}
      className="dialog-center"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={request?.message ? descId : undefined}
      onCancel={(e) => {
        if (!e.cancelable) return;
        e.preventDefault();
        answer(false);
      }}
      onClose={() => {
        // Closed by the browser (e.g. Android back) while a question was pending: that's a "no".
        if (request) answer(false);
      }}
    >
      {request && (
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {request.title}
          </h2>
          {request.message && (
            <p id={descId} className="mt-2 text-sm text-muted">
              {request.message}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            {/* Cancel first and focused by default: the safe choice is the easy one. */}
            <Button variant="secondary" block autoFocus onClick={() => answer(false)}>
              Cancel
            </Button>
            <Button variant={request.destructive ? 'danger' : 'primary'} block onClick={() => answer(true)}>
              {request.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
