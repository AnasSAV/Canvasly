import { getObjectsMap, type YObjects } from '@canvasly/shared';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { CommentsStore } from './comments';
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
  readonly comments = new CommentsStore();
  readonly provider: SyncProvider | null;
  readonly ready: Promise<void>;
  /** Base URL for this board's images: /api/boards/:id, or /api/public/:token for public links. */
  readonly assetBase: string;
  readonly anonymous: boolean;
  /**
   * Viewers can't edit. The server drops their updates anyway; refusing them locally keeps the UI from
   * showing changes that will never sync.
   */
  readOnly = false;

  constructor(
    readonly id: string,
    opts: { socketUrl: string | null; user: PresenceUser; assetBase: string; anonymous?: boolean },
  ) {
    const { socketUrl, user } = opts;
    this.assetBase = opts.assetBase;
    this.anonymous = !!opts.anonymous;
    // Anonymous visitors get a separate cache namespace (and nothing is shared with signed-in sessions).
    this.persistence = new IndexeddbPersistence(
      `canvasly-board-${this.anonymous ? 'public-' : ''}${id}`,
      this.doc,
    );
    this.store = new DocStore(this.objects);
    this.undo = new Y.UndoManager(this.objects, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    });
    this.presence = new Presence(this.doc, user);
    this.provider = socketUrl
      ? new SyncProvider(this.doc, this.presence.awareness, socketUrl, this.comments)
      : null;
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
    if (this.readOnly) return;
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
