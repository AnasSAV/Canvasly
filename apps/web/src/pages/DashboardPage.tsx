import { TEMPLATES, type BoardListItem, type TemplateId } from '@canvasly/shared';
import {
  ArrowRight,
  Globe,
  Link2,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, thumbnailUrl } from '../lib/api';
import { authClient, signOut } from '../lib/auth';
import { Link, navigate } from '../lib/router';
import { Logo } from '../ui/Logo';
import { ShareDialog } from '../ui/ShareDialog';
import { TemplatePicker } from '../ui/TemplatePicker';
import { TemplatePreview } from '../ui/TemplatePreview';
import { ThemeToggle } from '../ui/ThemeToggle';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const isSharedOut = (b: BoardListItem) => b.role === 'owner' && (b.memberCount > 1 || !!b.linkRole);

const menuItem =
  'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-zinc-700';

function Thumbnail({ board, large }: { board: BoardListItem; large?: boolean }) {
  const thumb = thumbnailUrl(board);
  if (thumb) return <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />;
  return (
    <div
      className={`flex h-full items-center justify-center text-gray-400 dark:text-zinc-500 ${
        large ? 'text-sm' : 'text-xs'
      }`}
    >
      Empty board
    </div>
  );
}

/** Who else can get at a board, in as few words as fit on a card. */
function SharingBadge({ board }: { board: BoardListItem }) {
  const badge =
    'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-zinc-800 dark:text-zinc-300';
  if (board.role !== 'owner') {
    return (
      <span className={badge} data-testid="board-badge">
        {board.role === 'viewer' ? 'Can view' : 'Can edit'}
      </span>
    );
  }
  const others = board.memberCount - 1;
  return (
    <>
      {others > 0 && (
        <span className={badge} title={`Shared with ${others}`} data-testid="board-badge">
          <Users size={11} /> {others}
        </span>
      )}
      {board.linkRole === 'viewer' && (
        <span className={badge} title="Anyone with the link can view" data-testid="board-badge">
          <Globe size={11} /> Public
        </span>
      )}
      {board.linkRole === 'editor' && (
        <span className={badge} title="Anyone signed in with the link can edit" data-testid="board-badge">
          <Link2 size={11} /> Link
        </span>
      )}
    </>
  );
}

function BoardCard({
  board,
  onRename,
  onDelete,
  onShare,
}: {
  board: BoardListItem;
  onRename: (title: string) => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(board.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const owner = board.role === 'owner';

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== board.title) onRename(t);
    else setTitle(board.title);
  };

  return (
    <article
      className="group relative rounded-2xl bg-white ring-1 ring-black/5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(5,0,56,0.1)] dark:bg-zinc-900 dark:ring-white/10"
      data-testid="board-item"
    >
      <Link
        to={`/b/${board.id}`}
        className="block aspect-[8/5] overflow-hidden rounded-t-2xl bg-gray-50 dark:bg-zinc-800"
        data-testid="board-card"
      >
        <Thumbnail board={board} />
      </Link>
      {owner && (
        <button
          type="button"
          onClick={onShare}
          className="absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-medium text-gray-800 opacity-0 shadow-sm ring-1 ring-black/5 transition-opacity group-hover:opacity-100 hover:text-indigo-600 focus:opacity-100 dark:bg-zinc-800/95 dark:text-zinc-100 dark:ring-white/10 [@media(hover:none)]:opacity-100"
          data-testid="board-share"
        >
          <UserPlus size={13} /> Share
        </button>
      )}
      <div className="flex items-start justify-between gap-2 p-3.5">
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
            <p className="truncate text-sm font-semibold">{board.title}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-zinc-400">
            {owner ? 'You' : board.ownerName} · {timeAgo(board.updatedAt)}
          </p>
          <div className="mt-2 flex min-h-5 flex-wrap gap-1 empty:hidden">
            <SharingBadge board={board} />
          </div>
        </div>
        {owner && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Board options"
              onClick={() => setMenu((m) => !m)}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div className="absolute right-0 bottom-8 z-10 w-36 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-zinc-800 dark:ring-white/10">
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => {
                    setMenu(false);
                    onShare();
                  }}
                >
                  <UserPlus size={14} /> Share
                </button>
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  className={`${menuItem} text-red-600 dark:text-red-400`}
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
    </article>
  );
}

function Stat({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </dd>
      <dt className="text-xs text-gray-500 dark:text-zinc-400">{label}</dt>
    </div>
  );
}

type Filter = 'all' | 'mine' | 'shared';
type Sort = 'recent' | 'name' | 'created';

/** The templates featured at the top; the rest are one click away. */
const FEATURED: TemplateId[] = ['kanban', 'flowchart', 'mindmap', 'retrospective', 'swot'];

