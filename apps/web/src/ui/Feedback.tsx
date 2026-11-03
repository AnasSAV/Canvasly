import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { dismissToast, useFeedback, type ToastKind } from '../state/feedback';
import { Dialog } from './Dialog';

const TOAST_ICON: Record<ToastKind, { Icon: typeof Info; color: string }> = {
  info: { Icon: Info, color: 'text-link' },
  error: { Icon: CircleAlert, color: 'text-danger' },
  success: { Icon: CircleCheck, color: 'text-success' },
};

function ConfirmDialog() {
  const request = useFeedback((s) => s.confirm);
  if (!request) return null;
  const finish = (ok: boolean) => {
    useFeedback.setState({ confirm: null });
    request.resolve(ok);
  };
  return (
    <Dialog label={request.title} size="sm" onClose={() => finish(false)} testId="confirm-dialog">
      <h2 className="text-base font-semibold">{request.title}</h2>
      {request.body && <p className="mt-1.5 text-sm text-muted">{request.body}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          className="btn btn-secondary"
          onClick={() => finish(false)}
          data-testid="confirm-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => finish(true)}
          data-testid="confirm-accept"
        >
          {request.confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/** Toasts and confirmations, which replace the browser's own alert() and confirm() boxes. */
export function Feedback() {
  const toasts = useFeedback((s) => s.toasts);
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-3 sm:bottom-4"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const { Icon, color } = TOAST_ICON[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="panel anim-rise pointer-events-auto flex w-full max-w-md items-start gap-2.5 py-2.5 pr-1.5 pl-3 shadow-pop"
              data-testid="toast"
            >
              <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} aria-hidden />
              <p className="min-w-0 flex-1 py-px text-[13px] leading-snug">{t.text}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismissToast(t.id)}
                className="-my-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <ConfirmDialog />
    </>
  );
}
