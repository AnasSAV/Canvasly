import { CLOSE_BOARD_DELETED, MSG_AWARENESS, MSG_ROLE, MSG_SYNC, Role, can, newId } from '@canvasly/shared';
import { DurableObject } from 'cloudflare:workers';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { decodeAwarenessUpdate, encodeAwarenessUpdate, type AwarenessEntry } from './awareness';
import { DocStorage } from './storage';

/** Per-socket state; serialized onto the WebSocket so it survives hibernation. */
interface Conn {
  userId: string;
  name: string;
  role: Role;
  /** Awareness client ids announced on this socket -> clock when first seen. */
  awareness: Record<number, number>;
}

/** Persist at most every 2 s while edits keep coming, and never later than 10 s after the first one. */
const FLUSH_DEBOUNCE_MS = 2_000;
const FLUSH_MAX_WAIT_MS = 10_000;

export const TRUSTED_HEADERS = {
  userId: 'x-canvasly-user-id',
  userName: 'x-canvasly-user-name',
  role: 'x-canvasly-role',
} as const;

function message(type: number, write: (e: encoding.Encoder) => void): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, type);
  write(e);
  return encoding.toUint8Array(e);
}

function send(ws: WebSocket, data: Uint8Array) {
  try {
    ws.send(data);
  } catch {
    // Socket already closing; its close handler cleans up.
  }
}

/**
 * One instance per board. Holds the board's Y.Doc in memory while anyone is connected, relays sync and
 * awareness between sockets, enforces roles (viewers' document updates are dropped here, not just in the
 * UI) and persists to SQLite in debounced batches rather than on every keystroke.
 *
 * Uses the WebSocket Hibernation API: when the room is idle the object is evicted from memory without
 * dropping connections, and the constructor reloads the doc from SQLite when the next message arrives.
 */
