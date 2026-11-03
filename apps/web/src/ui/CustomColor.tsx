import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function toFullHex(color: string | undefined): string | null {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (color && /^#[0-9a-f]{3}$/i.test(color)) {
    return `#${[...color.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  }
  return null;
}

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

function ColorPanel({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  value: string | undefined;
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(toFullHex(value) ?? '#035857'));
  const [draft, setDraft] = useState<string | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const below = a.bottom + 6;
    setPlace({
      left: Math.max(6, Math.min(a.left, innerWidth - box.width - 6)),
      top: below + box.height > innerHeight - 6 ? Math.max(6, a.top - box.height - 6) : below,
    });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  const fromPointer = (e: ReactPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    const next = {
      ...hsv,
      s: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      v: 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
    setHsv(next);
    setDraft(null);
    return next;
  };

  const applyDraft = () => {
    if (draft === null) return;
    const text = draft.trim();
    const full = toFullHex(text.startsWith('#') ? text : `#${text}`);
    setDraft(null);
    if (!full) return;
    setHsv(hexToHsv(full));
    onPick(full);
  };

  // Colors are applied when a drag ends, so that one drag is one undo step.
  return createPortal(
    <div
      ref={ref}
      className="panel pop fixed z-[75] flex w-56 flex-col gap-2.5 p-2.5"
      style={place ?? { left: 0, top: 0, visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      data-floating
      data-testid="color-panel"
    >
      <div
        ref={area}
        className="relative h-32 cursor-crosshair touch-none rounded-md"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onPointerUp={(e) => onPick(hsvToHex(fromPointer(e)))}
        data-testid="color-area"
      >
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={359}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        onChange={(e) => setHsv({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={() => onPick(hex)}
        onKeyUp={() => onPick(hex)}
        className="hue-slider"
      />
      <div className="flex items-center gap-2">
        <span className="swatch" style={{ background: hex }} />
        <input
          value={draft ?? hex}
          aria-label="Hex color"
          spellCheck={false}
          maxLength={7}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyDraft}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') applyDraft();
          }}
          className="field field-sm num flex-1 uppercase"
          data-testid="custom-color-hex"
        />
      </div>
    </div>,
    document.body,
  );
}

/** Rainbow swatch opening a color picker that looks the same on every system. */
export function CustomColor({
  value,
  onPick,
  label = 'Custom color',
  showValue,
}: {
  value: string | undefined;
  onPick: (color: string) => void;
  label?: string;
  /** Shows the color itself rather than the rainbow, for a control that always holds a color. */
  showValue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        data-tip={label}
        onClick={() => setOpen((o) => !o)}
        className={`swatch ${showValue ? 'h-5! w-5!' : ''}`}
        style={{
          background: showValue
            ? value
            : 'conic-gradient(#e03131, #f5d128, #2fbf71, #0c8599, #4262ff, #be4bdb, #e03131)',
        }}
        data-testid="custom-color"
      />
      {open && button.current && (
        <ColorPanel anchor={button.current} value={value} onPick={onPick} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** For dropdowns that close on a click outside: a color panel is drawn elsewhere on the page but still belongs to them. */
export const isFloatingPanel = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-floating]') !== null;
