import { PresenceState, colorForUser, type PresenceViewport, type Vec } from '@canvasly/shared';
import { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

export interface Peer extends PresenceState {
  clientId: number;
}

export interface PresenceUser {
  id: string;
  name: string;
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Our presence (cursor, selection, viewport) published through Yjs awareness, and validated peers.
 * Setting fields is cheap: the provider sends only the latest state once per batch interval.
 */
export class Presence {
  readonly awareness: Awareness;
  private peers: Peer[] = [];
  private listeners = new Set<() => void>();

  constructor(
    doc: Y.Doc,
    readonly user: PresenceUser,
  ) {
    this.awareness = new Awareness(doc);
    const initial: PresenceState = {
      user: { id: user.id, name: user.name, color: colorForUser(user.id) },
      cursor: null,
      selection: [],
      viewport: null,
    };
    this.awareness.setLocalState(initial);
    this.awareness.on('change', this.onChange);
  }

  get color(): string {
    return colorForUser(this.user.id);
  }

  setCursor(p: Vec | null) {
    this.awareness.setLocalStateField('cursor', p && { x: round(p.x), y: round(p.y) });
  }

  setSelection(ids: string[]) {
    this.awareness.setLocalStateField('selection', ids.slice(0, 1000));
  }

  setViewport(v: PresenceViewport) {
    this.awareness.setLocalStateField('viewport', {
      x: round(v.x),
      y: round(v.y),
      zoom: v.zoom,
      w: Math.round(v.w),
      h: Math.round(v.h),
    });
  }

  // --- peers (useSyncExternalStore) ---
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getPeers = () => this.peers;
  getPeer(clientId: number): Peer | undefined {
    return this.peers.find((p) => p.clientId === clientId);
  }

  private onChange = ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    const self = this.awareness.clientID;
    if (![...added, ...updated, ...removed].some((id) => id !== self)) return;
    const next: Peer[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === self) return;
      const parsed = PresenceState.safeParse(state); // remote input: never trust it
      if (parsed.success) next.push({ ...parsed.data, clientId });
    });
    next.sort((a, b) => a.clientId - b.clientId);
    this.peers = next;
    this.listeners.forEach((l) => l());
  };

  destroy() {
    this.awareness.off('change', this.onChange);
    this.awareness.destroy();
  }
}
