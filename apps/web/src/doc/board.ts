import { getObjectsMap, type YObjects } from '@canvasly/shared';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SyncProvider } from './provider';
import { DocStore } from './store';

/** Transaction origin for edits made by this client; only these are undoable. */
export const LOCAL_ORIGIN = { local: true };

const CAPTURE_TIMEOUT = 400;
/** If the server hasn't answered by then, open the board from the local cache. */
const OFFLINE_OPEN_AFTER_MS = 3_000;

/**
 * One open board: its Y.Doc, plain-object store, undo manager, IndexedDB cache and (when given a URL)
 * the WebSocket connection to the board's Durable Object.
 */
export class Board {
  readonly doc = new Y.Doc();
  readonly objects: YObjects = getObjectsMap(this.doc);
  readonly store: DocStore;
  readonly undo: Y.UndoManager;
  readonly persistence: IndexeddbPersistence;
  readonly provider: SyncProvider | null;
  readonly ready: Promise<void>;

  constructor(
    readonly id: string,
    socketUrl: string | null,
  ) {
    this.persistence = new IndexeddbPersistence(`canvasly-board-${id}`, this.doc);
    this.store = new DocStore(this.objects);
    this.undo = new Y.UndoManager(this.objects, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    });
    this.provider = socketUrl ? new SyncProvider(this.doc, socketUrl) : null;
    const cached = this.persistence.whenSynced.then(() => undefined);
    this.ready = this.provider
      ? Promise.race([
          this.provider.synced,
          cached.then(() => new Promise<void>((r) => setTimeout(r, OFFLINE_OPEN_AFTER_MS))),
        ])
      : cached;
  }

  transact(fn: () => void) {
    this.doc.transact(fn, LOCAL_ORIGIN);
  }

  /** Start a drag/resize/draw gesture: everything until endGesture() becomes one undo step. */
  beginGesture() {
    this.undo.stopCapturing();
    this.undo.captureTimeout = Number.POSITIVE_INFINITY;
  }

  endGesture() {
    this.undo.captureTimeout = CAPTURE_TIMEOUT;
    this.undo.stopCapturing();
  }

  destroy() {
    this.provider?.destroy();
    this.store.dispose();
    this.undo.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }
}
