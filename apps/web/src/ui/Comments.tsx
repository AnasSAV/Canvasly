import { colorForUser, worldToScreen, type CommentOp, type CommentThread } from '@canvasly/shared';
import { Check, MessageSquare, RotateCcw, Send, Trash, X } from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Board } from '../doc/board';
import { useBoard } from '../doc/context';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { panel } from './IconButton';

export function useThreads(board: Board): CommentThread[] {
  return useSyncExternalStore(board.comments.subscribe, board.comments.getThreads);
}

function useCommentError(board: Board): string | null {
  return useSyncExternalStore(board.comments.subscribe, () => board.comments.error);
}

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ms).toLocaleDateString();
}

const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? '?';

/** Comment input: Enter sends, Shift+Enter adds a line, Esc cancels. */
function Composer({
  placeholder,
  onSend,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  onSend: (text: string) => boolean;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [offline, setOffline] = useState(false);
  const send = () => {
    if (!text.trim()) return;
    if (onSend(text.trim())) setText('');
    else setOffline(true);
  };
  return (
    <div>
      <div className="flex items-end gap-1.5">
        <textarea
          autoFocus={autoFocus}
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape') onCancel?.();
          }}
          className="min-h-9 flex-1 resize-none rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
          data-testid="comment-input"
        />
        <button
          type="button"
          aria-label="Send comment"
          onClick={send}
          className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700"
        >
          <Send size={14} />
        </button>
      </div>
      {offline && <p className="mt-1 text-xs text-red-600">You're offline — comments need a connection.</p>}
    </div>
  );
}

function Popover({
  at,
  children,
  onClose,
}: {
  at: { x: number; y: number };
  children: ReactNode;
  onClose: () => void;
}) {
  const width = useViewport((s) => s.width);
  const height = useViewport((s) => s.height);
  // Keep clear of an open side panel (comments/frames list) on the right.
  const sidePanel = useUI((s) => s.commentsPanel || s.framesPanel || s.layersPanel);
  const left = Math.min(Math.max(8, at.x + 18), Math.max(8, width - 328 - (sidePanel ? 300 : 0)));
  const top = Math.min(Math.max(8, at.y - 20), Math.max(8, height - 360));
  return (
    <div
      className={`${panel} pointer-events-auto absolute w-80 p-3`}
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="comment-popover"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-2 right-2 rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
      >
        <X size={14} />
      </button>
      {children}
    </div>
  );
}

