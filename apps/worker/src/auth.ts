import { betterAuth } from 'better-auth';
import { emailEnabled, resetPasswordEmail, sendEmail, verifyEmail } from './email';
import { hashPassword, verifyPassword } from './password';

function createAuth(env: Env) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Let people with several Google accounts pick one instead of silently reusing the last.
            prompt: 'select_account' as const,
          },
        }
      : undefined;
  // With an email provider configured, password accounts must confirm their address before signing in.
  // That makes emails trustworthy, so invites and Google account linking can rely on them.
  const verify = emailEnabled(env);
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
      requireEmailVerification: verify,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, resetPasswordEmail(user.email, user.name, url));
      },
    },
    emailVerification: {
      sendOnSignUp: verify,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, verifyEmail(user.email, user.name, url));
      },
      // Confirming an address claims any boards that were shared with it before the account existed.
      afterEmailVerification: async (user) => {
        await claimInvites(env, user.id, user.email);
      },
    },
    socialProviders: google,
    databaseHooks: {
      user: {
        create: {
          // Pending email invites become memberships, but only for verified emails: Google accounts here,
          // password accounts once they confirm their address (afterEmailVerification above). Otherwise
          // anyone could register someone else's address and pick up their invites.
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
