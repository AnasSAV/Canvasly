import {
  InviteBody,
  LinkBody,
  UpdateMemberBody,
  can,
  maxRole,
  type InviteResult,
  type PublicBoard,
  type Role,
  type ShareSettings,
} from '@canvasly/shared';
import { Hono, type Context } from 'hono';
import { TRUSTED_HEADERS } from '../board-room/BoardRoom';
import { boardRoom, fail, requireUser, type AppEnv, type BoardAccess } from '../http';

type AccessEnv = AppEnv & { Variables: { access: BoardAccess } };

/** Unguessable share-link token (144 bits, URL-safe). */
function newLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function loadShareSettings(env: Env, boardId: string): Promise<ShareSettings> {
  const [members, invites, link] = await env.DB.batch([
    env.DB.prepare(
      `SELECT m.user_id AS userId, u.name, u.email, m.role
         FROM board_members m JOIN "user" u ON u.id = m.user_id
        WHERE m.board_id = ?
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, u.name`,
    ).bind(boardId),
    env.DB.prepare(
      'SELECT email, role, created_at AS createdAt FROM board_invites WHERE board_id = ? ORDER BY created_at',
    ).bind(boardId),
    env.DB.prepare('SELECT link_role AS linkRole, link_token AS linkToken FROM boards WHERE id = ?').bind(
      boardId,
    ),
  ]);
  const l = (link!.results[0] ?? { linkRole: null, linkToken: null }) as Pick<
    ShareSettings,
    'linkRole' | 'linkToken'
  >;
  return {
    members: members!.results as ShareSettings['members'],
    invites: invites!.results as ShareSettings['invites'],
    linkRole: l.linkRole,
    linkToken: l.linkToken,
  };
}

const ownerOnly = (c: Context<AccessEnv>) =>
  can(c.get('access').role, 'share') ? null : fail(c, 403, 'Only the owner can manage sharing');

/** Owner-only sharing routes mounted under /api/boards/:id. */
export function shareRoutes(app: Hono<AccessEnv>) {
  app.get('/share', async (c) => ownerOnly(c) ?? c.json(await loadShareSettings(c.env, c.get('access').id)));

  app.post('/invites', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const body = InviteBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return fail(c, 400, 'Enter a valid email and role');
    const { id } = c.get('access');
    const { email, role } = body.data;
    const user = await c.env.DB.prepare('SELECT id, name FROM "user" WHERE email = ? COLLATE NOCASE')
      .bind(email)
      .first<{ id: string; name: string }>();
    const now = Date.now();
    if (user) {
      // Existing account: grant access now (the dialog shows the account name so the owner can confirm).
      const existing = await c.env.DB.prepare(
        'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
      )
        .bind(id, user.id)
        .first<{ role: Role }>();
      if (existing?.role === 'owner') return fail(c, 400, "That's the board owner");
      await c.env.DB.prepare(
        `INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (board_id, user_id) DO UPDATE SET role = ?3`,
      )
        .bind(id, user.id, role, now)
        .run();
      await boardRoom(c.env, id).setUserRole(user.id, role);
    } else {
      await c.env.DB.prepare(
        `INSERT INTO board_invites (board_id, email, role, invited_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (board_id, email) DO UPDATE SET role = ?3`,
      )
        .bind(id, email, role, c.get('user').id, now)
        .run();
    }
    const result: InviteResult = {
      status: user ? 'added' : 'pending',
      name: user?.name ?? null,
      settings: await loadShareSettings(c.env, id),
    };
    return c.json(result);
  });

  app.delete('/invites/:email', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const { id } = c.get('access');
    await c.env.DB.prepare('DELETE FROM board_invites WHERE board_id = ? AND email = ? COLLATE NOCASE')
      .bind(id, decodeURIComponent(c.req.param('email')))
      .run();
    return c.json(await loadShareSettings(c.env, id));
  });

  app.patch('/members/:userId', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const body = UpdateMemberBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return fail(c, 400, 'Invalid role');
    const { id } = c.get('access');
    const userId = c.req.param('userId');
    const res = await c.env.DB.prepare(
      "UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ? AND role != 'owner'",
    )
      .bind(body.data.role, id, userId)
      .run();
    if (!res.meta.changes) return fail(c, 404, 'Member not found');
    await boardRoom(c.env, id).setUserRole(userId, body.data.role);
    return c.json(await loadShareSettings(c.env, id));
  });

  app.delete('/members/:userId', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const { id } = c.get('access');
    const userId = c.req.param('userId');
    const res = await c.env.DB.prepare(
      "DELETE FROM board_members WHERE board_id = ? AND user_id = ? AND role != 'owner'",
    )
      .bind(id, userId)
      .run();
    if (!res.meta.changes) return fail(c, 404, 'Member not found');
    await boardRoom(c.env, id).setUserRole(userId, null);
    return c.json(await loadShareSettings(c.env, id));
  });

  app.put('/link', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const body = LinkBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return fail(c, 400, 'Invalid link setting');
    const { id } = c.get('access');
    const role = body.data.role;
    await c.env.DB.prepare(
      'UPDATE boards SET link_role = ?, link_token = COALESCE(link_token, ?) WHERE id = ?',
    )
      .bind(role, newLinkToken(), id)
      .run();
    if (role !== 'viewer') await boardRoom(c.env, id).revokeAnonymous();
    return c.json(await loadShareSettings(c.env, id));
  });

  app.post('/link/rotate', async (c) => {
    const denied = ownerOnly(c);
    if (denied) return denied;
    const { id } = c.get('access');
    await c.env.DB.prepare('UPDATE boards SET link_token = ? WHERE id = ?').bind(newLinkToken(), id).run();
    await boardRoom(c.env, id).revokeAnonymous();
    return c.json(await loadShareSettings(c.env, id));
  });
}

