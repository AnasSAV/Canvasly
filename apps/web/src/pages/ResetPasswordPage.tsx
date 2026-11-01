import { useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth';
import { navigate } from '../lib/router';
import { Shell } from './AuthPage';

const input =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-indigo-500/30';

/** Landing page for the emailed reset link: /reset-password?token=… (or ?error=INVALID_TOKEN). */
export function ResetPasswordPage() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') || !token ? 'This reset link is invalid or has expired. Request a new one.' : null,
  );
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) setError(error.message ?? 'Could not reset the password');
    else setDone(true);
  };

  const toSignIn = () => navigate('/', { replace: true });

  if (done) {
    return (
      <Shell>
        <h1 className="mb-2 text-xl font-semibold">Password updated</h1>
        <p className="mb-5 text-sm text-gray-600 dark:text-zinc-300">
          You can now sign in with your new password. Other devices were signed out.
        </p>
        <button
          type="button"
          onClick={toSignIn}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-zinc-400">At least 8 characters.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          className={input}
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={!token}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token}
          className="rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : 'Set password'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <button
          type="button"
          onClick={toSignIn}
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Back to sign in
        </button>
      </p>
    </Shell>
  );
}
