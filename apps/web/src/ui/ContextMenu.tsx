import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Actions } from '../doc/actions';
import { useBoard } from '../doc/context';
import { useUI } from '../state/ui';
import { boardContextEntries, objectContextEntries } from './boardMenus';
import { MenuList } from './Menu';

/** Right-click menu: board actions and view settings on empty canvas, selection actions on an object. */
export function ContextMenu({ actions, title }: { actions: Actions; title: string }) {
  const board = useBoard();
  const menu = useUI((s) => s.contextMenu);
  const setMenu = useUI((s) => s.setContextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Keep the menu on screen near the window edges.
  useLayoutEffect(() => {
    if (!menu) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMenu(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu, setMenu]);

  if (!menu) return null;
  const entries = menu.targetId
    ? objectContextEntries(board, actions, title)
    : boardContextEntries(board, actions, menu.world);
  return (
    <div
      ref={ref}
      className="absolute z-40"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="context-menu"
    >
      <MenuList entries={entries} onClose={() => setMenu(null)} />
    </div>
  );
}
