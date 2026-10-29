import { can, type BoardSummary } from '@canvasly/shared';
import {
  ChevronLeft,
  Frame as FrameIcon,
  Grid3x3,
  MessageSquare,
  Redo2,
  Sparkles,
  Undo2,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BoardMode } from '../BoardPage';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import type { ConnectionStatus } from '../doc/provider';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useUI } from '../state/ui';
import { IconButton, panel } from './IconButton';
import { ExportMenu } from './ExportMenu';
import { PresenceAvatars } from './Presence';
import { ThemeToggle } from './ThemeToggle';
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
        className="w-56 rounded border border-indigo-400 px-1 text-sm outline-none dark:bg-zinc-800"
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
      className="max-w-56 truncate rounded px-1 text-sm text-gray-700 enabled:hover:bg-gray-100 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
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
  mode,
  onMetaChange,
  beforeLeave,
  onShare,
}: {
  board: Board;
  actions: Actions;
  meta: BoardSummary;
  mode: BoardMode;
  onMetaChange: (m: BoardSummary) => void;
  beforeLeave: () => Promise<void>;
  onShare: () => void;
}) {
  const { canUndo, canRedo } = useUndoState(board);
  const snap = useUI((s) => s.snapToGrid);
  const toggleSnap = useUI((s) => s.toggleSnap);
  const readOnly = useUI((s) => s.readOnly);
  const commentsPanel = useUI((s) => s.commentsPanel);
  const framesPanel = useUI((s) => s.framesPanel);
  const status = useConnectionStatus(board);
  const s = status ? STATUS[status] : null;
  const isPublic = mode.kind === 'public';

  return (
    <>
      <div
        className={`${panel} absolute top-3 left-3 z-10 flex h-11 max-w-[calc(100%-1.5rem)] items-center gap-1.5 pr-3 pl-1 sm:max-w-[45%]`}
      >
        {isPublic ? (
          <a
            href="/"
            className="px-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Sign in
          </a>
        ) : (
          <IconButton
            label="Back to boards"
            onClick={() => {
              void beforeLeave().finally(() => navigate('/'));
            }}
          >
            <ChevronLeft size={18} />
          </IconButton>
        )}
        <div className="hidden h-5 w-5 shrink-0 rounded-md bg-indigo-600 sm:block" />
        <span className="hidden font-semibold tracking-tight sm:inline">Canvasly</span>
        <span className="hidden text-gray-300 sm:inline dark:text-zinc-600">/</span>
        {isPublic ? (
          <span className="truncate px-1 text-sm text-gray-700 dark:text-zinc-300">{meta.title}</span>
        ) : (
          <BoardTitle meta={meta} onMetaChange={onMetaChange} />
        )}
        {readOnly && (
          <span
            className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-zinc-800 dark:text-zinc-300"
            data-testid="view-only-badge"
          >
            View only
          </span>
        )}
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
          <span className="hidden text-xs whitespace-nowrap text-gray-500 sm:inline">{s.short}</span>
        )}
      </div>
      <div className="absolute top-16 right-3 z-30 flex items-center gap-2 sm:top-3">
        <div className="hidden md:block">
          <PresenceAvatars />
        </div>
        {meta.role === 'owner' && !isPublic && (
          <button
            type="button"
            onClick={onShare}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] hover:bg-indigo-700"
            data-testid="share-button"
          >
            <UserPlus size={16} /> <span className="hidden sm:inline">Share</span>
          </button>
        )}
        <div className={`${panel} flex items-center gap-0.5 p-1`}>
          {!readOnly && (
            <>
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
              <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block dark:bg-zinc-700" />
              <IconButton label="Snap to grid" active={snap} onClick={toggleSnap} className="hidden sm:flex">
                <Grid3x3 size={18} />
              </IconButton>
            </>
          )}
          <IconButton
            label="Comments"
            active={commentsPanel}
            onClick={() => useUI.getState().toggleCommentsPanel()}
            data-testid="comments-toggle"
          >
            <MessageSquare size={18} />
          </IconButton>
          <IconButton
            label="Frames & presentation"
            active={framesPanel}
            onClick={() => useUI.getState().toggleFramesPanel()}
            data-testid="frames-toggle"
          >
            <FrameIcon size={18} />
          </IconButton>
          <ExportMenu title={meta.title} />
          <ThemeToggle />
          {import.meta.env.DEV && !readOnly && (
            <IconButton
              label="Dev: add 1,000 objects"
              onClick={() => addStressObjects(board, 1000)}
              className="hidden lg:flex"
            >
              <Sparkles size={18} />
            </IconButton>
          )}
        </div>
      </div>
    </>
  );
}
