import type { Role } from '@canvasly/shared';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getAuth, type SessionUser } from './auth';

export interface AppEnv {
  Bindings: Env;
  Variables: { user: SessionUser };
}

export const fail = (c: Context, status: ContentfulStatusCode, error: string) => c.json({ error }, status);

/** Rejects unauthenticated requests and exposes the session user as c.get('user'). */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return fail(c, 401, 'Not signed in');
  c.set('user', session.user);
  await next();
};

/**
 * CSRF / cross-site WebSocket hijacking guard: browsers always send Origin on POST/PATCH/DELETE and on
 * WebSocket handshakes, so require it to match our own origin for anything that isn't a plain read.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const isUpgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';
  if (c.req.method === 'GET' && !isUpgrade) return next();
  const origin = c.req.header('origin');
  if (origin && origin !== new URL(c.env.BETTER_AUTH_URL).origin) return fail(c, 403, 'Cross-origin request');
  await next();
};

export interface BoardAccess {
  id: string;
  title: string;
  role: Role;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
  thumbnailVersion: number | null;
}

/** The caller's membership of a board, or null if the board doesn't exist or they have no access. */
export async function loadAccess(env: Env, boardId: string, userId: string): Promise<BoardAccess | null> {
  return env.DB.prepare(
    `SELECT b.id, b.title, m.role, u.name AS ownerName, b.created_at AS createdAt, b.updated_at AS updatedAt,
            t.updated_at AS thumbnailVersion
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.user_id = ?1
       JOIN "user" u ON u.id = b.owner_id
       LEFT JOIN board_thumbnails t ON t.board_id = b.id
      WHERE b.id = ?2`,
  )
    .bind(userId, boardId)
    .first<BoardAccess>();
}

export const boardRoom = (env: Env, boardId: string) =>
  env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(boardId));
