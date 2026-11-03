import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** A dropdown that matches the rest of the UI, on any screen and in either theme. Keeps to the listbox keyboard rules. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
  className = '',
  small,
  disabled,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  testId?: string;
  className?: string;
  small?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const choose = (i: number) => {
    const option = options[i];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  };

  // Drawn on the page itself, as it would be cut off by a scrolling list or a dialog's edge.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) {
      setPlace(null);
      return;
    }
    const r = button.current.getBoundingClientRect();
    const { width, height } = list.current.getBoundingClientRect();
    const below = r.bottom + 4;
    setPlace({
      left: Math.max(6, Math.min(r.left, innerWidth - width - 6)),
      top: below + height > innerHeight - 6 ? Math.max(6, r.top - height - 4) : below,
      minWidth: r.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const onMove = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    // Keep this from the dialog around it, which also closes on Esc.
    e.stopPropagation();
    if (e.key === 'ArrowDown') setActive((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`btn ${small ? 'btn-sm' : ''} btn-secondary justify-between font-medium ${className}`}
        data-testid={testId}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown size={small ? 13 : 14} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className="panel pop fixed z-[75] flex max-h-72 flex-col overflow-y-auto p-1"
            style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                id={`${id}-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={o.value === value}
                data-active={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className="menu-row justify-between"
              >
                {o.label}
                <Check size={14} className={o.value === value ? 'text-link' : 'invisible'} aria-hidden />
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
