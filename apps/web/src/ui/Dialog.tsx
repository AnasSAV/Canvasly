import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]';

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/** A modal: keeps keyboard focus inside while open, hands it back afterwards, and closes on Esc or a click outside. */
export function Dialog({
  label,
  title,
  subtitle,
  size = 'md',
  onClose,
  testId,
  bare,
  children,
}: {
  label: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof WIDTHS;
  onClose: () => void;
  testId?: string;
  /** The content handles its own padding and scrolling. */
  bare?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Read while rendering: by the time effects run, an autofocused field inside has already taken focus.
  const opener = useRef(document.activeElement as HTMLElement | null);
  const restoring = useRef(0);

  useEffect(() => {
    window.clearTimeout(restoring.current);
    const box = ref.current;
    const before = opener.current;
    if (box && !box.contains(document.activeElement)) box.focus();
    // On a timer, as effects also re-run without the dialog closing in React's strict mode.
    return () => {
      restoring.current = window.setTimeout(() => before?.focus?.());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      // Tab skips a radio group's unchecked options, so one of those can't count as the last stop.
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-3 pt-[8vh] sm:p-6 sm:pt-[9vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`panel anim-rise flex max-h-[84vh] w-full ${WIDTHS[size]} flex-col overflow-hidden shadow-pop outline-none`}
        data-testid={testId}
      >
        {title && (
          <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="tile -mt-1.5 -mr-2">
              <X size={17} />
            </button>
          </header>
        )}
        <div className={bare ? 'flex min-h-0 flex-1 flex-col' : 'overflow-y-auto p-5'}>{children}</div>
      </div>
    </div>
  );
}
