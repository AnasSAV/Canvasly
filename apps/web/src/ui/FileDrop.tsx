import { FileText, ImageIcon, X } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { screenToWorld } from '@canvasly/shared';
import type { Actions } from '../doc/actions';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { panel } from './IconButton';

const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

/** Tracks files being dragged over the board, for the overlay, and adds them where they're dropped. */
export function useFileDrop(actions: Actions, canEdit: boolean) {
  const [over, setOver] = useState(false);
  // Enter and leave also fire for every child crossed on the way, so only the count says when it really left.
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!carriesFiles(e) || !canEdit) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    [canEdit],
  );
  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!carriesFiles(e) || !canEdit) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    [canEdit],
  );
  const onDragOver = useCallback((e: DragEvent) => {
    // Without this the browser would open the dropped file instead.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!canEdit || !e.dataTransfer.files.length) return;
      const r = e.currentTarget.getBoundingClientRect();
      const at = screenToWorld(useViewport.getState().camera, {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
      void actions.insertFiles([...e.dataTransfer.files], at);
    },
    [actions, canEdit],
  );
  return { over, handlers: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}

/** Says the board has noticed the file, and that letting go will add it. */
export function DropOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-indigo-600/10 ring-2 ring-indigo-500/60 ring-inset backdrop-blur-[1px]"
      data-testid="drop-overlay"
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-zinc-900/85 px-12 py-9 text-white shadow-2xl">
        <p className="text-2xl font-semibold tracking-tight">Release to add it</p>
        <p className="flex items-center gap-4 text-sm text-white/75">
          <span className="flex items-center gap-1.5">
            <FileText size={16} /> PDF
          </span>
          <span className="flex items-center gap-1.5">
            <ImageIcon size={16} /> Images
          </span>
        </p>
      </div>
    </div>
  );
}

/** Rendering a long PDF takes a while, so show how far along it is and let it be stopped. */
export function ImportProgress({ actions }: { actions: Actions }) {
  const progress = useUI((s) => s.importProgress);
  if (!progress) return null;
  const { name, done, total } = progress;
  return (
    <div
      className={`${panel} absolute bottom-20 left-1/2 z-40 flex w-80 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 p-3`}
      role="status"
      data-testid="import-progress"
    >
      <FileText size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
          {total ? `Adding page ${Math.min(done + 1, total)} of ${total}` : 'Opening…'}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-indigo-600 transition-[width]"
            style={{ width: total ? `${(done / total) * 100}%` : '5%' }}
          />
        </div>
      </div>
      <button
        type="button"
        aria-label="Stop adding this PDF"
        title="Stop"
        onClick={actions.cancelImport}
        className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <X size={16} />
      </button>
    </div>
  );
}