export function DashboardPage() {
  const { data: session } = authClient.useSession();
  const [boards, setBoards] = useState<BoardListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api
      .listBoards()
      .then(setBoards)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

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

  const list = useMemo(() => boards ?? [], [boards]);
  const stats = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return {
      total: list.length,
      thisWeek: list.filter((b) => b.updatedAt >= since).length,
      withYou: list.filter((b) => b.role !== 'owner').length,
      byYou: list.filter(isSharedOut).length,
    };
  }, [list]);
  const latest = useMemo(
    () => list.reduce<BoardListItem | null>((a, b) => (!a || b.updatedAt > a.updatedAt ? b : a), null),
    [list],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = list.filter((b) => {
      if (filter === 'mine' && b.role !== 'owner') return false;
      if (filter === 'shared' && b.role === 'owner') return false;
      return !q || b.title.toLowerCase().includes(q);
    });
    return found.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title);
      if (sort === 'created') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [list, filter, sort, query]);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: list.length },
    { id: 'mine', label: 'Owned by me', count: list.length - stats.withYou },
    { id: 'shared', label: 'Shared with me', count: stats.withYou },
  ];
  const firstName = session?.user.name.split(' ')[0];

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-white/85 px-5 backdrop-blur-md md:px-8 dark:bg-zinc-950/85">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm items-center gap-2 rounded-full bg-gray-100 px-3.5 transition-colors focus-within:bg-gray-200/70 dark:bg-zinc-800/70 dark:focus-within:bg-zinc-800">
          <Search size={15} className="shrink-0 text-gray-500 dark:text-zinc-400" />
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
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void signOut()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 md:px-8">
        <section className="relative mt-2 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6 ring-1 ring-black/5 md:p-10 dark:from-indigo-500/15 dark:via-zinc-900 dark:to-sky-500/10 dark:ring-white/10">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_22rem]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" data-testid="greeting">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </h2>
              <p className="mt-2 max-w-md text-[15px] text-gray-600 dark:text-zinc-300">
                {boards !== null && stats.total === 0
                  ? 'Your space is ready. Start with a blank board or a template.'
                  : 'Everything you and your team are working on, in one place.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  disabled={creating}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  data-testid="new-board"
                >
                  <Plus size={17} /> New board
                </button>
              </div>
              {stats.total > 0 && (
                <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4" data-testid="stats">
                  <Stat
                    value={stats.total}
                    label={stats.total === 1 ? 'Board' : 'Boards'}
                    testId="stat-total"
                  />
                  <Stat value={stats.thisWeek} label="Edited this week" testId="stat-week" />
                  <Stat value={stats.byYou} label="Shared by you" testId="stat-by-you" />
                  <Stat value={stats.withYou} label="Shared with you" testId="stat-with-you" />
                </dl>
              )}
            </div>
            {latest && (
              <Link
                to={`/b/${latest.id}`}
                className="group block overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(5,0,56,0.1)] ring-1 ring-black/5 transition-transform duration-150 hover:-translate-y-0.5 dark:bg-zinc-900 dark:ring-white/10"
                data-testid="continue-board"
              >
                <div className="aspect-[8/4.5] overflow-hidden bg-gray-50 dark:bg-zinc-800">
                  <Thumbnail board={latest} large />
                </div>
                <div className="flex items-center gap-2 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                      Pick up where you left off
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold">{latest.title}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      Edited {timeAgo(latest.updatedAt)}
                    </p>
                  </div>
                  <ArrowRight
                    size={17}
                    className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600"
                  />
                </div>
              </Link>
            )}
          </div>
        </section>

        <section className="mt-10" aria-label="Start from a template">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Start from a template</h2>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-sm text-gray-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
            >
              All {TEMPLATES.length - 1} templates
            </button>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-2">
            {FEATURED.map((id) => (
              <button
                key={id}
                type="button"
                disabled={creating}
                onClick={() => void create(id)}
                className="group w-40 shrink-0 text-left disabled:opacity-60 lg:w-auto lg:flex-1"
                data-testid={`quick-template-${id}`}
              >
                <span className="block aspect-[4/3] w-full overflow-hidden rounded-xl ring-1 ring-black/5 transition-shadow group-hover:shadow-[0_6px_18px_rgba(5,0,56,0.12)] dark:ring-white/10">
                  <TemplatePreview id={id} />
                </span>
                <span className="mt-1.5 block truncate text-[13px] text-gray-700 dark:text-zinc-300">
                  {TEMPLATES.find((t) => t.id === id)?.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <h1 className="text-lg font-semibold tracking-tight">Your boards</h1>
            <div className="flex gap-1" role="group" aria-label="Filter boards">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={filter === t.id}
                  onClick={() => setFilter(t.id)}
                  className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                    filter === t.id
                      ? 'bg-gray-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                  data-testid={`filter-${t.id}`}
                >
                  {t.label} <span className="opacity-60">{t.count}</span>
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-zinc-400">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md bg-transparent py-1 font-medium text-gray-800 outline-none dark:text-zinc-200"
                data-testid="board-sort"
              >
                <option value="recent">Last edited</option>
                <option value="name">Name</option>
                <option value="created">Date created</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          {boards === null ? (
            <p className="text-sm text-gray-500 dark:text-zinc-400">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 py-14 text-center dark:border-zinc-700">
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
                  onShare={() => setSharing(b.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      {picking && (
        <TemplatePicker busy={creating} onPick={(t) => void create(t)} onClose={() => setPicking(false)} />
      )}
      {sharing && (
        <ShareDialog
          boardId={sharing}
          onClose={() => {
            setSharing(null);
            load(); // who it's shared with may have changed
          }}
        />
      )}
    </div>
  );
}
