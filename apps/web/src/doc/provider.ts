import {
  CLOSE_ACCESS_REVOKED,
  CLOSE_BOARD_DELETED,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  CommentEvent,
  MSG_AWARENESS,
  MSG_COMMENTS,
  MSG_ROLE,
  MSG_SYNC,
  Role,
  SYNC_BATCH_MS,
} from '@canvasly/shared';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { CommentsStore } from './comments';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'denied';

const MAX_BACKOFF_MS = 10_000;
/** Half-open connections (laptop sleep, Wi-Fi switch) are detected by an app-level ping. */
const HEARTBEAT_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Hand-rolled y-protocols client for the board's Durable Object.
 *
 * - Batching: local doc updates and our presence are coalesced into at most one frame per SYNC_BATCH_MS
 *   (~20/s), because incoming WebSocket messages count against the Durable Object request quota.
 *   Cursor moves therefore cost nothing extra beyond the frame they ride in.
 * - Offline: on every (re)connect both sides exchange state vectors, so edits made while disconnected
 *   (also persisted in IndexedDB) are sent automatically.
 * - Presence: remote states are dropped when we disconnect; we re-announce ourselves whenever a new
 *   peer appears so newcomers see us immediately even if the server's in-memory presence was evicted.
 */
export class SyncProvider {
  status: ConnectionStatus = 'connecting';
  role: Role | null = null;
  readonly synced: Promise<void>;

  private ws: WebSocket | null = null;
  private pending: Uint8Array[] = [];
  private awarenessDirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 500;
  private destroyed = false;
  private resolveSynced!: () => void;
  private listeners = new Set<() => void>();

  constructor(
    private readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
    private readonly url: string,
    private readonly comments: CommentsStore,
  ) {
    this.synced = new Promise((r) => (this.resolveSynced = r));
    comments.send = (op) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return false;
      this.send(this.message(MSG_COMMENTS, (e) => encoding.writeVarString(e, JSON.stringify(op))));
      return true;
    };
    doc.on('update', this.onDocUpdate);
    awareness.on('update', this.onAwarenessUpdate);
    window.addEventListener('online', this.reconnectNow);
    window.addEventListener('offline', this.dropConnection);
    this.connect();
  }

  /** Subscribe to status/role changes. */
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  // --- connection lifecycle ---

  private connect() {
    if (this.destroyed) return;
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 500;
      // The state-vector exchange covers anything queued while disconnected.
      this.pending = [];
      this.awarenessDirty = true;
      this.send(this.message(MSG_SYNC, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
      this.flush();
      this.startHeartbeat();
    };
    ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => {
      if (typeof ev.data === 'string') {
        if (ev.data === HEARTBEAT_PONG && this.pongTimer) clearTimeout(this.pongTimer);
        return;
      }
      this.onMessage(new Uint8Array(ev.data));
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.onDisconnected();
      if (ev.code === CLOSE_ACCESS_REVOKED || ev.code === CLOSE_BOARD_DELETED) {
        this.setStatus('denied');
        return;
      }
      this.setStatus('offline');
      this.scheduleReconnect();
    };
  }

  private onDisconnected() {
    this.ws = null;
    this.stopHeartbeat();
    // Everyone else's cursors are stale now; they come back with the next sync.
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(HEARTBEAT_PING);
      this.pongTimer = setTimeout(this.dropConnection, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.heartbeatTimer = this.pongTimer = null;
  }

  /** Treat the socket as dead now (browser went offline / missed heartbeat) instead of waiting for TCP. */
  private dropConnection = () => {
    const ws = this.ws;
    if (!ws) return;
    ws.onclose = null;
    ws.close();
    this.onDisconnected();
    this.setStatus('offline');
    this.scheduleReconnect();
  };

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = this.backoff * (0.75 + Math.random() * 0.5);
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private reconnectNow = () => {
    if (this.ws || this.destroyed || this.status === 'denied') return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.backoff = 500;
    this.connect();
  };

  // --- incoming ---

  private onMessage(data: Uint8Array) {
    const decoder = decoding.createDecoder(data);
    while (decoding.hasContent(decoder)) {
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        const reply = encoding.createEncoder();
        encoding.writeVarUint(reply, MSG_SYNC);
        const sub = syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
        if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply));
        if (sub === syncProtocol.messageYjsSyncStep2) {
          this.setStatus('online');
          this.resolveSynced();
        }
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
      } else if (type === MSG_COMMENTS) {
        const event = CommentEvent.safeParse(JSON.parse(decoding.readVarString(decoder)));
        if (event.success) this.comments.apply(event.data);
      } else if (type === MSG_ROLE) {
        const role = Role.safeParse(decoding.readVarString(decoder));
        this.role = role.success ? role.data : null;
        this.emit();
      } else {
        break;
      }
    }
  }

  // --- outgoing (batched) ---

  private schedule() {
    this.flushTimer ??= setTimeout(this.flush, SYNC_BATCH_MS);
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.pending.push(update);
    this.schedule();
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const self = this.doc.clientID;
    if (origin === this) {
      // A peer we didn't know about: tell them about us right away.
      if (added.some((id) => id !== self)) {
        this.awarenessDirty = true;
        this.schedule();
      }
      return;
    }
    if ([...added, ...updated, ...removed].includes(self)) {
      this.awarenessDirty = true;
      this.schedule();
    }
  };

  private flush = () => {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const e = encoding.createEncoder();
    if (this.pending.length) {
      const update = Y.mergeUpdates(this.pending);
      this.pending = [];
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, update);
    }
    if (this.awarenessDirty) {
      this.awarenessDirty = false;
      encoding.writeVarUint(e, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        e,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
      );
    }
    if (encoding.length(e) > 0) this.send(encoding.toUint8Array(e));
  };

  private message(type: number, write: (e: encoding.Encoder) => void) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, type);
    write(e);
    return encoding.toUint8Array(e);
  }

  private send(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data as Uint8Array<ArrayBuffer>);
  }

  destroy() {
    this.destroyed = true;
    // Announce that we left, then send whatever is still queued.
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    this.flush();
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    window.removeEventListener('online', this.reconnectNow);
    window.removeEventListener('offline', this.dropConnection);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}
