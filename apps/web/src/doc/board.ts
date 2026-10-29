import { getObjectsMap, type YObjects } from '@canvasly/shared';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { DocStore } from './store';

/** Transaction origin for edits made by this client; only these are undoable. */
export const LOCAL_ORIGIN = { local: true };

const CAPTURE_TIMEOUT = 400;

/** One open board: its Y.Doc, plain-object store, undo manager and local persistence. */
export class Board {
  readonly doc = new Y.Doc();
  readonly objects: YObjects = getObjectsMap(this.doc);
  readonly store: DocStore;
  readonly undo: Y.UndoManager;
  readonly persistence: IndexeddbPersistence;
  readonly ready: Promise<void>;

  constructor(readonly id: string) {
    this.persistence = new IndexeddbPersistence(`canvasly-board-${id}`, this.doc);
    this.store = new DocStore(this.objects);
    this.undo = new Y.UndoManager(this.objects, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: CAPTURE_TIMEOUT,
    });
    this.ready = this.persistence.whenSynced.then(() => undefined);
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
    this.store.dispose();
    this.undo.destroy();
    void this.persistence.destroy();
    this.doc.destroy();
  }
}
