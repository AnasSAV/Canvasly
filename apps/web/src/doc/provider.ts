import {
  CLOSE_ACCESS_REVOKED,
  CLOSE_BOARD_DELETED,
  MSG_AWARENESS,
  MSG_ROLE,
  MSG_SYNC,
  Role,
  SYNC_BATCH_MS,
} from '@canvasly/shared';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'denied';

const MAX_BACKOFF_MS = 10_000;

/**
 * Hand-rolled y-protocols client. Unlike y-websocket it batches local updates into at most one frame per
 * SYNC_BATCH_MS (incoming WebSocket messages count against the Durable Object request quota) and
 * reconnects with backoff. On every (re)connect both sides exchange state vectors, so edits made while
 * offline are sent automatically.
 */
export class SyncProvider {
  status: ConnectionStatus = 'connecting';
  role: Role | null = null;
  readonly synced: Promise<void>;

  private ws: WebSocket | null = null;
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 500;
  private destroyed = false;
  private resolveSynced!: () => void;
  private listeners = new Set<() => void>();

  constructor(
    private readonly doc: Y.Doc,
    private readonly url: string,
  ) {
    this.synced = new Promise((r) => (this.resolveSynced = r));
    doc.on('update', this.onDocUpdate);
    window.addEventListener('online', this.reconnectNow);
    this.connect();
  }

  /** Subscribe to status/role changes. */
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((l) => l());
  }

  private connect() {
    if (this.destroyed) return;
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 500;
      // The state-vector exchange below covers anything queued while disconnected.
      this.pending = [];
      this.send(this.message(MSG_SYNC, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
    };
    ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => this.onMessage(new Uint8Array(ev.data));
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === CLOSE_ACCESS_REVOKED || ev.code === CLOSE_BOARD_DELETED) {
        this.setStatus('denied');
        return;
      }
      this.setStatus('offline');
      this.scheduleReconnect();
    };
  }

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
      } else if (type === MSG_ROLE) {
        const role = Role.safeParse(decoding.readVarString(decoder));
        this.role = role.success ? role.data : null;
        this.listeners.forEach((l) => l());
      } else if (type === MSG_AWARENESS) {
        decoding.readVarUint8Array(decoder); // presence arrives in Phase 3
      } else {
        break;
      }
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.pending.push(update);
    this.flushTimer ??= setTimeout(this.flush, SYNC_BATCH_MS);
  };

  private flush = () => {
    this.flushTimer = null;
    if (!this.pending.length || this.ws?.readyState !== WebSocket.OPEN) return;
    const update = Y.mergeUpdates(this.pending);
    this.pending = [];
    this.send(this.message(MSG_SYNC, (e) => syncProtocol.writeUpdate(e, update)));
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
    this.flush();
    this.doc.off('update', this.onDocUpdate);
    window.removeEventListener('online', this.reconnectNow);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
