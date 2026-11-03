import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  /** A tool on the rail, whose active state is stronger than a toggle's. */
  tool?: boolean;
  children: ReactNode;
}

export function IconButton({ label, active, tool, children, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      data-tip={label}
      aria-label={label}
      aria-pressed={active}
      className={`tile ${tool ? 'tile-tool' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export const panel = 'panel';

export function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Color ${color}`}
      aria-pressed={active}
      onClick={onClick}
      className="swatch"
      style={{
        background:
          color === 'transparent'
            ? 'linear-gradient(135deg, #fff 44%, #d9391f 44%, #d9391f 56%, #fff 56%)'
            : color,
      }}
    />
  );
}
