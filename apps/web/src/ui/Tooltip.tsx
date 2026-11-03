import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY = 380;
/** Moving from one tooltip straight to the next shouldn't make you wait again. */
const REPEAT_WINDOW = 500;
const GAP = 7;

type Side = 'right' | 'bottom' | 'top' | 'left';

interface Tip {
  text: string;
  keys: string | null;
  rect: DOMRect;
  side: Side;
}

/** "Select (V)" comes apart into a name and a key; "Open (in a new tab)" doesn't. */
export function splitLabel(label: string): { text: string; keys: string | null } {
  const open = label.lastIndexOf(' (');
  if (open < 0 || !label.endsWith(')')) return { text: label, keys: null };
  const keys = label.slice(open + 2, -1);
  return /^(Ctrl|⌘|Shift|Alt|[A-Z0-9?]\b)/.test(keys)
    ? { text: label.slice(0, open), keys }
    : { text: label, keys: null };
}

function readTip(el: HTMLElement): Tip | null {
  const label = el.dataset.tip;
  if (!label) return null;
  const side = el.closest<HTMLElement>('[data-tip-side]')?.dataset.tipSide as Side | undefined;
  return { ...splitLabel(label), rect: el.getBoundingClientRect(), side: side ?? 'bottom' };
}

/** One tooltip for the whole app, for anything with a `data-tip`. Follows the mouse and keyboard focus. */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let timer = 0;
    let hiddenAt = 0;
    let current: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      if (current) hiddenAt = performance.now();
      current = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      if (el === current) return;
      window.clearTimeout(timer);
      current = el;
      const quick = performance.now() - hiddenAt < REPEAT_WINDOW;
      timer = window.setTimeout(() => el.isConnected && setTip(readTip(el)), quick ? 0 : SHOW_DELAY);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (e.buttons) {
        hide(); // mid-drag
        return;
      }
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]');
      if (el) show(el);
      else if (current) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.dataset?.tip && el.matches(':focus-visible')) show(el);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('pointerover', onOver, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('focusin', onFocus);
    window.addEventListener('focusout', hide);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerover', onOver, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('focusout', hide);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', hide, { capture: true });
      window.removeEventListener('blur', hide);
    };
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!tip || !el) {
      setPlace(null);
      return;
    }
    const { width: w, height: h } = el.getBoundingClientRect();
    const { rect, side } = tip;
    const cx = rect.left + rect.width / 2 - w / 2;
    const cy = rect.top + rect.height / 2 - h / 2;
    const spots: Record<Side, { left: number; top: number }> = {
      right: { left: rect.right + GAP, top: cy },
      left: { left: rect.left - w - GAP, top: cy },
      bottom: { left: cx, top: rect.bottom + GAP },
      top: { left: cx, top: rect.top - h - GAP },
    };
    const opposite: Record<Side, Side> = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
    const fits = ({ left, top }: { left: number; top: number }) =>
      left >= 4 && top >= 4 && left + w <= innerWidth - 4 && top + h <= innerHeight - 4;
    const spot = fits(spots[side]) ? spots[side] : spots[opposite[side]];
    setPlace({
      left: Math.max(6, Math.min(spot.left, innerWidth - w - 6)),
      top: Math.max(6, Math.min(spot.top, innerHeight - h - 6)),
    });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className="ink pointer-events-none fixed z-[90] flex max-w-64 items-center gap-2 rounded-md bg-surface px-2 py-1 text-xs leading-snug font-medium shadow-pop"
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
    >
      <span>{tip.text}</span>
      {tip.keys && <span className="num text-[11px] whitespace-nowrap text-muted">{tip.keys}</span>}
    </div>,
    document.body,
  );
}
