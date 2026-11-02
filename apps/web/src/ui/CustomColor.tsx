import { useEffect, useRef } from 'react';

/** `<input type="color">` only understands #rrggbb. */
function toInputValue(color: string | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (color && /^#[0-9a-f]{3}$/i.test(color)) {
    return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  }
  return '#000000';
}

/**
 * Rainbow swatch that opens the browser's color picker. It listens for the native `change` event, which fires
 * when the picker closes: React's onChange fires on every drag and would make each one its own undo step.
 */
export function CustomColor({
  value,
  onPick,
}: {
  value: string | undefined;
  onPick: (color: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => pick.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.value = toInputValue(value);
  }, [value]);
  return (
    <span
      title="Custom color"
      className="relative block h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/15"
      style={{
        background: 'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)',
      }}
    >
      <input
        ref={ref}
        type="color"
        defaultValue={toInputValue(value)}
        aria-label="Custom color"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        data-testid="custom-color"
      />
    </span>
  );
}
