import {
  ASSET_MIME_TYPES,
  BoardObject,
  CreateBoardBody,
  MAX_ASSET_BYTES,
  MAX_THUMBNAIL_BYTES,
  RenameBoardBody,
  buildTemplate,
  can,
  newId,
  type BoardList,
  type BoardListItem,
  type BoardSummary,
} from '@canvasly/shared';
import { Hono } from 'hono';
import { TRUSTED_HEADERS } from '../board-room/BoardRoom';
import { boardRoom, fail, loadAccess, type AppEnv, type BoardAccess } from '../http';
import { shareRoutes } from './share';

const IMMUTABLE = 'private, max-age=31536000, immutable';
const THUMBNAIL_TYPES = ['image/webp', 'image/png', 'image/jpeg'];

export const boards = new Hono<AppEnv>();

boards.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.title, m.role, u.name AS ownerName, b.created_at AS createdAt, b.updated_at AS updatedAt,
            t.updated_at AS thumbnailVersion,
            (SELECT COUNT(*) FROM board_members o WHERE o.board_id = b.id) AS memberCount,
            CASE WHEN m.role = 'owner' THEN b.link_role END AS linkRole
       FROM board_members m
       JOIN boards b ON b.id = m.board_id
       JOIN "user" u ON u.id = b.owner_id
       LEFT JOIN board_thumbnails t ON t.board_id = b.id
      WHERE m.user_id = ?1
      ORDER BY b.updated_at DESC
      LIMIT 500`,
  )
    .bind(c.get('user').id)
    .all<BoardListItem>();
  return c.json({ boards: results } satisfies BoardList);
});

boards.post('/', async (c) => {
  const body = CreateBoardBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return fail(c, 400, 'Invalid title');
  const user = c.get('user');
  const id = newId();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO boards (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, user.id, body.data.title, now, now),
    c.env.DB.prepare(
      'INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    ).bind(id, user.id, 'owner', now),
  ]);
  if (body.data.template !== 'blank') {
    const objects = buildTemplate(body.data.template).map((o) => BoardObject.parse(o));
    await boardRoom(c.env, id).seed(objects);
  }
  const board: BoardSummary = {
    id,
    title: body.data.title,
    role: 'owner',
    ownerName: user.name,
    createdAt: now,
    updatedAt: now,
    thumbnailVersion: null,
  };
  return c.json(board, 201);
});

// Every route below acts on one board and needs the caller's role.
const withAccess = new Hono<AppEnv & { Variables: { access: BoardAccess } }>();
withAccess.use('*', async (c, next) => {
  const access = await loadAccess(c.env, c.req.param('id')!, c.get('user').id);
  if (!access) return fail(c, 404, 'Board not found');
  c.set('access', access);
  await next();
});

withAccess.get('/', (c) => c.json(c.get('access') satisfies BoardSummary));

withAccess.patch('/', async (c) => {
  const access = c.get('access');
  if (!can(access.role, 'rename')) return fail(c, 403, 'Not allowed');
  const body = RenameBoardBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'Invalid title');
  await c.env.DB.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ?')
    .bind(body.data.title, Date.now(), access.id)
    .run();
  return c.json({ ...access, title: body.data.title });
});

withAccess.delete('/', async (c) => {
  const access = c.get('access');
  if (!can(access.role, 'delete')) return fail(c, 403, 'Only the owner can delete a board');
  // Remove access first so nobody can reconnect, then wipe the Durable Object's storage.
  await c.env.DB.prepare('DELETE FROM boards WHERE id = ?').bind(access.id).run();
  await boardRoom(c.env, access.id).destroy();
  return c.body(null, 204);
});

withAccess.get('/thumbnail', async (c) => {
  const row = await c.env.DB.prepare('SELECT image, mime FROM board_thumbnails WHERE board_id = ?')
    .bind(c.get('access').id)
    .first<{ image: number[] | ArrayBuffer; mime: string }>();
  if (!row) return fail(c, 404, 'No thumbnail');
  // D1 returns BLOBs as number arrays.
  const bytes = row.image instanceof ArrayBuffer ? new Uint8Array(row.image) : Uint8Array.from(row.image);
  return c.body(bytes, 200, { 'Content-Type': row.mime, 'Cache-Control': IMMUTABLE });
});

withAccess.put('/thumbnail', async (c) => {
  const access = c.get('access');
  if (!can(access.role, 'edit')) return fail(c, 403, 'Not allowed');
  const mime = c.req.header('content-type') ?? '';
  if (!THUMBNAIL_TYPES.includes(mime)) return fail(c, 415, 'Unsupported thumbnail type');
  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_THUMBNAIL_BYTES)
    return fail(c, 413, 'Thumbnail too large');
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO board_thumbnails (board_id, image, mime, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (board_id) DO UPDATE SET image = ?2, mime = ?3, updated_at = ?4`,
    ).bind(access.id, data, mime, now),
    c.env.DB.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').bind(now, access.id),
  ]);
  return c.json({ thumbnailVersion: now });
});

withAccess.post('/assets', async (c) => {
  const access = c.get('access');
  if (!can(access.role, 'edit')) return fail(c, 403, 'Not allowed');
  const mime = c.req.header('content-type') ?? '';
  if (!(ASSET_MIME_TYPES as readonly string[]).includes(mime)) return fail(c, 415, 'Unsupported image type');
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > MAX_ASSET_BYTES) return fail(c, 413, 'Image too large (max 1 MB after compression)');
  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > MAX_ASSET_BYTES) return fail(c, 413, 'Image too large');
  const id = await boardRoom(c.env, access.id).putAsset(mime, data, c.get('user').id);
  return c.json({ id }, 201);
});

withAccess.get('/assets/:assetId', async (c) => {
  const asset = await boardRoom(c.env, c.get('access').id).getAsset(c.req.param('assetId'));
  if (!asset) return fail(c, 404, 'Image not found');
  return c.body(asset.data, 200, {
    'Content-Type': asset.mime,
    'Cache-Control': IMMUTABLE,
    'X-Content-Type-Options': 'nosniff',
  });
});

withAccess.get('/ws', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return fail(c, 426, 'Expected WebSocket');
  const access = c.get('access');
  const user = c.get('user');
  // The Durable Object trusts these headers; overwrite anything the client may have sent.
  const headers = new Headers(c.req.raw.headers);
  headers.set(TRUSTED_HEADERS.userId, user.id);
  headers.set(TRUSTED_HEADERS.userName, encodeURIComponent(user.name));
  headers.set(TRUSTED_HEADERS.role, access.role);
  return boardRoom(c.env, access.id).fetch(new Request(c.req.raw, { headers }));
});

shareRoutes(withAccess);

boards.route('/:id', withAccess);
