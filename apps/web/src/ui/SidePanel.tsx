import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';

/** A panel docked on the right of the board, below the top bar. */
export function SidePanel({
  title,
  icon,
  width,
  closeLabel,
  closeIcon,
  closeTestId,
  onClose,
  actions,
  testId,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** Tailwind width class. */
  width: string;
  closeLabel: string;
  closeIcon?: ReactNode;
  closeTestId?: string;
  onClose: () => void;
  actions?: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={`panel anim-rise absolute top-16 right-3 bottom-16 z-20 flex ${width} max-w-[calc(100%-1.5rem)] flex-col`}
      data-testid={testId}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-1 pl-3">
        {icon && <span className="text-muted">{icon}</span>}
        <h2 className="font-sans text-[13px] font-semibold tracking-normal">{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <IconButton label={closeLabel} onClick={onClose} data-testid={closeTestId}>
            {closeIcon ?? <X size={16} />}
          </IconButton>
        </div>
      </header>
      {children}
    </aside>
  );
}
