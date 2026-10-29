import { getObjectsMap, type YObjects } from '@canvasly/shared';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { Presence, type PresenceUser } from './presence';
import { SyncProvider } from './provider';
import { DocStore } from './store';

/** Transaction origin for edits made by this client; only these are undoable. */
export const LOCAL_ORIGIN = { local: true };

const CAPTURE_TIMEOUT = 400;
/** If the server hasn't answered by then, open the board from the local cache. */
const OFFLINE_OPEN_AFTER_MS = 3_000;

/**
 * One open board: its Y.Doc, plain-object store, undo manager, presence, IndexedDB cache and (when given a
 * URL) the WebSocket connection to the board's Durable Object.
 *
 * Undo is per user: the UndoManager only tracks transactions with LOCAL_ORIGIN, so remote edits (applied
 * with the provider as origin) are never undone by someone else, and undoing your change doesn't revert
 * concurrent changes made by others.
 */
export class Board {
  readonly doc = new Y.Doc();
  readonly objects: YObjects = getObjectsMap(this.doc);
  readonly store: DocStore;
  readonly undo: Y.UndoManager;
  readonly persistence: IndexeddbPersistence;
  readonly presence: Presence;
  readonly provider: SyncProvider | null;
  readonly ready: Promise<void>;

  constructor(
    readonly id: string,
    socketUrl: string | null,
    user: PresenceUser,
  ) {
    this.persistence = new IndexeddbPersistence(`canvasly-board-${id}`, this.doc);
    this.store = new DocStore(this.objects);
    this.undo = new Y.UndoManager(this.objects, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    });
    this.presence = new Presence(this.doc, user);
    this.provider = socketUrl ? new SyncProvider(this.doc, this.presence.awareness, socketUrl) : null;
    const cached = this.persistence.whenSynced.then(() => undefined);
    this.ready = this.provider
      ? Promise.race([
          this.provider.synced,
          cached.then(() => new Promise<void>((r) => setTimeout(r, OFFLINE_OPEN_AFTER_MS))),
        ])
      : cached;
  }

  private inGesture = false;

  /**
   * Run a local, undoable change. Continuous edits (typing, nudging) made within the capture timeout
   * merge into one undo step; `discrete` actions (create, delete, restyle, reorder…) always get their
   * own step, however quickly they follow the previous one.
   */
  transact(fn: () => void, discrete = false) {
    const split = discrete && !this.inGesture;
    if (split) this.undo.stopCapturing();
    this.doc.transact(fn, LOCAL_ORIGIN);
    if (split) this.undo.stopCapturing();
  }

  /** Start a drag/resize/draw gesture: everything until endGesture() becomes one undo step. */
  beginGesture() {
    this.undo.stopCapturing();
    this.undo.captureTimeout = Number.POSITIVE_INFINITY;
    this.inGesture = true;
  }

  endGesture() {
    this.inGesture = false;
    this.undo.captureTimeout = CAPTURE_TIMEOUT;
    this.undo.stopCapturing();
  }

  destroy() {
    this.provider?.destroy();
    this.presence.destroy();
    this.store.dispose();
    this.undo.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }
}
