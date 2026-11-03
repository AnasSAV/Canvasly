import { Check, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
    <div ref={ref} className={`absolute -top-1 z-10 ${left ? 'right-full mr-1' : 'left-full ml-1'}`}>
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
    <div className="panel pop w-max min-w-52 p-1" role="menu">
      {entries.map((e, i) => {
        if (e === 'divider') return <div key={i} className="hairline" />;
        const open = openIndex === i;
        return (
          <div key={e.label} className="relative" onMouseEnter={() => setOpenIndex(e.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              disabled={e.disabled}
              aria-haspopup={e.submenu ? 'menu' : undefined}
              aria-expanded={e.submenu ? open : undefined}
              data-active={open}
              onClick={() => {
                if (e.submenu) {
                  setOpenIndex(open ? null : i);
                  return;
                }
                onClose();
                e.onSelect?.();
              }}
              className={`menu-row ${e.danger ? 'text-danger!' : ''}`}
            >
              {hasChecks && (
                <span className="flex w-4 justify-center text-link">{e.checked && <Check size={14} />}</span>
              )}
              {hasIcons && (
                <span className={`flex w-4 justify-center ${e.danger ? '' : 'text-muted'}`}>{e.icon}</span>
              )}
              <span className="flex-1 pr-5">{e.label}</span>
              {e.shortcut && <span className="num text-[11px] text-muted">{e.shortcut}</span>}
              {e.submenu && <ChevronRight size={14} className="text-muted" />}
            </button>
            {e.submenu && open && <Submenu entries={e.submenu} onClose={onClose} />}
          </div>
        );
      })}
    </div>
  );
}
