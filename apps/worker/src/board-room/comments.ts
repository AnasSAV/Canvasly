import { newId, type CommentOp, type CommentThread } from '@canvasly/shared';

export interface CommentAuthor {
  userId: string;
  name: string;
  /** Owners and editors may delete anyone's comment; others only their own. */
  moderator: boolean;
}

/** Thrown for ops that are well-formed but not allowed or refer to missing threads. */
export class CommentError extends Error {}

/** Comment threads in the board's Durable Object SQLite. Authorship comes from the server, never the client. */
export class CommentStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS comment_threads (
      id TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES comment_threads (id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX IF NOT EXISTS comments_thread_idx ON comments (thread_id)');
  }

  all(): CommentThread[] {
    const threads = this.sql
      .exec<{ id: string; x: number; y: number; resolved: number; created_at: number }>(
        'SELECT id, x, y, resolved, created_at FROM comment_threads ORDER BY created_at',
      )
      .toArray();
    const byThread = new Map<string, CommentThread['comments']>();
    for (const c of this.sql
      .exec<{
        id: string;
        thread_id: string;
        author_id: string;
        author_name: string;
        text: string;
        created_at: number;
      }>('SELECT id, thread_id, author_id, author_name, text, created_at FROM comments ORDER BY created_at')
      .toArray()) {
      const list = byThread.get(c.thread_id) ?? [];
      list.push({
        id: c.id,
        authorId: c.author_id,
        authorName: c.author_name,
        text: c.text,
        createdAt: c.created_at,
      });
      byThread.set(c.thread_id, list);
    }
    return threads.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      resolved: !!t.resolved,
      createdAt: t.created_at,
      comments: byThread.get(t.id) ?? [],
    }));
  }

  get(threadId: string): CommentThread | null {
    return this.all().find((t) => t.id === threadId) ?? null;
  }

  /** Apply an op; returns the changed thread, or { removed } when the last comment of a thread is deleted. */
  apply(op: CommentOp, author: CommentAuthor): CommentThread | { removed: string } {
    const now = Date.now();
    switch (op.op) {
      case 'create': {
        const threadId = newId();
        this.sql.exec(
          'INSERT INTO comment_threads (id, x, y, resolved, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)',
          threadId,
          op.x,
          op.y,
          author.userId,
          now,
        );
        this.insertComment(threadId, op.text, author, now);
        return this.get(threadId)!;
      }
      case 'reply': {
        this.requireThread(op.threadId);
        this.insertComment(op.threadId, op.text, author, now);
        return this.get(op.threadId)!;
      }
      case 'resolve': {
        this.requireThread(op.threadId);
        this.sql.exec(
          'UPDATE comment_threads SET resolved = ? WHERE id = ?',
          op.resolved ? 1 : 0,
          op.threadId,
        );
        return this.get(op.threadId)!;
      }
      case 'delete': {
        const rows = this.sql
          .exec<{ author_id: string }>(
            'SELECT author_id FROM comments WHERE id = ? AND thread_id = ?',
            op.commentId,
            op.threadId,
          )
          .toArray();
        const row = rows[0];
        if (!row) throw new CommentError('Comment not found');
        if (row.author_id !== author.userId && !author.moderator) throw new CommentError('Not allowed');
        this.sql.exec('DELETE FROM comments WHERE id = ?', op.commentId);
        const left = this.sql
          .exec<{ n: number }>('SELECT COUNT(*) AS n FROM comments WHERE thread_id = ?', op.threadId)
          .one().n;
        if (left === 0) {
          this.sql.exec('DELETE FROM comment_threads WHERE id = ?', op.threadId);
          return { removed: op.threadId };
        }
        return this.get(op.threadId)!;
      }
    }
  }

  private requireThread(id: string) {
    const n = this.sql
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM comment_threads WHERE id = ?', id)
      .one().n;
    if (!n) throw new CommentError('Thread not found');
  }

  private insertComment(threadId: string, text: string, author: CommentAuthor, now: number) {
    this.sql.exec(
      'INSERT INTO comments (id, thread_id, author_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      newId(),
      threadId,
      author.userId,
      author.name,
      text,
      now,
    );
  }
}
