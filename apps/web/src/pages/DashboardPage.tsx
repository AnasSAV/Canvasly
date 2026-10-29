import { TEMPLATES, type BoardSummary, type TemplateId } from '@canvasly/shared';
import { LogOut, MoreHorizontal, Pencil, Plus, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, thumbnailUrl } from '../lib/api';
import { authClient, signOut } from '../lib/auth';
import { Link, navigate } from '../lib/router';
import { TemplatePicker } from '../ui/TemplatePicker';
import { ThemeToggle } from '../ui/ThemeToggle';

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
  ];
  let label = '';
  for (const [secs, name] of units) {
    if (s >= secs) {
      const n = Math.floor(s / secs);
      label = `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return s > 2_592_000 ? new Date(ms).toLocaleDateString() : label;
}

function BoardCard({
  board,
  onRename,
  onDelete,
}: {
  board: BoardSummary;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(board.title);
  const thumb = thumbnailUrl(board);

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== board.title) onRename(t);
    else setTitle(board.title);
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <Link
        to={`/b/${board.id}`}
        className="block aspect-[8/5] bg-gray-100 dark:bg-zinc-800"
        data-testid="board-card"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">Empty board</div>
        )}
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setTitle(board.title);
                  setEditing(false);
                }
              }}
              className="w-full rounded border border-indigo-400 px-1 text-sm font-medium outline-none"
            />
          ) : (
            <p className="truncate text-sm font-medium">{board.title}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-zinc-400">
            {board.role === 'owner' ? 'You' : board.ownerName} · edited {timeAgo(board.updatedAt)}
          </p>
        </div>
        {board.role === 'owner' && (
          <div className="relative">
            <button
              type="button"
              aria-label="Board options"
              onClick={() => setMenu((m) => !m)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div
                className="absolute right-0 bottom-8 z-10 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                onMouseLeave={() => setMenu(false)}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenu(false);
                    if (confirm(`Delete “${board.title}”? This can't be undone.`)) onDelete();
                  }}
                >
                  <Trash size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: session } = authClient.useSession();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api
      .listBoards()
      .then(setBoards)
      .catch((e: Error) => setError(e.message));
  }, []);

  const create = async (template: TemplateId) => {
    setCreating(true);
    try {
      const name = TEMPLATES.find((t) => t.id === template)?.name;
      const b = await api.createBoard({ template, title: template === 'blank' ? 'Untitled board' : name });
      navigate(`/b/${b.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  const rename = async (id: string, title: string) => {
    setBoards((bs) => bs?.map((b) => (b.id === id ? { ...b, title } : b)) ?? null);
    await api.renameBoard(id, { title }).catch((e: Error) => setError(e.message));
  };

  const remove = async (id: string) => {
    setBoards((bs) => bs?.filter((b) => b.id !== id) ?? null);
    await api.deleteBoard(id).catch((e: Error) => setError(e.message));
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:bg-zinc-900/90 dark:border-zinc-700">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-indigo-600" />
            <span className="font-semibold tracking-tight">Canvasly</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm text-gray-600 sm:inline dark:text-zinc-300">
              {session?.user.name}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Your boards</h1>
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            data-testid="new-board"
          >
            <Plus size={16} /> New board
          </button>
        </div>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {boards === null ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400">Loading…</p>
        ) : boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 py-20 text-center dark:border-zinc-600">
            <p className="mb-4 text-gray-600 dark:text-zinc-300">No boards yet.</p>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Create your first board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                onRename={(t) => void rename(b.id, t)}
                onDelete={() => void remove(b.id)}
              />
            ))}
          </div>
        )}
      </main>
      {picking && (
        <TemplatePicker busy={creating} onPick={(t) => void create(t)} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
