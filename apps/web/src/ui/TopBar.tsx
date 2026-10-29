import { can, type BoardSummary } from '@canvasly/shared';
import { ChevronLeft, Grid3x3, Redo2, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import type { ConnectionStatus } from '../doc/provider';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useUI } from '../state/ui';
import { IconButton, panel } from './IconButton';
import { PresenceAvatars } from './Presence';
import { addStressObjects } from './stress';

function useUndoState(board: Board) {
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const update = () => setState({ canUndo: board.undo.canUndo(), canRedo: board.undo.canRedo() });
    board.undo.on('stack-item-added', update);
    board.undo.on('stack-item-popped', update);
    board.undo.on('stack-cleared', update);
    update();
    return () => {
      board.undo.off('stack-item-added', update);
      board.undo.off('stack-item-popped', update);
      board.undo.off('stack-cleared', update);
    };
  }, [board]);
  return state;
}

const noop = () => () => {};

function useConnectionStatus(board: Board): ConnectionStatus | null {
  const provider = board.provider;
  return useSyncExternalStore(provider?.subscribe ?? noop, () => provider?.status ?? null);
}

const STATUS: Record<ConnectionStatus, { color: string; label: string; short: string }> = {
  online: { color: 'bg-emerald-500', label: 'Saved · connected', short: 'Saved' },
  connecting: { color: 'bg-amber-400', label: 'Connecting…', short: 'Connecting…' },
  offline: {
    color: 'bg-gray-400',
    label: 'Offline · changes are kept on this device and sync when you reconnect',
    short: 'Offline · saved locally',
  },
  denied: { color: 'bg-red-500', label: 'Access to this board was removed', short: 'No access' },
};

function BoardTitle({ meta, onMetaChange }: { meta: BoardSummary; onMetaChange: (m: BoardSummary) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meta.title);
  const editable = can(meta.role, 'rename');

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (!t || t === meta.title) {
      setTitle(meta.title);
      return;
    }
    onMetaChange({ ...meta, title: t });
    api.renameBoard(meta.id, { title: t }).catch(() => onMetaChange(meta));
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setTitle(meta.title);
            setEditing(false);
          }
        }}
        className="w-56 rounded border border-indigo-400 px-1 text-sm outline-none"
        data-testid="board-title-input"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      title={editable ? 'Rename board' : undefined}
      onClick={() => setEditing(true)}
      className="max-w-56 truncate rounded px-1 text-sm text-gray-700 enabled:hover:bg-gray-100"
      data-testid="board-title"
    >
      {meta.title}
    </button>
  );
}

export function TopBar({
  board,
  actions,
  meta,
  onMetaChange,
  beforeLeave,
}: {
  board: Board;
  actions: Actions;
  meta: BoardSummary;
  onMetaChange: (m: BoardSummary) => void;
  beforeLeave: () => Promise<void>;
}) {
  const { canUndo, canRedo } = useUndoState(board);
  const snap = useUI((s) => s.snapToGrid);
  const toggleSnap = useUI((s) => s.toggleSnap);
  const status = useConnectionStatus(board);
  const s = status ? STATUS[status] : null;

  return (
    <>
      <div className={`${panel} absolute top-3 left-3 z-10 flex h-11 items-center gap-1.5 pr-3 pl-1`}>
        <IconButton
          label="Back to boards"
          onClick={() => {
            void beforeLeave().finally(() => navigate('/'));
          }}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <div className="h-5 w-5 rounded-md bg-indigo-600" />
        <span className="font-semibold tracking-tight">Canvasly</span>
        <span className="text-gray-300">/</span>
        <BoardTitle meta={meta} onMetaChange={onMetaChange} />
        {s && (
          <span
            title={s.label}
            aria-label={s.label}
            className={`ml-1 h-2 w-2 shrink-0 rounded-full ${s.color}`}
            data-testid="connection-status"
            data-status={status}
          />
        )}
        {s && (status === 'offline' || status === 'denied') && (
          <span className="text-xs whitespace-nowrap text-gray-500">{s.short}</span>
        )}
      </div>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <PresenceAvatars />
        <div className={`${panel} flex items-center gap-0.5 p-1`}>
          <IconButton label="Undo (Ctrl Z)" disabled={!canUndo} onClick={actions.undo} data-testid="undo">
            <Undo2 size={18} />
          </IconButton>
          <IconButton
            label="Redo (Ctrl Shift Z)"
            disabled={!canRedo}
            onClick={actions.redo}
            data-testid="redo"
          >
            <Redo2 size={18} />
          </IconButton>
          <div className="mx-1 h-6 w-px bg-gray-200" />
          <IconButton label="Snap to grid" active={snap} onClick={toggleSnap}>
            <Grid3x3 size={18} />
          </IconButton>
          {import.meta.env.DEV && (
            <IconButton label="Dev: add 1,000 objects" onClick={() => addStressObjects(board, 1000)}>
              <Sparkles size={18} />
            </IconButton>
          )}
        </div>
      </div>
    </>
  );
}
