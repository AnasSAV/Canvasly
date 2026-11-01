import { z } from 'zod';
import { Role } from '../permissions';

/** Roles that can be granted to others (there is exactly one owner). */
export const GrantableRole = z.enum(['editor', 'viewer']);
export type GrantableRole = z.infer<typeof GrantableRole>;

/**
 * "Anyone with the link": 'viewer' = public, view-only, no sign-in needed;
 * 'editor' = anyone signed in who opens the link joins as an editor; null = link disabled.
 */
export const LinkRole = GrantableRole.nullable();
export type LinkRole = z.infer<typeof LinkRole>;

export const Member = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
});
export type Member = z.infer<typeof Member>;

export const PendingInvite = z.object({ email: z.string(), role: GrantableRole, createdAt: z.number() });
export type PendingInvite = z.infer<typeof PendingInvite>;

export const ShareSettings = z.object({
  members: z.array(Member),
  invites: z.array(PendingInvite),
  linkRole: LinkRole,
  linkToken: z.string().nullable(),
});
export type ShareSettings = z.infer<typeof ShareSettings>;

export const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: GrantableRole,
});
export type InviteBody = z.infer<typeof InviteBody>;

export const InviteResult = z.object({
  /** 'added' = an account with that email existed and now has access; 'pending' = waiting for sign-up. */
  status: z.enum(['added', 'pending']),
  name: z.string().nullable(),
  /** Whether a notification email went out (false when email isn't configured or sending failed). */
  emailed: z.boolean(),
  settings: ShareSettings,
});
export type InviteResult = z.infer<typeof InviteResult>;

export const UpdateMemberBody = z.object({ role: GrantableRole });
export const LinkBody = z.object({ role: LinkRole });

export const PublicBoard = z.object({ id: z.string(), title: z.string() });
export type PublicBoard = z.infer<typeof PublicBoard>;

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
/** The stronger of two roles (joining via a link never downgrades an existing member). */
export const maxRole = (a: Role | null, b: Role): Role => (a && RANK[a] >= RANK[b] ? a : b);
