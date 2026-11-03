import { useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth';
import { navigate } from '../lib/router';
import { FormNote, PasswordField, Shell } from './AuthPage';

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
        <h1 className="mb-2 text-2xl font-semibold">Password updated</h1>
        <p className="mb-6 text-sm text-muted">
          You can now sign in with your new password. Other devices were signed out.
        </p>
        <button type="button" onClick={toSignIn} className="btn btn-primary btn-lg w-full">
          Sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <PasswordField
          label="New password"
          hint="At least 8 characters."
          autoComplete="new-password"
          disabled={!token}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormNote kind="error">{error}</FormNote>}
        <button type="submit" disabled={busy || !token} className="btn btn-primary btn-lg w-full">
          {busy ? 'Please wait…' : 'Set password'}
        </button>
      </form>
      <p className="mt-6 text-sm">
        <button type="button" onClick={toSignIn} className="text-link">
          Back to sign in
        </button>
      </p>
    </Shell>
  );
}
