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
      className="anim-fade pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[var(--scrim)]"
      data-testid="drop-overlay"
    >
      {/* Selection corners around the whole board: it's about to become part of it. */}
      <div className="absolute inset-5" style={{ animation: 'bracket-in 160ms ease-out' }}>
        {(
          [
            'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl',
            'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl',
            'bottom-0 right-0 border-r-4 border-b-4 rounded-br-xl',
          ] as const
        ).map((corner) => (
          <span key={corner} className={`absolute h-16 w-16 border-cta ${corner}`} />
        ))}
      </div>
      <div className="ink panel anim-rise flex flex-col items-center gap-2 px-9 py-6 shadow-pop">
        <p className="font-display text-xl font-semibold tracking-tight">Release to add it</p>
        <p className="flex items-center gap-4 text-[13px] text-muted">
          <span className="flex items-center gap-1.5">
            <FileText size={15} /> PDF
          </span>
          <span className="flex items-center gap-1.5">
            <ImageIcon size={15} /> Images
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
      className={`${panel} anim-rise absolute bottom-20 left-1/2 z-40 flex w-80 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 p-3`}
      role="status"
      data-testid="import-progress"
    >
      <FileText size={17} className="shrink-0 text-link" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{name}</p>
        <p className="mt-0.5 text-xs text-muted tabular-nums">
          {total ? `Adding page ${Math.min(done + 1, total)} of ${total}` : 'Opening…'}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-cta transition-[width]"
            style={{ width: total ? `${(done / total) * 100}%` : '5%' }}
          />
        </div>
      </div>
      <button
        type="button"
        aria-label="Stop adding this PDF"
        data-tip="Stop"
        onClick={actions.cancelImport}
        className="tile text-muted"
      >
        <X size={16} />
      </button>
    </div>
  );
}
