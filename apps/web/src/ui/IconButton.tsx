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
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-35 ${
        active
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
          : 'text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export const panel =
  'rounded-xl bg-white shadow-[0_1px_8px_rgba(5,0,56,0.14)] dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_1px_8px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-white/10';

export function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={color}
      aria-label={`Color ${color}`}
      onClick={onClick}
      className={`h-6 w-6 shrink-0 rounded-full border border-black/15 dark:border-white/40 ${active ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-zinc-900' : ''}`}
      style={{
        background:
          color === 'transparent'
            ? 'linear-gradient(135deg, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)'
            : color,
      }}
    />
  );
}
