import type { CommentEvent, CommentOp, CommentThread } from '@canvasly/shared';

/** Comment threads mirrored from the board's Durable Object (server-authoritative). */
export class CommentsStore {
  private threads: CommentThread[] = [];
  private listeners = new Set<() => void>();
  /** Last error from the server (e.g. "Sign in to comment"), cleared on the next successful change. */
  error: string | null = null;
  send: (op: CommentOp) => boolean = () => false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getThreads = () => this.threads;

  apply(event: CommentEvent) {
    switch (event.type) {
      case 'snapshot':
        this.threads = event.threads;
        break;
      case 'upsert': {
        const i = this.threads.findIndex((t) => t.id === event.thread.id);
        this.threads =
          i === -1
            ? [...this.threads, event.thread]
            : this.threads.map((t, j) => (j === i ? event.thread : t));
        this.error = null;
        break;
      }
      case 'remove':
        this.threads = this.threads.filter((t) => t.id !== event.threadId);
        break;
      case 'error':
        this.error = event.message;
        break;
    }
    this.listeners.forEach((l) => l());
  }
}