export class BoardRoom extends DurableObject<Env> {
  private readonly doc = new Y.Doc();
  private readonly storage: DocStorage;
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private firstPendingAt = 0;
  /** Latest awareness entry per client id (memory only; clients renew every ~15 s). */
  private awareness = new Map<number, AwarenessEntry>();
  private deleted = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = new DocStorage(ctx.storage);
    this.storage.load(this.doc);
    this.doc.on('update', this.onDocUpdate);
  }

  // --- connections ---

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('Expected WebSocket', { status: 426 });
    const role = Role.safeParse(request.headers.get(TRUSTED_HEADERS.role));
    const userId = request.headers.get(TRUSTED_HEADERS.userId);
    if (!role.success || !userId) return new Response('Forbidden', { status: 403 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const conn: Conn = {
      userId,
      name: decodeURIComponent(request.headers.get(TRUSTED_HEADERS.userName) ?? ''),
      role: role.data,
      awareness: {},
    };
    server.serializeAttachment(conn);

    send(
      server,
      message(MSG_ROLE, (e) => encoding.writeVarString(e, conn.role)),
    );
    send(
      server,
      message(MSG_SYNC, (e) => syncProtocol.writeSyncStep1(e, this.doc)),
    );
    if (this.awareness.size) {
      const update = encodeAwarenessUpdate([...this.awareness.values()]);
      send(
        server,
        message(MSG_AWARENESS, (e) => encoding.writeVarUint8Array(e, update)),
      );
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: ArrayBuffer | string): Promise<void> {
    if (typeof data === 'string') return;
    const conn = ws.deserializeAttachment() as Conn;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      while (decoding.hasContent(decoder)) {
        const type = decoding.readVarUint(decoder);
        if (type === MSG_SYNC) this.handleSync(ws, conn, decoder);
        else if (type === MSG_AWARENESS) this.handleAwareness(ws, conn, decoding.readVarUint8Array(decoder));
        else break; // unknown message type: ignore the rest of the frame
      }
    } catch (err) {
      console.warn('Closing socket after malformed message', err);
      ws.close(1003, 'Malformed message');
    }
  }

  private handleSync(ws: WebSocket, conn: Conn, decoder: decoding.Decoder) {
    const sub = decoding.readVarUint(decoder);
    if (sub === syncProtocol.messageYjsSyncStep1) {
      // Everyone may read: answer with whatever the client is missing.
      send(
        ws,
        message(MSG_SYNC, (e) => syncProtocol.readSyncStep1(decoder, e, this.doc)),
      );
      return;
    }
    const update = decoding.readVarUint8Array(decoder);
    if (!can(conn.role, 'edit')) return; // enforced server-side: viewers can't change the doc
    Y.applyUpdate(this.doc, update, ws);
  }

  private handleAwareness(ws: WebSocket, conn: Conn, update: Uint8Array) {
    let changedConn = false;
    for (const entry of decodeAwarenessUpdate(update)) {
      if (entry.state === 'null') this.awareness.delete(entry.clientId);
      else this.awareness.set(entry.clientId, entry);
      if (!(entry.clientId in conn.awareness)) {
        conn.awareness[entry.clientId] = entry.clock;
        changedConn = true;
      }
    }
    if (changedConn) ws.serializeAttachment(conn);
    const msg = message(MSG_AWARENESS, (e) => encoding.writeVarUint8Array(e, update));
    for (const other of this.ctx.getWebSockets()) if (other !== ws) send(other, msg);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.onDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.onDisconnect(ws);
  }

  private onDisconnect(ws: WebSocket) {
    const conn = ws.deserializeAttachment() as Conn | null;
    if (conn) {
      // Tell everyone this socket's cursors/presence are gone.
      const removed: AwarenessEntry[] = Object.entries(conn.awareness).map(([id, firstClock]) => {
        const clientId = Number(id);
        const clock = (this.awareness.get(clientId)?.clock ?? firstClock) + 1;
        this.awareness.delete(clientId);
        return { clientId, clock, state: 'null' };
      });
      if (removed.length) {
        const msg = message(MSG_AWARENESS, (e) =>
          encoding.writeVarUint8Array(e, encodeAwarenessUpdate(removed)),
        );
        for (const other of this.ctx.getWebSockets()) if (other !== ws) send(other, msg);
      }
    }
    const others = this.ctx.getWebSockets().filter((s) => s !== ws);
    if (others.length === 0) this.flush();
  }

  // --- document updates & persistence ---

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    const msg = message(MSG_SYNC, (e) => syncProtocol.writeUpdate(e, update));
    for (const ws of this.ctx.getWebSockets()) if (ws !== origin) send(ws, msg);
    this.pending.push(update);
    this.scheduleFlush();
  };

  private scheduleFlush() {
    const now = Date.now();
    if (!this.firstPendingAt) this.firstPendingAt = now;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    // A pending timer also keeps the object from hibernating before the data is written.
    const wait = Math.min(FLUSH_DEBOUNCE_MS, this.firstPendingAt + FLUSH_MAX_WAIT_MS - now);
    this.flushTimer = setTimeout(() => this.flush(), Math.max(0, wait));
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.firstPendingAt = 0;
    if (!this.pending.length || this.deleted) return;
    const merged = Y.mergeUpdates(this.pending);
    this.pending = [];
    if (this.storage.append(merged)) this.storage.compact(this.doc);
  }

  // --- RPC from the Worker ---

  async putAsset(mime: string, data: ArrayBuffer, userId: string): Promise<string> {
    const id = newId();
    this.storage.putAsset(id, mime, data, userId);
    return id;
  }

  async getAsset(id: string): Promise<{ mime: string; data: ArrayBuffer } | null> {
    return this.storage.getAsset(id);
  }

  /** Board deleted: disconnect everyone and wipe all storage for this object. */
  async destroy(): Promise<void> {
    this.deleted = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(CLOSE_BOARD_DELETED, 'Board deleted');
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAll();
  }
}
