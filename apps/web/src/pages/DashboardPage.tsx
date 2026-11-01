import { TEMPLATES, type BoardSummary, type TemplateId } from '@canvasly/shared';
import { LayoutGrid, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash, User, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, thumbnailUrl } from '../lib/api';
import { authClient, signOut } from '../lib/auth';
import { Link, navigate } from '../lib/router';
import { Logo } from '../ui/Logo';
import { TemplatePicker } from '../ui/TemplatePicker';
import { TemplatePreview } from '../ui/TemplatePreview';
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
    <div className="group relative rounded-xl bg-white shadow-[0_1px_4px_rgba(5,0,56,0.1)] transition-shadow hover:shadow-[0_4px_16px_rgba(5,0,56,0.16)] dark:bg-zinc-900">
      <Link
        to={`/b/${board.id}`}
        className="block aspect-[8/5] overflow-hidden rounded-t-xl bg-gray-100 dark:bg-zinc-800"
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
              className="w-full rounded border border-indigo-400 px-1 text-sm font-medium outline-none dark:bg-zinc-800"
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
                className="absolute right-0 bottom-8 z-10 w-36 rounded-lg bg-white py-1 shadow-lg dark:bg-zinc-800"
                onMouseLeave={() => setMenu(false)}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-zinc-700"
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-zinc-700"
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

type Filter = 'all' | 'mine' | 'shared';

const NAV: { id: Filter; label: string; icon: ReactNode }[] = [
  { id: 'all', label: 'All boards', icon: <LayoutGrid size={17} /> },
  { id: 'mine', label: 'Owned by me', icon: <User size={17} /> },
  { id: 'shared', label: 'Shared with me', icon: <Users size={17} /> },
];

/** The templates featured in the strip at the top; the rest are one click away. */
const FEATURED: TemplateId[] = ['kanban', 'flowchart', 'mindmap', 'retrospective', 'swot'];

export function DashboardPage() {
  const { data: session } = authClient.useSession();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (boards ?? []).filter((b) => {
      if (filter === 'mine' && b.role !== 'owner') return false;
      if (filter === 'shared' && b.role === 'owner') return false;
      return !q || b.title.toLowerCase().includes(q);
    });
  }, [boards, filter, query]);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-white px-4 shadow-[0_1px_0_rgba(5,0,56,0.08)] dark:bg-zinc-900">
        <Logo />
        <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-lg bg-gray-100 px-3 dark:bg-zinc-800">
          <Search size={16} className="shrink-0 text-gray-500 dark:text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards"
            aria-label="Search boards"
            className="h-9 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <ThemeToggle />
        <span className="hidden text-sm whitespace-nowrap text-gray-600 sm:inline dark:text-zinc-300">
          {session?.user.name}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-0.5 p-3 md:flex" aria-label="Boards">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-pressed={filter === n.id}
              onClick={() => setFilter(n.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
                filter === n.id
                  ? 'bg-indigo-100 font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'text-gray-700 hover:bg-gray-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <section className="mb-8">
            <div className="flex gap-4 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={creating}
                className="group flex max-w-48 min-w-36 flex-1 flex-col text-left disabled:opacity-60"
                data-testid="new-board"
              >
                <span className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors group-hover:bg-indigo-700">
                  <Plus size={30} />
                </span>
                <span className="mt-2 text-sm font-medium">New board</span>
              </button>
              {FEATURED.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={creating}
                  onClick={() => void create(id)}
                  className="group flex max-w-48 min-w-36 flex-1 flex-col text-left disabled:opacity-60"
                  data-testid={`quick-template-${id}`}
                >
                  <span className="block aspect-[4/3] w-full overflow-hidden rounded-xl shadow-[0_1px_4px_rgba(5,0,56,0.1)] transition-shadow group-hover:shadow-[0_4px_16px_rgba(5,0,56,0.16)]">
                    <TemplatePreview id={id} />
                  </span>
                  <span className="mt-2 truncate text-sm font-medium">
                    {TEMPLATES.find((t) => t.id === id)?.name}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="group flex max-w-48 min-w-36 flex-1 flex-col text-left"
              >
                <span className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 group-hover:border-indigo-400 group-hover:text-indigo-600 dark:border-zinc-600 dark:text-zinc-400">
                  All templates
                </span>
                <span className="mt-2 text-sm font-medium">{TEMPLATES.length - 1} templates</span>
              </button>
            </div>
          </section>

          <h1 className="mb-4 text-xl font-semibold tracking-tight">Your boards</h1>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          {boards === null ? (
            <p className="text-sm text-gray-500 dark:text-zinc-400">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-zinc-700">
              <p className="text-sm text-gray-600 dark:text-zinc-300">
                {boards.length === 0 ? 'No boards yet. Pick a template above to start.' : 'No boards match.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((b) => (
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
      </div>
      {picking && (
        <TemplatePicker busy={creating} onPick={(t) => void create(t)} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
