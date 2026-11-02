import { BoardSummary, can, type Role } from '@canvasly/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import type { Interactions } from './canvas/interactions';
import { Minimap } from './canvas/Minimap';
import { exposeForDebugging } from './debug';
import { createActions } from './doc/actions';
import { Board } from './doc/board';
import { BoardContext } from './doc/context';
import { contentBounds, getStartView } from './doc/ops';
import { useFollow, usePresencePublisher } from './hooks/usePresence';
import { useShortcuts } from './hooks/useShortcuts';
import { useThumbnailUploader } from './hooks/useThumbnailUploader';
import { ApiError, api, boardSocketUrl, publicSocketUrl } from './lib/api';
import { authClient } from './lib/auth';
import { Link, navigate } from './lib/router';
import { AuthPage } from './pages/AuthPage';
import { useUI } from './state/ui';
import { useViewport } from './state/viewport';
import { ChartEditor } from './ui/ChartEditor';
import { CommentsLayer, CommentsPanel } from './ui/Comments';
import { ContextMenu } from './ui/ContextMenu';
import { FramesPanel, Presentation } from './ui/Frames';
import { FollowBanner, RemoteCursors } from './ui/Presence';
import { DropOverlay, ImportProgress, useFileDrop } from './ui/FileDrop';
import { LayersPanel } from './ui/Layers';
import { ObjectSizeTag, SelectionToolbar } from './ui/SelectionToolbar';
import { ShareDialog } from './ui/ShareDialog';
import { ShortcutsDialog } from './ui/ShortcutsDialog';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';
import { ZoomControls } from './ui/ZoomControls';

/** How the board was opened: as a member, or anonymously through a public view-only link. */
export type BoardMode = { kind: 'member' } | { kind: 'public'; token: string };

interface BoardInit {
  id: string;
  socketUrl: string;
  assetBase: string;
  user: { id: string; name: string };
  anonymous: boolean;
}

function useBoardInstance(init: BoardInit | null): Board | null {
  const [board, setBoard] = useState<Board | null>(null);
  const key = init && JSON.stringify(init);
  useEffect(() => {
    if (!key) return;
    const { id, ...opts } = JSON.parse(key) as BoardInit;
    const b = new Board(id, opts);
    let alive = true;
    void b.ready.then(() => alive && setBoard(b));
    return () => {
      alive = false;
      setBoard(null);
      b.destroy();
    };
  }, [key]);
  return board;
}

