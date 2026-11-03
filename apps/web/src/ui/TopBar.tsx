import { can, type BoardSummary } from '@canvasly/shared';
import {
  EllipsisVertical,
  Frame as FrameIcon,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  Play,
  Plus,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { BoardMode } from '../BoardPage';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import type { ConnectionStatus } from '../doc/provider';
import { api } from '../lib/api';
import { signOut } from '../lib/auth';
import { navigate } from '../lib/router';
import { useUI } from '../state/ui';
import { boardMenuEntries } from './boardMenus';
import { ExportMenu } from './ExportMenu';
import { IconButton, panel } from './IconButton';
import { Logo } from './Logo';
import { MenuList, type MenuEntry } from './Menu';
import { PresenceAvatars } from './Presence';
import { ThemeToggle } from './ThemeToggle';

const noop = () => () => {};

function useConnectionStatus(board: Board): ConnectionStatus | null {
  const provider = board.provider;
  return useSyncExternalStore(provider?.subscribe ?? noop, () => provider?.status ?? null);
}

const STATUS: Record<ConnectionStatus, { color: string; label: string; short: string }> = {
  online: { color: 'bg-success', label: 'Saved · connected', short: 'Saved' },
  connecting: { color: 'bg-cta animate-pulse', label: 'Connecting…', short: 'Connecting…' },
  offline: {
    color: 'bg-subtle',
    label: 'Offline · changes are kept on this device and sync when you reconnect',
    short: 'Offline · saved locally',
  },
  denied: { color: 'bg-danger', label: 'Access to this board was removed', short: 'No access' },
};

function BoardTitle({ meta, onMetaChange }: { meta: BoardSummary; onMetaChange: (m: BoardSummary) => void }) {
  const editing = useUI((s) => s.renamingBoard);
  const setEditing = (renamingBoard: boolean) => useUI.setState({ renamingBoard });
  const [title, setTitle] = useState(meta.title);
  const editable = can(meta.role, 'rename');

  useEffect(() => setTitle(meta.title), [meta.title]);

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

  if (editing && editable) {
    return (
      <input
        autoFocus
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setTitle(meta.title);
            setEditing(false);
          }
        }}
        className="field field-sm w-52 font-semibold"
        data-testid="board-title-input"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      data-tip={editable ? 'Rename board' : undefined}
      onClick={() => setEditing(true)}
      className="h-8 max-w-52 truncate rounded-md px-1.5 text-[13px] font-semibold enabled:hover:bg-hover"
      data-testid="board-title"
    >
      {meta.title}
    </button>
  );
}

/** Icon button that toggles a dropdown; closes on any click outside. */
function Dropdown({
  label,
  icon,
  testId,
  entries,
}: {
  label: string;
  icon: ReactNode;
  testId: string;
  /** Built on open so check marks and enabled states are current. */
  entries: () => MenuEntry[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="relative" ref={root}>
      <IconButton label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid={testId}>
        {icon}
      </IconButton>
      {open && (
        <div className="absolute top-11 left-0 z-30">
          <MenuList entries={entries()} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
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
  const readOnly = useUI((s) => s.readOnly);
  const commentsPanel = useUI((s) => s.commentsPanel);
  const framesPanel = useUI((s) => s.framesPanel);
  const status = useConnectionStatus(board);
  const s = status ? STATUS[status] : null;
  const isPublic = mode.kind === 'public';

  const leave = (to: string) => {
    void beforeLeave().finally(() => navigate(to));
  };

  const mainMenu = (): MenuEntry[] =>
    isPublic
      ? [{ label: 'Sign in', icon: <LogOut size={15} />, onSelect: () => (location.href = '/') }]
      : [
          { label: 'Back to boards', icon: <LayoutGrid size={15} />, onSelect: () => leave('/') },
          {
            label: 'New board',
            icon: <Plus size={15} />,
            onSelect: () => {
              void api.createBoard().then((b) => leave(`/b/${b.id}`));
            },
          },
          'divider',
          { label: 'Sign out', icon: <LogOut size={15} />, onSelect: () => void signOut() },
        ];

  const present = () => {
    const ui = useUI.getState();
    if ([...board.store.all()].some((o) => o.type === 'frame')) ui.setPresenting(0);
    else if (!ui.framesPanel) ui.toggleFramesPanel(); // explains how to add frames
  };

  return (
    <>
      <div
        className={`${panel} absolute top-3 left-3 z-30 flex h-11 max-w-[calc(100%-1.5rem)] items-center gap-0.5 px-1`}
      >
        <Dropdown label="Main menu" icon={<MenuIcon size={18} />} testId="main-menu" entries={mainMenu} />
        <a
          href="/"
          aria-label="Home"
          data-tip="Home"
          onClick={(e) => {
            // Leave a new-tab click to the browser.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            leave('/');
          }}
          className="flex h-9 items-center rounded-[7px] px-1 hover:bg-hover"
          data-testid="home-link"
        >
          <span className="hidden sm:block">
            <Logo height={21} />
          </span>
          <span className="sm:hidden">
            <Logo compact height={21} />
          </span>
        </a>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {isPublic ? (
          <span className="max-w-52 truncate px-1.5 text-[13px] font-semibold">{meta.title}</span>
        ) : (
          <BoardTitle meta={meta} onMetaChange={onMetaChange} />
        )}
        {readOnly && (
          <span className="badge shrink-0" data-testid="view-only-badge">
            View only
          </span>
        )}
        {s && (
          <span
            data-tip={s.label}
            role="img"
            aria-label={s.label}
            className={`mx-1 h-2 w-2 shrink-0 rounded-full ${s.color}`}
            data-testid="connection-status"
            data-status={status}
          />
        )}
        {s && (status === 'offline' || status === 'denied') && (
          <span className="hidden text-xs whitespace-nowrap text-muted sm:inline">{s.short}</span>
        )}
        <Dropdown
          label="Board menu"
          icon={<EllipsisVertical size={18} />}
          testId="board-menu"
          entries={() => boardMenuEntries(board, actions, meta, { isPublic, onShare })}
        />
        <ExportMenu title={meta.title} />
      </div>

      <div className={`${panel} absolute top-16 right-3 z-30 flex h-11 items-center gap-0.5 px-1 sm:top-3`}>
        <IconButton
          label="Comments"
          active={commentsPanel}
          onClick={() => useUI.getState().toggleCommentsPanel()}
          data-testid="comments-toggle"
        >
          <MessageSquare size={17} />
        </IconButton>
        <IconButton
          label="Frames"
          active={framesPanel}
          onClick={() => useUI.getState().toggleFramesPanel()}
          data-testid="frames-toggle"
        >
          <FrameIcon size={17} />
        </IconButton>
        <ThemeToggle />
        <span className="hidden md:block">
          <PresenceAvatars />
        </span>
        <IconButton label="Start presentation" onClick={present} data-testid="present">
          <Play size={17} />
        </IconButton>
        {meta.role === 'owner' && !isPublic && (
          <button type="button" onClick={onShare} className="btn btn-primary ml-1" data-testid="share-button">
            <UserPlus size={15} /> <span className="hidden sm:inline">Share</span>
          </button>
        )}
      </div>
    </>
  );
}