function ThreadView({ thread, onClose }: { thread: CommentThread; onClose: () => void }) {
  const board = useBoard();
  const readOnly = useUI((s) => s.readOnly);
  const me = board.presence.user.id;
  const canComment = !board.anonymous;
  const send = (op: CommentOp) => board.comments.send(op);
  const error = useCommentError(board);
  return (
    <>
      <div className="mb-2 flex items-center gap-2 pr-6">
        <span className="text-xs font-semibold text-gray-500 uppercase dark:text-zinc-400">
          {thread.resolved ? 'Resolved' : 'Comment'}
        </span>
        {canComment && (
          <button
            type="button"
            onClick={() => send({ op: 'resolve', threadId: thread.id, resolved: !thread.resolved })}
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            data-testid="resolve-thread"
          >
            {thread.resolved ? <RotateCcw size={12} /> : <Check size={12} />}
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </button>
        )}
      </div>
      <ul className="mb-2 flex max-h-64 flex-col gap-2.5 overflow-y-auto">
        {thread.comments.map((c) => (
          <li key={c.id} className="group flex gap-2" data-testid="comment">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: colorForUser(c.authorId) }}
            >
              {initial(c.authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                <span className="font-medium text-gray-800 dark:text-zinc-200">{c.authorName}</span> ·{' '}
                {ago(c.createdAt)}
              </p>
              <p className="text-sm break-words whitespace-pre-wrap">{c.text}</p>
            </div>
            {canComment && (c.authorId === me || !readOnly) && (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => send({ op: 'delete', threadId: thread.id, commentId: c.id })}
                className="self-start rounded p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
              >
                <Trash size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canComment ? (
        <Composer
          placeholder="Reply…"
          onSend={(text) => send({ op: 'reply', threadId: thread.id, text })}
          onCancel={onClose}
        />
      ) : (
        <p className="text-xs text-gray-500">Sign in to reply.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  );
}

/** Comment pins, the new-comment composer and the open thread, positioned over the canvas. */
export function CommentsLayer() {
  const board = useBoard();
  const threads = useThreads(board);
  const camera = useViewport((s) => s.camera);
  const { showResolved, openThreadId, commentDraft, presenting, setOpenThread, setCommentDraft, setTool } =
    useUI();
  const showPins = usePrefs((s) => s.showComments);
  if (presenting !== null) return null;
  const open = threads.find((t) => t.id === openThreadId);
  const visible = showPins ? threads.filter((t) => !t.resolved || showResolved || t.id === openThreadId) : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      {visible.map((t) => {
        const s = worldToScreen(camera, t);
        const first = t.comments[0];
        return (
          <button
            key={t.id}
            type="button"
            aria-label={`Comment by ${first?.authorName ?? 'someone'}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOpenThread(t.id === openThreadId ? null : t.id)}
            className={`pointer-events-auto absolute flex h-8 min-w-8 -translate-y-full items-center justify-center gap-1 rounded-full rounded-bl-none border-2 border-white px-1.5 text-xs font-semibold text-white shadow-md ${
              t.resolved ? 'opacity-50' : ''
            } ${t.id === openThreadId ? 'ring-2 ring-indigo-500' : ''}`}
            style={{ left: s.x, top: s.y, background: first ? colorForUser(first.authorId) : '#6b7280' }}
            data-testid="comment-pin"
          >
            {first ? initial(first.authorName) : '?'}
            {t.comments.length > 1 && <span className="text-[10px] opacity-90">{t.comments.length}</span>}
          </button>
        );
      })}

      {commentDraft && (
        <>
          <span
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600 ring-4 ring-indigo-200"
            style={{
              left: worldToScreen(camera, commentDraft).x,
              top: worldToScreen(camera, commentDraft).y,
            }}
          />
          <Popover at={worldToScreen(camera, commentDraft)} onClose={() => setCommentDraft(null)}>
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase dark:text-zinc-400">
              New comment
            </p>
            <Composer
              autoFocus
              placeholder="Add a comment…"
              onCancel={() => setCommentDraft(null)}
              onSend={(text) => {
                const ok = board.comments.send({ op: 'create', x: commentDraft.x, y: commentDraft.y, text });
                if (ok) {
                  setCommentDraft(null);
                  setTool('select');
                }
                return ok;
              }}
            />
          </Popover>
        </>
      )}

      {open && (
        <Popover at={worldToScreen(camera, open)} onClose={() => setOpenThread(null)}>
          <ThreadView thread={open} onClose={() => setOpenThread(null)} />
        </Popover>
      )}
    </div>
  );
}

/** Side panel listing all threads; click one to jump to it. */
export function CommentsPanel() {
  const board = useBoard();
  const threads = useThreads(board);
  const { commentsPanel, toggleCommentsPanel, showResolved, setShowResolved, setOpenThread } = useUI();
  if (!commentsPanel) return null;
  const list = threads
    .filter((t) => showResolved || !t.resolved)
    .sort((a, b) => Number(a.resolved) - Number(b.resolved));
  return (
    <aside
      className={`${panel} absolute top-[72px] right-3 bottom-16 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col`}
      data-testid="comments-panel"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-zinc-700">
        <MessageSquare size={16} />
        <h2 className="text-sm font-semibold">Comments</h2>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 dark:text-zinc-300">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
        <button
          type="button"
          aria-label="Close comments"
          onClick={toggleCommentsPanel}
          className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <li className="p-4 text-center text-sm text-gray-500 dark:text-zinc-400">
            No comments yet. Press <kbd className="rounded border px-1">C</kbd> and click the board to add
            one.
          </li>
        )}
        {list.map((t) => {
          const first = t.comments[0];
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  useViewport.getState().centerOn(t);
                  setOpenThread(t.id);
                }}
                className={`w-full rounded-lg p-2 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 ${t.resolved ? 'opacity-60' : ''}`}
              >
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  <span className="font-medium text-gray-800 dark:text-zinc-200">{first?.authorName}</span>
                  {first && ` · ${ago(first.createdAt)}`}
                  {t.resolved && ' · resolved'}
                </p>
                <p className="line-clamp-2 text-sm">{first?.text}</p>
                {t.comments.length > 1 && (
                  <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">
                    {t.comments.length - 1} {t.comments.length === 2 ? 'reply' : 'replies'}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
