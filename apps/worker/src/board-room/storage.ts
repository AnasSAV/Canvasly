import * as Y from 'yjs';

/** DO SQLite rows max out at 2 MB, so snapshots are split into chunks well under that. */
export const CHUNK_BYTES = 1_000_000;
/** Fold the update log into a fresh snapshot once it grows past either limit. */
const COMPACT_ROWS = 200;
const COMPACT_BYTES = 1_000_000;

export function chunkBytes(bytes: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** SQL bindings want a standalone ArrayBuffer, not a view into a larger one. */
export const toArrayBuffer = (u: Uint8Array): ArrayBuffer =>
  (u.byteOffset === 0 && u.byteLength === u.buffer.byteLength ? u.buffer : u.slice().buffer) as ArrayBuffer;

/**
 * Persists one board's Y.Doc in the Durable Object's SQLite:
 * `doc_snapshot` holds a full state (chunked); `doc_updates` is an append-only log of merged batches.
 */
export class DocStorage {
  private rows = 0;
  private bytes = 0;

  constructor(private readonly storage: DurableObjectStorage) {
    const sql = storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS doc_snapshot (seq INTEGER PRIMARY KEY, data BLOB NOT NULL)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS doc_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)`,
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  }

  load(doc: Y.Doc): void {
    const sql = this.storage.sql;
    const chunks = sql
      .exec<{ data: ArrayBuffer }>('SELECT data FROM doc_snapshot ORDER BY seq')
      .toArray()
      .map((r) => new Uint8Array(r.data));
    if (chunks.length) Y.applyUpdate(doc, concatBytes(chunks));
    const updates = sql
      .exec<{ data: ArrayBuffer }>('SELECT data FROM doc_updates ORDER BY id')
      .toArray()
      .map((r) => new Uint8Array(r.data));
    this.rows = updates.length;
    this.bytes = updates.reduce((n, u) => n + u.byteLength, 0);
    if (updates.length) Y.applyUpdate(doc, Y.mergeUpdates(updates));
  }

  /** Append a merged update; returns true when the log should be compacted. */
  append(update: Uint8Array): boolean {
    this.storage.sql.exec('INSERT INTO doc_updates (data) VALUES (?)', toArrayBuffer(update));
    this.rows++;
    this.bytes += update.byteLength;
    return this.rows >= COMPACT_ROWS || this.bytes >= COMPACT_BYTES;
  }

  /** Replace snapshot + log with a single fresh snapshot, atomically. */
  compact(doc: Y.Doc): void {
    const parts = chunkBytes(Y.encodeStateAsUpdate(doc));
    this.storage.transactionSync(() => {
      const sql = this.storage.sql;
      sql.exec('DELETE FROM doc_snapshot');
      parts.forEach((p, i) =>
        sql.exec('INSERT INTO doc_snapshot (seq, data) VALUES (?, ?)', i, toArrayBuffer(p)),
      );
      sql.exec('DELETE FROM doc_updates');
    });
    this.rows = 0;
    this.bytes = 0;
  }

  putAsset(id: string, mime: string, data: ArrayBuffer, userId: string): void {
    this.storage.sql.exec(
      'INSERT INTO assets (id, mime, bytes, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      mime,
      data.byteLength,
      data,
      userId,
      Date.now(),
    );
  }

  getAsset(id: string): { mime: string; data: ArrayBuffer } | null {
    const rows = this.storage.sql
      .exec<{ mime: string; data: ArrayBuffer }>('SELECT mime, data FROM assets WHERE id = ?', id)
      .toArray();
    return rows[0] ?? null;
  }
}