interface LinkedBoard {
  id: string;
  title: string;
  linkRole: 'viewer' | 'editor' | null;
}

const boardByToken = (env: Env, token: string) =>
  env.DB.prepare(
    'SELECT id, title, link_role AS linkRole FROM boards WHERE link_token = ? AND link_role IS NOT NULL',
  )
    .bind(token)
    .first<LinkedBoard>();

/** /api/share/:token/join (signed in) and /api/public/:token/* (anonymous, view-only links). */
export const linkRoutes = new Hono<AppEnv>();

linkRoutes.post('/share/:token/join', requireUser, async (c) => {
  const board = await boardByToken(c.env, c.req.param('token'));
  if (!board?.linkRole) return fail(c, 404, 'This link is no longer valid');
  const user = c.get('user');
  const existing = await c.env.DB.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?')
    .bind(board.id, user.id)
    .first<{ role: Role }>();
  const role = maxRole(existing?.role ?? null, board.linkRole);
  if (role !== existing?.role) {
    await c.env.DB.prepare(
      `INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (board_id, user_id) DO UPDATE SET role = ?3`,
    )
      .bind(board.id, user.id, role, Date.now())
      .run();
    if (existing) await boardRoom(c.env, board.id).setUserRole(user.id, role);
  }
  return c.json({ boardId: board.id });
});

// Anonymous access only exists for view-only links.
const publicBoard = async (c: Context<AppEnv>) => {
  const board = await boardByToken(c.env, c.req.param('token')!);
  return board?.linkRole === 'viewer' ? board : null;
};

linkRoutes.get('/public/:token', async (c) => {
  const board = await publicBoard(c);
  if (!board) return fail(c, 404, 'This link is private or no longer valid');
  return c.json({ id: board.id, title: board.title } satisfies PublicBoard);
});

linkRoutes.get('/public/:token/assets/:assetId', async (c) => {
  const board = await publicBoard(c);
  if (!board) return fail(c, 404, 'Not found');
  const asset = await boardRoom(c.env, board.id).getAsset(c.req.param('assetId'));
  if (!asset) return fail(c, 404, 'Image not found');
  return c.body(asset.data, 200, {
    'Content-Type': asset.mime,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
});

linkRoutes.get('/public/:token/ws', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return fail(c, 426, 'Expected WebSocket');
  const board = await publicBoard(c);
  if (!board) return fail(c, 404, 'Not found');
  const headers = new Headers(c.req.raw.headers);
  headers.set(TRUSTED_HEADERS.userId, `anon-${crypto.randomUUID()}`);
  headers.set(TRUSTED_HEADERS.userName, 'Guest');
  headers.set(TRUSTED_HEADERS.role, 'viewer');
  headers.set(TRUSTED_HEADERS.anonymous, '1');
  return boardRoom(c.env, board.id).fetch(new Request(c.req.raw, { headers }));
});
