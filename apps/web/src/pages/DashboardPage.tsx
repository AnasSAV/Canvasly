import { TEMPLATES, colorForUser, type BoardListItem, type TemplateId } from '@canvasly/shared';
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
import { askConfirm } from '../state/feedback';
import { Logo } from '../ui/Logo';
import { MenuList } from '../ui/Menu';
import { Select } from '../ui/Select';
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

function Thumbnail({ board }: { board: BoardListItem }) {
  const thumb = thumbnailUrl(board);
  if (thumb) return <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />;
  return (
    <div className="dotgrid flex h-full items-center justify-center text-xs text-muted">Empty board</div>
  );
}

/** Who else can get at a board, in as few words as fit on a card. */
function SharingBadge({ board }: { board: BoardListItem }) {
  if (board.role !== 'owner') {
    return (
      <span className="badge" data-testid="board-badge">
        {board.role === 'viewer' ? 'Can view' : 'Can edit'}
      </span>
    );
  }
  const others = board.memberCount - 1;
  return (
    <>
      {others > 0 && (
        <span className="badge" data-tip={`Shared with ${others}`} data-testid="board-badge">
          <Users size={11} /> {others}
        </span>
      )}
      {board.linkRole === 'viewer' && (
        <span className="badge" data-tip="Anyone with the link can view" data-testid="board-badge">
          <Globe size={11} /> Public
        </span>
      )}
      {board.linkRole === 'editor' && (
        <span className="badge" data-tip="Anyone signed in with the link can edit" data-testid="board-badge">
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
      className="group relative rounded-[10px] border border-line bg-surface transition-colors duration-100 hover:border-teal focus-within:border-teal"
      data-testid="board-item"
    >
      <Link
        to={`/b/${board.id}`}
        className="block aspect-[16/10] overflow-hidden rounded-t-[9px] border-b border-line bg-sunken"
        data-testid="board-card"
      >
        <Thumbnail board={board} />
      </Link>
      {owner && (
        <button
          type="button"
          onClick={onShare}
          className="btn btn-sm btn-secondary absolute top-2 right-2 opacity-0 shadow-panel transition-opacity group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
          data-testid="board-share"
        >
          <UserPlus size={13} /> Share
        </button>
      )}
      <div className="flex items-start gap-1.5 py-2.5 pr-1.5 pl-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={title}
              aria-label="Board name"
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setTitle(board.title);
                  setEditing(false);
                }
              }}
              className="field field-sm -ml-1.5"
            />
          ) : (
            <p className="truncate text-sm font-semibold">{board.title}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted">
            {owner ? 'You' : board.ownerName} · {timeAgo(board.updatedAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden">
            <SharingBadge board={board} />
          </div>
        </div>
        {owner && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Board options"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="tile h-8! w-8! text-muted"
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div className="absolute right-0 bottom-9 z-10">
                <MenuList
                  onClose={() => setMenu(false)}
                  entries={[
                    { label: 'Share', icon: <UserPlus size={14} />, onSelect: onShare },
                    { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
                    'divider',
                    {
                      label: 'Delete',
                      icon: <Trash size={14} />,
                      danger: true,
                      onSelect: () => {
                        void askConfirm({
                          title: `Delete “${board.title}”?`,
                          body: "This removes the board for everyone it's shared with, and can't be undone.",
                          confirmLabel: 'Delete board',
                          danger: true,
                        }).then((ok) => ok && onDelete());
                      },
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function BoardSkeleton() {
  return (
    <div className="rounded-[10px] border border-line bg-surface" aria-hidden>
      <div className="skeleton aspect-[16/10] rounded-b-none" />
      <div className="p-3">
        <div className="skeleton h-3.5 w-2/3" />
        <div className="skeleton mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}

function Stat({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5 px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-[22px] leading-none font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function initials(name: string | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Who's signed in, and the way out. */
function AccountMenu({ user }: { user: { id: string; name: string; email: string } | undefined }) {
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
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ background: user ? colorForUser(user.id) : undefined }}
        data-testid="account-menu"
      >
        {initials(user?.name)}
      </button>
      {open && (
        <div className="panel pop absolute top-10 right-0 z-30 w-60 p-1">
          <div className="px-2 py-1.5">
            <p className="truncate text-[13px] font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <div className="hairline" />
          <button type="button" role="menuitem" className="menu-row" onClick={() => void signOut()}>
            <LogOut size={14} className="text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'mine' | 'shared';
type Sort = 'recent' | 'name' | 'created';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Last edited' },
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date created' },
];

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
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .listBoards()
      .then(setBoards)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [role="dialog"]')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  const user = session?.user;
  const firstName = user?.name.split(' ')[0];

  return (
    <div className="h-full overflow-y-auto bg-app">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 md:px-8">
          <span className="hidden sm:block">
            <Logo />
          </span>
          <span className="sm:hidden">
            <Logo compact />
          </span>
          <div className="relative mx-auto w-full max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
            />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards"
              aria-label="Search boards"
              className="field bg-sunken! pr-9 pl-8"
            />
            <span className="kbd absolute top-1/2 right-2 hidden -translate-y-1/2 sm:inline-flex">/</span>
          </div>
          <ThemeToggle />
          <AccountMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-16 md:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-5">
          <div>
            <h2 className="text-[28px] leading-tight font-semibold" data-testid="greeting">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {boards !== null && stats.total === 0
                ? 'Your space is ready. Start with a blank board or a template.'
                : 'Everything you and your team are working on, in one place.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={creating}
            className="btn btn-primary btn-lg"
            data-testid="new-board"
          >
            <Plus size={17} /> New board
          </button>
        </section>

        <section className={`grid gap-4 ${latest ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
          {latest && (
            <Link
              to={`/b/${latest.id}`}
              className="group flex overflow-hidden rounded-[10px] border border-line bg-surface transition-colors duration-100 hover:border-teal"
              data-testid="continue-board"
            >
              <div className="w-2/5 min-w-32 shrink-0 overflow-hidden border-r border-line bg-sunken">
                <Thumbnail board={latest} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-cta" /> Pick up where you left off
                </p>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-semibold">{latest.title}</p>
                    <p className="mt-0.5 text-xs text-muted">Edited {timeAgo(latest.updatedAt)}</p>
                  </div>
                  <ArrowRight
                    size={18}
                    className="shrink-0 text-muted transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-link"
                  />
                </div>
              </div>
            </Link>
          )}

          <div
            className="min-w-0 rounded-[10px] border border-line bg-surface p-3"
            aria-label="Start from a template"
            role="group"
          >
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <h2 className="font-sans text-[13px] font-semibold tracking-normal">Start from a template</h2>
              <button type="button" onClick={() => setPicking(true)} className="text-link text-xs">
                All {TEMPLATES.length - 1} templates
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FEATURED.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={creating}
                  onClick={() => void create(id)}
                  className="group w-28 shrink-0 text-left disabled:opacity-60 lg:w-auto lg:min-w-0 lg:flex-1"
                  data-testid={`quick-template-${id}`}
                >
                  <span className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-line transition-colors duration-100 group-hover:border-teal">
                    <TemplatePreview id={id} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted group-hover:text-fg">
                    {TEMPLATES.find((t) => t.id === id)?.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {stats.total > 0 && (
          <dl
            className="mt-4 grid grid-cols-2 divide-line rounded-[10px] border border-line bg-surface sm:grid-cols-4 sm:divide-x"
            data-testid="stats"
          >
            <Stat value={stats.total} label={stats.total === 1 ? 'Board' : 'Boards'} testId="stat-total" />
            <Stat value={stats.thisWeek} label="Edited this week" testId="stat-week" />
            <Stat value={stats.byYou} label="Shared by you" testId="stat-by-you" />
            <Stat value={stats.withYou} label="Shared with you" testId="stat-with-you" />
          </dl>
        )}

        <section className="mt-9">
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
            <h1 className="pb-2 text-lg font-semibold">Your boards</h1>
            <div className="flex gap-4" role="group" aria-label="Filter boards">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={filter === t.id}
                  onClick={() => setFilter(t.id)}
                  className={`-mb-px border-b-2 pb-2.5 text-[13px] font-medium transition-colors duration-100 ${
                    filter === t.id ? 'border-cta text-fg' : 'border-transparent text-muted hover:text-fg'
                  }`}
                  data-testid={`filter-${t.id}`}
                >
                  {t.label} <span className="num ml-0.5 text-[11px] text-muted">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="mb-1.5 ml-auto">
              <Select
                small
                label="Sort boards"
                value={sort}
                options={SORTS}
                onChange={setSort}
                testId="board-sort"
                className="min-w-32"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          {boards === null ? (
            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              aria-busy="true"
              aria-label="Loading boards"
            >
              {[0, 1, 2, 3].map((i) => (
                <BoardSkeleton key={i} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="dotgrid rounded-[10px] border border-dashed border-line-strong py-16 text-center">
              <p className="text-sm text-muted">
                {boards.length === 0 ? 'No boards yet. Pick a template above to start.' : 'No boards match.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
