import { BoardSummary, can, screenToWorld } from '@canvasly/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import type { Interactions } from './canvas/interactions';
import { Minimap } from './canvas/Minimap';
import { exposeForDebugging } from './debug';
import { createActions } from './doc/actions';
import { Board } from './doc/board';
import { BoardContext } from './doc/context';
import type { PresenceUser } from './doc/presence';
import { contentBounds } from './doc/ops';
import { useFollow, usePresencePublisher } from './hooks/usePresence';
import { useShortcuts } from './hooks/useShortcuts';
import { useThumbnailUploader } from './hooks/useThumbnailUploader';
import { ApiError, api, boardSocketUrl } from './lib/api';
import { authClient } from './lib/auth';
import { Link } from './lib/router';
import { useUI } from './state/ui';
import { useViewport } from './state/viewport';
import { FollowBanner, RemoteCursors } from './ui/Presence';
import { SelectionToolbar } from './ui/SelectionToolbar';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';
import { ZoomControls } from './ui/ZoomControls';

function useBoardInstance(boardId: string | null, user: PresenceUser | null): Board | null {
  const [board, setBoard] = useState<Board | null>(null);
  const userId = user?.id;
  const userName = user?.name;
  useEffect(() => {
    if (!boardId || !userId) return;
    const b = new Board(boardId, boardSocketUrl(boardId), { id: userId, name: userName ?? '' });
    let alive = true;
    void b.ready.then(() => alive && setBoard(b));
    return () => {
      alive = false;
      setBoard(null);
      b.destroy();
    };
  }, [boardId, userId, userName]);
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
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-500">
      {children}
    </div>
  );
}

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
  const board = useBoardInstance(meta ? boardId : null, session?.user ?? null);

  if (error) {
    return (
      <Centered>
        <p>{error}</p>
        <Link to="/" className="font-medium text-indigo-600 hover:underline">
          Back to your boards
        </Link>
      </Centered>
    );
  }
  if (!board || !meta) return <Centered>Loading board…</Centered>;
  return (
    <BoardContext value={board}>
      <BoardView
        board={board}
        meta={meta}
        onMetaChange={(m) => {
          cacheMeta(m);
          setMeta(m);
        }}
      />
    </BoardContext>
  );
}

function BoardView({
  board,
  meta,
  onMetaChange,
}: {
  board: Board;
  meta: BoardSummary;
  onMetaChange: (m: BoardSummary) => void;
}) {
  const interactionsRef = useRef<Interactions | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onInteractions = useCallback((i: Interactions | null) => {
    interactionsRef.current = i;
  }, []);
  const actions = useMemo(
    () => createActions(board, () => interactionsRef.current?.lastWorld ?? null),
    [board],
  );
  const openImagePicker = useCallback(() => fileRef.current?.click(), []);
  useShortcuts(actions, openImagePicker);
  const flushThumbnail = useThumbnailUploader(board, can(meta.role, 'edit'));
  usePresencePublisher(board);
  useFollow(board);

  // UI state is global; start each board with a clean slate.
  useEffect(() => {
    useUI.setState({
      selectedIds: [],
      editingId: null,
      tool: 'select',
      draft: null,
      followingClientId: null,
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
    useViewport.getState().fit(contentBounds(board.store));
  }, [board, width]);

  return (
    <div
      className="relative h-full w-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const at = screenToWorld(useViewport.getState().camera, {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
        void actions.insertImages([...e.dataTransfer.files], at);
      }}
    >
      <BoardCanvas onInteractions={onInteractions} />
      <RemoteCursors />
      <FollowBanner />
      <TopBar
        board={board}
        actions={actions}
        meta={meta}
        onMetaChange={onMetaChange}
        beforeLeave={flushThumbnail}
      />
      <Toolbar onImage={openImagePicker} />
      <SelectionToolbar actions={actions} />
      <ZoomControls onFit={actions.zoomToFit} />
      <Minimap />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void actions.insertImages([...e.target.files]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
