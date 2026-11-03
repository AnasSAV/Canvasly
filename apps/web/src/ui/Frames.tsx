import { compareZ, fitRect, type FrameObject } from '@canvasly/shared';
import { ChevronLeft, ChevronRight, Frame as FrameIcon, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Board } from '../doc/board';
import { useBoard, useDocVersion } from '../doc/context';
import { patch } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { SidePanel } from './SidePanel';

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
    <li className="group flex h-8 items-center gap-2 rounded-md pr-1 pl-1.5 hover:bg-hover">
      <span className="num w-5 text-right text-[11px] text-muted">{index + 1}</span>
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
          className="field h-6! min-w-0 flex-1 px-1! text-[13px]!"
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px]"
          onClick={() => {
            const b = board.store.getBounds(frame.id);
            if (b) useViewport.getState().fit(b);
            useUI.getState().select([frame.id]);
          }}
          onDoubleClick={() => !readOnly && setEditing(true)}
          data-tip={readOnly ? frame.name : 'Click to go there, double-click to rename'}
        >
          {frame.name || 'Untitled frame'}
        </button>
      )}
      <button
        type="button"
        aria-label={`Present from ${frame.name}`}
        onClick={() => useUI.getState().setPresenting(index)}
        className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-link focus:opacity-100"
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
    <SidePanel
      title="Frames"
      icon={<FrameIcon size={15} />}
      width="w-72"
      closeLabel="Close frames"
      onClose={toggleFramesPanel}
      testId="frames-panel"
      actions={
        <button
          type="button"
          disabled={!frames.length}
          onClick={() => setPresenting(0)}
          className="btn btn-sm btn-primary"
        >
          <Play size={12} /> Present
        </button>
      }
    >
      <ul className="flex-1 overflow-y-auto p-1" data-testid="frame-list">
        {frames.length === 0 && (
          <li className="p-5 text-center text-[13px] text-muted">
            No frames yet. Press <kbd className="kbd">F</kbd> and drag on the board to add one.
          </li>
        )}
        {frames.map((f, i) => (
          <FrameRow key={f.id} frame={f} index={i} />
        ))}
      </ul>
    </SidePanel>
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
      className="ink panel anim-rise absolute bottom-4 left-1/2 z-40 flex h-11 -translate-x-1/2 items-center gap-1 px-1 text-[13px]"
      data-testid="presentation-bar"
    >
      <button
        type="button"
        aria-label="Previous frame"
        onClick={() => setPresenting(Math.max(0, index - 1))}
        className="tile"
        disabled={index === 0}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="max-w-64 truncate px-1">
        <span className="num text-xs text-muted">
          {index + 1} / {frames.length}
        </span>{' '}
        · {frame.name}
      </span>
      <button
        type="button"
        aria-label="Next frame"
        onClick={() => setPresenting(Math.min(frames.length - 1, index + 1))}
        className="tile"
        disabled={index >= frames.length - 1}
      >
        <ChevronRight size={18} />
      </button>
      <button type="button" onClick={() => setPresenting(null)} className="btn btn-ghost btn-sm ml-1">
        Exit
      </button>
    </div>
  );
}
