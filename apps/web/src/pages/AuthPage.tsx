import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../lib/api';
import { authClient } from '../lib/auth';
import { Logo } from '../ui/Logo';

const input =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-indigo-500/30';

/** Messages for errors Better Auth reports back on the redirect after Google sign-in (`?error=`). */
const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked:
    'An account with this email already exists. Sign in with your password instead — Google can be used once that email is verified.',
  access_denied: 'Google sign-in was cancelled.',
};

function oauthErrorFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('error');
  if (!code) return null;
  history.replaceState(null, '', location.pathname); // don't show it again on refresh
  return OAUTH_ERRORS[code] ?? 'Google sign-in failed. Please try again.';
}

type Mode = 'signin' | 'signup' | 'forgot' | 'check-email';

const link = 'font-medium text-indigo-600 hover:underline dark:text-indigo-400';

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [notice, setNotice] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(oauthErrorFromUrl);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api
      .config()
      .then((c) => setGoogle(c.google))
      .catch(() => setGoogle(false));
  }, []);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setUnverified(false);
  };

  const resendVerification = async () => {
    setBusy(true);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: location.pathname });
    setBusy(false);
    if (error) setError(error.message ?? 'Could not send the email');
    else setNotice(`We sent a new confirmation link to ${email}.`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverified(false);
    if (mode === 'forgot') {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
      setBusy(false);
      if (error) setError(error.message ?? 'Something went wrong');
      else setNotice(`If an account exists for ${email}, we sent a link to reset its password.`);
      return;
    }
    if (mode === 'signup') {
      const { data, error } = await authClient.signUp.email({
        name: name.trim() || email.split('@')[0]!,
        email,
        password,
        callbackURL: location.pathname, // where the confirmation link lands, already signed in
      });
      setBusy(false);
      if (error) setError(error.message ?? 'Something went wrong');
      else if (data && !data.token) setMode('check-email'); // verification required before signing in
      // Otherwise the session hook re-renders the app into the signed-in view.
      return;
    }
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error?.code === 'EMAIL_NOT_VERIFIED') {
      setUnverified(true);
      setError('Please confirm your email address first — check your inbox for the link.');
    } else if (error) setError(error.message ?? 'Something went wrong');
  };

  if (mode === 'check-email') {
    return (
      <Shell>
        <h1 className="mb-2 text-xl font-semibold">Check your inbox</h1>
        <p className="mb-5 text-sm text-gray-600 dark:text-zinc-300">
          We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.
        </p>
        {notice && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Didn't get it?{' '}
          <button type="button" className={link} disabled={busy} onClick={() => void resendVerification()}>
            Send it again
          </button>{' '}
          ·{' '}
          <button type="button" className={link} onClick={() => go('signin')}>
            Back to sign in
          </button>
        </p>
      </Shell>
    );
  }

  const titles: Record<Exclude<Mode, 'check-email'>, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your boards.'],
    signup: ['Create your account', 'Start collaborating on infinite boards.'],
    forgot: ['Reset your password', "Enter your email and we'll send you a reset link."],
  };

  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold">{titles[mode][0]}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-zinc-400">{titles[mode][1]}</p>

      {google && mode !== 'forgot' && (
        <>
          <button
            type="button"
            onClick={() =>
              authClient.signIn.social({
                provider: 'google',
                callbackURL: location.pathname,
                // Failures come back to this page (not Better Auth's bare error page) with ?error=
                errorCallbackURL: location.pathname,
              })
            }
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2 text-sm font-medium hover:bg-gray-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
              />
            </svg>
            Continue with Google
          </button>
          <div className="mb-4 flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-700" />
            or
            <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-700" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'signup' && (
          <input
            className={input}
            placeholder="Your name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className={input}
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'forgot' && (
          <input
            className={input}
            type="password"
            placeholder="Password (min. 8 characters)"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {mode === 'signin' && (
          <button type="button" className={`-mt-1 self-end text-xs ${link}`} onClick={() => go('forgot')}>
            Forgot password?
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {unverified && (
          <button
            type="button"
            className={`self-start text-sm ${link}`}
            disabled={busy}
            onClick={() => void resendVerification()}
          >
            Resend confirmation email
          </button>
        )}
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy
            ? 'Please wait…'
            : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500 dark:text-zinc-400">
        {mode === 'signup' ? 'Already have an account? ' : mode === 'signin' ? "Don't have an account? " : ''}
        <button type="button" className={link} onClick={() => go(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Sign up' : 'Back to sign in'}
        </button>
      </p>
    </Shell>
  );
}

/** Centered card with the logo, shared by the auth screens. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gray-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="mb-6">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
