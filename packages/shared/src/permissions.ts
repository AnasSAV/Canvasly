import { z } from 'zod';

export const Role = z.enum(['owner', 'editor', 'viewer']);
export type Role = z.infer<typeof Role>;

export type Action =
  /** Open the board and receive live updates. */
  | 'view'
  /** Change board content (objects, images). */
  | 'edit'
  /** Add/resolve comments (viewers may comment). */
  | 'comment'
  | 'rename'
  | 'share'
  | 'delete';

const GRANTS: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(['view', 'edit', 'comment', 'rename', 'share', 'delete']),
  editor: new Set(['view', 'edit', 'comment', 'rename']),
  viewer: new Set(['view', 'comment']),
};

/** Single source of truth for authorization, used by the Worker, the Durable Object and the UI. */
export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && GRANTS[role].has(action);
}
