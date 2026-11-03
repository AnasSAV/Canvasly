import { FileImage, FileInput, FileJson, FileText, ImageDown, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../doc/context';
import { exportJson, exportPdf, exportPng, importJson } from '../lib/exporters';
import { toastError } from '../state/feedback';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { IconButton } from './IconButton';
import { MenuList } from './Menu';

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
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <IconButton
        label="Export / import"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        data-testid="export-menu"
      >
        <Upload size={18} />
      </IconButton>
      {open && (
        <div className="absolute top-11 left-0 z-30">
          <MenuList
            onClose={() => setOpen(false)}
            entries={[
              {
                label: 'Board as PNG',
                icon: <FileImage size={15} />,
                onSelect: () => void run(() => exportPng(board, title))(),
              },
              {
                label: 'Selection as PNG',
                icon: <ImageDown size={15} />,
                disabled: !selected.length,
                onSelect: () => void run(() => exportPng(board, title, selected))(),
              },
              {
                label: 'PDF (one page per frame)',
                icon: <FileText size={15} />,
                onSelect: () => void run(() => exportPdf(board, title))(),
              },
              {
                label: 'Board file (.json)',
                icon: <FileJson size={15} />,
                onSelect: () => void run(() => exportJson(board, title))(),
              },
              ...(readOnly
                ? []
                : ([
                    'divider',
                    {
                      label: 'Import board file…',
                      icon: <FileInput size={15} />,
                      onSelect: () => fileRef.current?.click(),
                    },
                  ] as const)),
            ]}
          />
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
