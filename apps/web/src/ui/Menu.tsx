import { Check, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { panel } from './IconButton';

export type MenuEntry =
  | 'divider'
  | {
      label: string;
      shortcut?: string;
      icon?: ReactNode;
      /** Shows a check mark; undefined leaves the column empty. */
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      onSelect?: () => void;
      submenu?: MenuEntry[];
    };

function Submenu({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  // Open to the left when there's no room on the right.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.right > window.innerWidth - 8) setLeft(true);
  }, []);
  return (
    <div ref={ref} className={`absolute -top-1.5 z-10 ${left ? 'right-full mr-1' : 'left-full ml-1'}`}>
      <MenuList entries={entries} onClose={onClose} />
    </div>
  );
}

/** Vertical menu with check marks, shortcuts and fly-out submenus. */
export function MenuList({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const hasChecks = entries.some((e) => e !== 'divider' && e.checked !== undefined);
  const hasIcons = entries.some((e) => e !== 'divider' && e.icon);
  return (
    <div className={`${panel} w-max min-w-52 py-1.5 text-sm`} role="menu">
      {entries.map((e, i) => {
        if (e === 'divider') {
          return <div key={i} className="my-1.5 h-px bg-gray-200 dark:bg-zinc-700" />;
        }
        const open = openIndex === i;
        return (
          <div key={e.label} className="relative" onMouseEnter={() => setOpenIndex(e.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              disabled={e.disabled}
              aria-haspopup={e.submenu ? 'menu' : undefined}
              aria-expanded={e.submenu ? open : undefined}
              onClick={() => {
                if (e.submenu) {
                  setOpenIndex(open ? null : i);
                  return;
                }
                onClose();
                e.onSelect?.();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left whitespace-nowrap hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-zinc-800 ${
                e.danger ? 'text-red-600 dark:text-red-400' : ''
              } ${open ? 'bg-gray-100 dark:bg-zinc-800' : ''}`}
            >
              {hasChecks && (
                <span className="flex w-4 justify-center text-indigo-600 dark:text-indigo-400">
                  {e.checked && <Check size={15} />}
                </span>
              )}
              {hasIcons && (
                <span className="flex w-4 justify-center text-gray-600 dark:text-zinc-300">{e.icon}</span>
              )}
              <span className="flex-1 pr-6">{e.label}</span>
              {e.shortcut && <span className="text-xs text-gray-400 dark:text-zinc-500">{e.shortcut}</span>}
              {e.submenu && <ChevronRight size={15} className="text-gray-500 dark:text-zinc-400" />}
            </button>
            {e.submenu && open && <Submenu entries={e.submenu} onClose={onClose} />}
          </div>
        );
      })}
    </div>
  );
}