// Board metadata is cached so a board that was open before can still be opened while offline
// (its content comes from IndexedDB; edits sync on reconnect).
const metaKey = (id: string) => `canvasly:board:${id}`;
function cacheMeta(meta: BoardSummary) {
  try {
    localStorage.setItem(metaKey(meta.id), JSON.stringify(meta));
  } catch {
    // storage unavailable: offline open just won't work
  }
}
function cachedMeta(id: string): BoardSummary | null {
  try {
    const parsed = BoardSummary.safeParse(JSON.parse(localStorage.getItem(metaKey(id)) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-50 text-sm text-gray-500 dark:bg-zinc-950 dark:text-zinc-400">
      {children}
    </div>
  );
}

const backLink = (
  <Link to="/" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
    Back to your boards
  </Link>
);

/** A board the signed-in user is a member of. */
export function BoardPage({ boardId }: { boardId: string }) {
  const [meta, setMeta] = useState<BoardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  useEffect(() => {
    api
      .getBoard(boardId)
      .then((m) => {
        cacheMeta(m);
        setMeta(m);
      })
      .catch((e: Error) => {
        if (e instanceof ApiError) {
          localStorage.removeItem(metaKey(boardId));
          setError(e.status === 404 ? "This board doesn't exist or you don't have access to it." : e.message);
          return;
        }
        const cached = cachedMeta(boardId); // network error: open from the local cache
        if (cached) setMeta(cached);
        else setError("You're offline and this board isn't available on this device yet.");
      });
  }, [boardId]);
  const user = session?.user;
  const board = useBoardInstance(
    meta && user
      ? {
          id: boardId,
          socketUrl: boardSocketUrl(boardId),
          assetBase: `/api/boards/${boardId}`,
          user: { id: user.id, name: user.name },
          anonymous: false,
        }
      : null,
  );

  if (error) {
    return (
      <Centered>
        <p>{error}</p>
        {backLink}
      </Centered>
    );
  }
  if (!board || !meta) return <Centered>Loading board…</Centered>;
  return (
    <BoardContext value={board}>
      <BoardView
        board={board}
        meta={meta}
        mode={{ kind: 'member' }}
        onMetaChange={(m) => {
          cacheMeta(m);
          setMeta(m);
        }}
      />
    </BoardContext>
  );
}

/** Anonymous, view-only access through a public link. */
function PublicBoardPage({ token, meta }: { token: string; meta: BoardSummary }) {
  const guest = useMemo(() => ({ id: `guest-${crypto.randomUUID()}`, name: 'Guest' }), []);
  const board = useBoardInstance({
    id: meta.id,
    socketUrl: publicSocketUrl(token),
    assetBase: `/api/public/${token}`,
    user: guest,
    anonymous: true,
  });
  if (!board) return <Centered>Loading board…</Centered>;
  return (
    <BoardContext value={board}>
      <BoardView board={board} meta={meta} mode={{ kind: 'public', token }} onMetaChange={() => {}} />
    </BoardContext>
  );
}

/**
 * /s/:token — signed in: join the board with the link's role and open it. Signed out: open view-only
 * links anonymously; links that grant editing ask you to sign in first.
 */
export function SharedLinkPage({ token }: { token: string }) {
  const { data: session, isPending } = authClient.useSession();
  const [publicMeta, setPublicMeta] = useState<BoardSummary | null>(null);
  const [state, setState] = useState<'loading' | 'needs-login' | 'error'>('loading');

  useEffect(() => {
    if (isPending) return;
    if (session) {
      api
        .joinByLink(token)
        .then(({ boardId }) => navigate(`/b/${boardId}`, { replace: true }))
        .catch(() => setState('error'));
      return;
    }
    api
      .publicBoard(token)
      .then((b) =>
        setPublicMeta({
          id: b.id,
          title: b.title,
          role: 'viewer',
          ownerName: '',
          createdAt: 0,
          updatedAt: 0,
          thumbnailVersion: null,
        }),
      )
      .catch(() => setState('needs-login'));
  }, [token, session, isPending]);

  if (publicMeta && !session) return <PublicBoardPage token={token} meta={publicMeta} />;
  if (state === 'needs-login') return <AuthPage />;
  if (state === 'error') {
    return (
      <Centered>
        <p>This link is no longer valid.</p>
        {backLink}
      </Centered>
    );
  }
  return <Centered>Opening board…</Centered>;
}

function useLiveRole(board: Board, initial: Role): Role {
  const provider = board.provider;
  const live = useSyncExternalStore(provider?.subscribe ?? (() => () => {}), () => provider?.role ?? null);
  return live ?? initial;
}

function BoardView({
  board,
  meta,
  mode,
  onMetaChange,
}: {
  board: Board;
  meta: BoardSummary;
  mode: BoardMode;
  onMetaChange: (m: BoardSummary) => void;
}) {
  const interactionsRef = useRef<Interactions | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const onInteractions = useCallback((i: Interactions | null) => {
    interactionsRef.current = i;
  }, []);
  const actions = useMemo(
    () => createActions(board, () => interactionsRef.current?.lastWorld ?? null),
    [board],
  );
  const openImagePicker = useCallback(() => fileRef.current?.click(), []);
  useShortcuts(actions, openImagePicker);

  // The server can change our role at any time (owner edits sharing); the UI follows.
  const role = useLiveRole(board, meta.role);
  const canEdit = can(role, 'edit');
  board.readOnly = !canEdit;
  const drop = useFileDrop(actions, canEdit);
  useEffect(() => {
    useUI.getState().setReadOnly(!canEdit);
    if (role !== meta.role && mode.kind === 'member') onMetaChange({ ...meta, role });
  }, [canEdit, role, meta, mode.kind, onMetaChange]);

  const flushThumbnail = useThumbnailUploader(board, mode.kind === 'member' && canEdit);
  usePresencePublisher(board);
  useFollow(board);

  const status = useSyncExternalStore(
    board.provider?.subscribe ?? (() => () => {}),
    () => board.provider?.status ?? null,
  );
  const presenting = useUI((s) => s.presenting !== null);

  // UI state is global; start each board with a clean slate.
  useEffect(() => {
    useUI.setState({
      selectedIds: [],
      editingId: null,
      editingCell: null,
      editingLabelId: null,
      activeCell: null,
      contextMenu: null,
      chartEditorId: null,
      renamingBoard: false,
      tool: 'select',
      draft: null,
      followingClientId: null,
      commentDraft: null,
      openThreadId: null,
      presenting: null,
    });
  }, [board]);

  useEffect(() => {
    exposeForDebugging(board);
    return () => exposeForDebugging(null);
  }, [board]);

  // Restore selection after undo/redo when the restored objects exist.
  useEffect(() => {
    const onAdded = (e: { stackItem: { meta: Map<string, unknown> } }) =>
      e.stackItem.meta.set('selection', useUI.getState().selectedIds);
    const onPopped = (e: { stackItem: { meta: Map<string, unknown> } }) => {
      const ids = (e.stackItem.meta.get('selection') as string[] | undefined) ?? [];
      useUI.getState().select(ids.filter((id) => board.store.has(id)));
    };
    board.undo.on('stack-item-added', onAdded);
    board.undo.on('stack-item-popped', onPopped);
    return () => {
      board.undo.off('stack-item-added', onAdded);
      board.undo.off('stack-item-popped', onPopped);
    };
  }, [board]);

  // Frame existing content on first load once the canvas has a size.
  const width = useViewport((s) => s.width);
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !width) return;
    framed.current = true;
    const start = getStartView(board);
    if (start) useViewport.getState().fitExact(start);
    else useViewport.getState().fit(contentBounds(board.store));
  }, [board, width]);

  if (status === 'denied') {
    return (
      <Centered>
        <p>{mode.kind === 'public' ? 'This link was disabled.' : 'Your access to this board was removed.'}</p>
        {mode.kind === 'member' && backLink}
      </Centered>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden" {...drop.handlers} data-testid="board-root">
      <BoardCanvas onInteractions={onInteractions} />
      <CommentsLayer />
      <RemoteCursors />
      {presenting ? (
        <Presentation />
      ) : (
        <>
          <FollowBanner />
          <TopBar
            board={board}
            actions={actions}
            meta={meta}
            mode={mode}
            onMetaChange={onMetaChange}
            beforeLeave={flushThumbnail}
            onShare={() => setShareOpen(true)}
          />
          <Toolbar onImage={openImagePicker} actions={actions} />
          <SelectionToolbar actions={actions} title={meta.title} />
          <ObjectSizeTag />
          <ZoomControls onFit={actions.zoomToFit} />
          <Minimap />
          <CommentsPanel />
          <FramesPanel />
          <LayersPanel />
          <ChartEditor />
          <ContextMenu actions={actions} title={meta.title} />
          <ShortcutsDialog />
        </>
      )}
      {shareOpen && <ShareDialog boardId={meta.id} onClose={() => setShareOpen(false)} />}
      <ImportProgress actions={actions} />
      {drop.over && <DropOverlay />}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          if (e.target.files) void actions.insertFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
