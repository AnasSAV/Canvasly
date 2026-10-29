import { Hono } from 'hono';
import { getAuth, googleEnabled } from './auth';
import { fail, requireUser, sameOrigin, type AppEnv } from './http';
import { boards } from './routes/boards';
import { linkRoutes } from './routes/share';

export { BoardRoom } from './board-room/BoardRoom';

const app = new Hono<AppEnv>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));
app.get('/config', (c) => c.json({ google: googleEnabled(c.env) }));

app.on(['GET', 'POST'], '/auth/*', (c) => getAuth(c.env).handler(c.req.raw));

app.use('/boards', sameOrigin, requireUser);
app.use('/boards/*', sameOrigin, requireUser);
app.route('/boards', boards);

app.use('/share/*', sameOrigin);
app.use('/public/*', sameOrigin);
app.route('/', linkRoutes);

app.notFound((c) => fail(c, 404, 'Not found'));
app.onError((err, c) => {
  console.error(err);
  return fail(c, 500, 'Internal error');
});

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
