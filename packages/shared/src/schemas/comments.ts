import { z } from 'zod';

export const CommentText = z.string().trim().min(1).max(2000);

export const Comment = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  createdAt: z.number(),
});
export type Comment = z.infer<typeof Comment>;

/** A pin on the canvas (world coordinates) holding a thread of comments. */
export const CommentThread = z.object({
  id: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  resolved: z.boolean(),
  createdAt: z.number(),
  comments: z.array(Comment),
});
export type CommentThread = z.infer<typeof CommentThread>;

/**
 * Client -> server comment operations (JSON in MSG_COMMENTS frames). The server stamps author and time
 * from the authenticated connection, so they can't be forged.
 */
export const CommentOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), x: z.number().finite(), y: z.number().finite(), text: CommentText }),
  z.object({ op: z.literal('reply'), threadId: z.string().max(64), text: CommentText }),
  z.object({ op: z.literal('resolve'), threadId: z.string().max(64), resolved: z.boolean() }),
  z.object({ op: z.literal('delete'), threadId: z.string().max(64), commentId: z.string().max(64) }),
]);
export type CommentOp = z.infer<typeof CommentOp>;

/** Server -> client comment events. */
export const CommentEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), threads: z.array(CommentThread) }),
  z.object({ type: z.literal('upsert'), thread: CommentThread }),
  z.object({ type: z.literal('remove'), threadId: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type CommentEvent = z.infer<typeof CommentEvent>;
