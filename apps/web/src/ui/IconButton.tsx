import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

export function IconButton({ label, active, children, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-35 ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export const panel = 'rounded-xl border border-gray-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]';

export function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={color}
      aria-label={`Color ${color}`}
      onClick={onClick}
      className={`h-6 w-6 shrink-0 rounded-full border ${active ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
      style={{
        background:
          color === 'transparent'
            ? 'linear-gradient(135deg, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)'
            : color,
        borderColor: 'rgba(0,0,0,0.15)',
      }}
    />
  );
}
