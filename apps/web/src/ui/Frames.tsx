import { compareZ, fitRect, type FrameObject } from '@canvasly/shared';
import { ChevronLeft, ChevronRight, Frame as FrameIcon, Play, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Board } from '../doc/board';
import { useBoard, useDocVersion } from '../doc/context';
import { patch } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { panel } from './IconButton';

/** Frames in creation order, which is also presentation order. */
export function useFrames(board: Board): FrameObject[] {
  const version = useDocVersion(board);
  return useMemo(
    () => [...board.store.all()].filter((o): o is FrameObject => o.type === 'frame').sort(compareZ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, version],
  );
}

function FrameRow({ frame, index }: { frame: FrameObject; index: number }) {
  const board = useBoard();
  const readOnly = useUI((s) => s.readOnly);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(frame.name);
  const commit = () => {
    setEditing(false);
    const n = name.trim();
    if (n && n !== frame.name) patch(board, frame.id, { name: n.slice(0, 80) });
    else setName(frame.name);
  };
  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800">
      <span className="w-5 text-right text-xs text-gray-400 tabular-nums">{index + 1}</span>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setName(frame.name);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-indigo-400 px-1 text-sm outline-none dark:bg-zinc-800"
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm"
          onClick={() => {
            const b = board.store.getBounds(frame.id);
            if (b) useViewport.getState().fit(b);
            useUI.getState().select([frame.id]);
          }}
          onDoubleClick={() => !readOnly && setEditing(true)}
          title={readOnly ? frame.name : 'Click to go there, double-click to rename'}
        >
          {frame.name || 'Untitled frame'}
        </button>
      )}
      <button
        type="button"
        aria-label={`Present from ${frame.name}`}
        onClick={() => useUI.getState().setPresenting(index)}
        className="rounded p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600"
      >
        <Play size={14} />
      </button>
    </li>
  );
}

export function FramesPanel() {
  const board = useBoard();
  const frames = useFrames(board);
  const { framesPanel, toggleFramesPanel, setPresenting } = useUI();
  if (!framesPanel) return null;
  return (
    <aside
      className={`${panel} absolute top-16 right-3 bottom-3 z-20 flex w-72 max-w-[calc(100%-1.5rem)] flex-col`}
      data-testid="frames-panel"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-zinc-700">
        <FrameIcon size={16} />
        <h2 className="text-sm font-semibold">Frames</h2>
        <button
          type="button"
          disabled={!frames.length}
          onClick={() => setPresenting(0)}
          className="ml-auto flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          <Play size={12} /> Present
        </button>
        <button
          type="button"
          aria-label="Close frames"
          onClick={toggleFramesPanel}
          className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2" data-testid="frame-list">
        {frames.length === 0 && (
          <li className="p-4 text-center text-sm text-gray-500 dark:text-zinc-400">
            No frames yet. Press <kbd className="rounded border px-1">F</kbd> and drag on the board to add
            one.
          </li>
        )}
        {frames.map((f, i) => (
          <FrameRow key={f.id} frame={f} index={i} />
        ))}
      </ul>
    </aside>
  );
}

/** Full-screen slideshow of frames; arrows / space / PageUp-Down navigate, Esc exits. */
export function Presentation() {
  const board = useBoard();
  const frames = useFrames(board);
  const index = useUI((s) => s.presenting) ?? 0;
  const setPresenting = useUI((s) => s.setPresenting);
  const width = useViewport((s) => s.width);
  const height = useViewport((s) => s.height);
  const frame = frames[Math.min(index, frames.length - 1)];

  useEffect(() => {
    if (!frame) {
      setPresenting(null);
      return;
    }
    const b = board.store.getBounds(frame.id);
    if (b && width && height) useViewport.getState().setCamera(fitRect(b, width, height, 24, 8));
  }, [board, frame, width, height, setPresenting]);

  useEffect(() => {
    const go = (i: number) => setPresenting(Math.max(0, Math.min(frames.length - 1, i)));
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(index + 1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(index - 1);
      else if (k === 'Home') go(0);
      else if (k === 'End') go(frames.length - 1);
      else if (k === 'Escape') setPresenting(null);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, frames.length, setPresenting]);

  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => {});
    const onExit = () => !document.fullscreenElement && useUI.getState().setPresenting(null);
    document.addEventListener('fullscreenchange', onExit);
    return () => {
      document.removeEventListener('fullscreenchange', onExit);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  if (!frame) return null;
  return (
    <div
      className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-2 py-1.5 text-sm text-white shadow-lg"
      data-testid="presentation-bar"
    >
      <button
        type="button"
        aria-label="Previous frame"
        onClick={() => setPresenting(Math.max(0, index - 1))}
        className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-30"
        disabled={index === 0}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="max-w-64 truncate tabular-nums">
        {index + 1} / {frames.length} · {frame.name}
      </span>
      <button
        type="button"
        aria-label="Next frame"
        onClick={() => setPresenting(Math.min(frames.length - 1, index + 1))}
        className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-30"
        disabled={index >= frames.length - 1}
      >
        <ChevronRight size={18} />
      </button>
      <button
        type="button"
        onClick={() => setPresenting(null)}
        className="ml-1 rounded-full px-3 py-1 text-xs hover:bg-white/15"
      >
        Exit
      </button>
    </div>
  );
}
