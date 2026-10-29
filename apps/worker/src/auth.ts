import { betterAuth } from 'better-auth';
import { hashPassword, verifyPassword } from './password';

function createAuth(env: Env) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    socialProviders: google,
    databaseHooks: {
      user: {
        create: {
          // Pending email invites become memberships, but only for verified emails (e.g. Google). Password
          // sign-ups aren't verified until an email provider is configured, and anyone could register
          // someone else's address.
          after: async (user) => {
            if (!user.emailVerified) return;
            await claimInvites(env, user.id, user.email);
          },
        },
      },
    },
    session: {
      // Signed session data in a cookie avoids a D1 read on most requests.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
  });
}

async function claimInvites(env: Env, userId: string, email: string) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO board_members (board_id, user_id, role, created_at)
       SELECT board_id, ?1, role, ?2 FROM board_invites WHERE email = ?3 COLLATE NOCASE`,
    ).bind(userId, now, email),
    env.DB.prepare('DELETE FROM board_invites WHERE email = ? COLLATE NOCASE').bind(email),
  ]);
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'];

// `env` is stable for the lifetime of an isolate, so build the auth instance once per isolate.
const cache = new WeakMap<Env, Auth>();

export function getAuth(env: Env): Auth {
  let auth = cache.get(env);
  if (!auth) {
    auth = createAuth(env);
    cache.set(env, auth);
  }
  return auth;
}

export const googleEnabled = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
