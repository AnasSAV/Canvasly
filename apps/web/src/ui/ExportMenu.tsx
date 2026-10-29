import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../doc/context';
import { exportJson, exportPdf, exportPng, importJson } from '../lib/exporters';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { IconButton, panel } from './IconButton';

const item =
  'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-zinc-800';

export function ExportMenu({ title }: { title: string }) {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = useUI((s) => s.selectedIds);
  const readOnly = useUI((s) => s.readOnly);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (fn: () => Promise<unknown>) => async () => {
    setOpen(false);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <IconButton
        label="Export / import"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        data-testid="export-menu"
      >
        <Download size={18} />
      </IconButton>
      {open && (
        <div className={`${panel} absolute top-11 right-0 z-30 w-56 py-1`} role="menu">
          <button type="button" role="menuitem" className={item} onClick={run(() => exportPng(board, title))}>
            Board as PNG
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={!selected.length}
            onClick={run(() => exportPng(board, title, selected))}
          >
            Selection as PNG
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(() => exportPdf(board, title))}>
            PDF (one page per frame)
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={run(() => exportJson(board, title))}
          >
            Board file (.json)
          </button>
          {!readOnly && (
            <>
              <div className="my-1 h-px bg-gray-200 dark:bg-zinc-700" />
              <button type="button" role="menuitem" className={item} onClick={() => fileRef.current?.click()}>
                Import board file…
              </button>
            </>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const view = useViewport.getState().visibleRect();
          void run(async () => {
            const ids = await importJson(board, file, { x: view.x + view.w / 2, y: view.y + view.h / 2 });
            useUI.getState().select(ids);
          })();
        }}
      />
    </div>
  );
}
