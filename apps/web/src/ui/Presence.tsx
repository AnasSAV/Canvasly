import { worldToScreen } from '@canvasly/shared';
import { useBoard } from '../doc/context';
import type { Peer } from '../doc/presence';
import { usePeers } from '../hooks/usePresence';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { panel } from './IconButton';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** Other people's pointers, drawn in screen space over the canvas. */
export function RemoteCursors() {
  const board = useBoard();
  const peers = usePeers(board);
  const camera = useViewport((s) => s.camera);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      {peers.map((p) => {
        if (!p.cursor) return null;
        const s = worldToScreen(camera, p.cursor);
        return (
          <div
            key={p.clientId}
            className="absolute top-0 left-0"
            // Updates arrive ~20×/s; a short transition makes motion look continuous.
            style={{ transform: `translate(${s.x}px, ${s.y}px)`, transition: 'transform 80ms linear' }}
            data-testid="remote-cursor"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-sm">
              <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill={p.user.color} stroke="#fff" />
            </svg>
            <span
              className="absolute top-4 left-3 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow-sm"
              style={{ background: p.user.color }}
            >
              {p.user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({
  name,
  color,
  active,
  onClick,
  title,
}: {
  name: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      disabled={!onClick}
      className={`-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white first:ml-0 enabled:hover:z-10 enabled:hover:scale-110 ${
        active ? 'ring-2 ring-offset-1' : ''
      }`}
      style={{ background: color, ['--tw-ring-color' as string]: color }}
      data-testid="presence-avatar"
    >
      {initials(name)}
    </button>
  );
}

/** Who's here. Click someone to follow their view. Several tabs of the same person show once. */
export function PresenceAvatars() {
  const board = useBoard();
  const peers = usePeers(board);
  const following = useUI((s) => s.followingClientId);
  const setFollowing = useUI((s) => s.setFollowing);

  const byUser = new Map<string, Peer>();
  for (const p of peers)
    if (p.user.id !== board.presence.user.id && !byUser.has(p.user.id)) byUser.set(p.user.id, p);
  // Other tabs of our own account still count as "someone" worth following.
  const ownOtherTabs = peers.filter((p) => p.user.id === board.presence.user.id);
  const others = [...byUser.values(), ...ownOtherTabs.slice(0, 1)];
  const shown = others.slice(0, 5);

  return (
    <div className={`${panel} flex h-11 items-center gap-1 px-2`} data-testid="presence">
      <Avatar
        name={board.presence.user.name}
        color={board.presence.color}
        title={`${board.presence.user.name} (you)`}
      />
      {shown.map((p) => {
        const isSelf = p.user.id === board.presence.user.id;
        const label = isSelf ? `${p.user.name} (another tab)` : p.user.name;
        const active = following === p.clientId;
        return (
          <Avatar
            key={p.clientId}
            name={p.user.name}
            color={p.user.color}
            active={active}
            title={active ? `Stop following ${label}` : `Follow ${label}`}
            onClick={() => setFollowing(active ? null : p.clientId)}
          />
        );
      })}
      {others.length > shown.length && (
        <span className="ml-1 text-xs text-gray-500">+{others.length - shown.length}</span>
      )}
    </div>
  );
}

/** Colored frame + banner while following someone. */
export function FollowBanner() {
  const board = useBoard();
  const peers = usePeers(board);
  const following = useUI((s) => s.followingClientId);
  const setFollowing = useUI((s) => s.setFollowing);
  const peer = peers.find((p) => p.clientId === following);
  if (!peer) return null;
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-20 border-[3px]"
        style={{ borderColor: peer.user.color }}
      />
      <div
        className="absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white shadow"
        style={{ background: peer.user.color }}
        data-testid="follow-banner"
      >
        Following {peer.user.name}
        <button
          type="button"
          className="rounded-full bg-white/25 px-2 py-0.5 text-xs hover:bg-white/40"
          onClick={() => setFollowing(null)}
        >
          Stop
        </button>
      </div>
    </>
  );
}
