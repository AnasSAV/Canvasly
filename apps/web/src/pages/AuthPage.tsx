import { CircleAlert, CircleCheck, Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { api } from '../lib/api';
import { authClient } from '../lib/auth';
import { Logo } from '../ui/Logo';

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

export function Field({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field h-10" {...input} />
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          minLength={8}
          required
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="field h-10 pr-10"
          {...input}
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <Icon size={16} />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormNote({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  const Icon = kind === 'error' ? CircleAlert : CircleCheck;
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-[13px] leading-snug ${
        kind === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
      }`}
      data-testid={kind === 'error' ? 'form-error' : 'form-notice'}
    >
      <Icon size={15} className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

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
        <h1 className="mb-2 text-2xl font-semibold">Check your inbox</h1>
        <p className="mb-5 text-sm text-muted">
          We sent a confirmation link to <strong className="font-semibold text-fg">{email}</strong>. Open it
          to finish creating your account.
        </p>
        <div className="mb-4 flex flex-col gap-2 empty:hidden">
          {notice && <FormNote kind="ok">{notice}</FormNote>}
          {error && <FormNote kind="error">{error}</FormNote>}
        </div>
        <p className="text-sm text-muted">
          Didn't get it?{' '}
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => void resendVerification()}
          >
            Send it again
          </button>{' '}
          ·{' '}
          <button type="button" className="text-link" onClick={() => go('signin')}>
            Back to sign in
          </button>
        </p>
      </Shell>
    );
  }

  const titles: Record<Exclude<Mode, 'check-email'>, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your boards.'],
    signup: ['Create your account', 'Free, and ready in a few seconds.'],
    forgot: ['Reset your password', "Enter your email and we'll send you a reset link."],
  };

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">{titles[mode][0]}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{titles[mode][1]}</p>

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
            className="btn btn-secondary btn-lg mb-4 w-full gap-2"
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
          <div className="mb-4 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" />
            or
            <div className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {mode === 'signup' && (
          <Field label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'forgot' && (
          <div className="relative">
            <PasswordField
              label="Password"
              hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signin' && (
              <button
                type="button"
                className="text-link absolute top-0 right-0 text-xs"
                onClick={() => go('forgot')}
              >
                Forgot password?
              </button>
            )}
          </div>
        )}
        {error && <FormNote kind="error">{error}</FormNote>}
        {unverified && (
          <button
            type="button"
            className="text-link self-start text-sm"
            disabled={busy}
            onClick={() => void resendVerification()}
          >
            Resend confirmation email
          </button>
        )}
        {notice && <FormNote kind="ok">{notice}</FormNote>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-1 w-full">
          {busy
            ? 'Please wait…'
            : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {mode === 'signup' ? 'Already have an account? ' : mode === 'signin' ? "Don't have an account? " : ''}
        <button
          type="button"
          className="text-link"
          onClick={() => go(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Sign up' : 'Back to sign in'}
        </button>
      </p>
    </Shell>
  );
}

/** A board mid-session, drawn rather than screenshotted so that it's sharp at any size and needs no download. */
function BoardScene() {
  return (
    <svg
      viewBox="0 0 640 520"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <g fill="none" stroke="#1d6b6a" strokeWidth="1.5">
        <rect x="36" y="58" width="360" height="318" rx="4" />
        <rect x="430" y="150" width="176" height="226" rx="4" />
      </g>
      <text x="36" y="46" fill="#9cc4c2" fontSize="13" fontWeight="600">
        Launch plan
      </text>
      <text x="430" y="138" fill="#9cc4c2" fontSize="13" fontWeight="600">
        Signups
      </text>

      <g
        fill="none"
        stroke="#f38020"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      >
        <path
          d="M176 134H222V232H250"
          pathLength={1}
          strokeDasharray="1"
          style={{ animation: 'draw-line 800ms 150ms ease-out backwards' }}
        />
        <path
          d="M176 298H222V232"
          pathLength={1}
          strokeDasharray="1"
          style={{ animation: 'draw-line 800ms 300ms ease-out backwards' }}
        />
      </g>
      <path d="M247 225L258 232L247 239Z" fill="#f38020" />

      <g style={{ animation: 'rise-in 420ms ease-out backwards' }}>
        <rect x="62" y="90" width="114" height="88" rx="4" fill="#fff4a8" />
        <text x="76" y="124" fontSize="14" fontWeight="600" fill="#0b2a2a">
          Talk to
        </text>
        <text x="76" y="144" fontSize="14" fontWeight="600" fill="#0b2a2a">
          20 teams
        </text>
      </g>
      <g style={{ animation: 'rise-in 420ms 90ms ease-out backwards' }}>
        <rect x="62" y="254" width="114" height="88" rx="4" fill="#9fe3d8" />
        <text x="76" y="288" fontSize="14" fontWeight="600" fill="#0b2a2a">
          Beta on
        </text>
        <text x="76" y="308" fontSize="14" fontWeight="600" fill="#0b2a2a">
          Friday
        </text>
      </g>
      <g style={{ animation: 'rise-in 420ms 180ms ease-out backwards' }}>
        <path
          d="M296 182L364 232L296 282L228 232Z"
          transform="translate(30 0)"
          fill="#0a4445"
          stroke="#4fd0c5"
          strokeWidth="2"
        />
        <text x="326" y="237" textAnchor="middle" fontSize="13" fontWeight="600" fill="#eaf5f4">
          Ship it?
        </text>
      </g>

      <g style={{ animation: 'rise-in 420ms 260ms ease-out backwards' }}>
        {[46, 74, 62, 112, 148].map((h, i) => (
          <rect
            key={i}
            x={450 + i * 28}
            y={350 - h}
            width="18"
            height={h}
            rx="2"
            fill={i === 4 ? '#f38020' : '#2d7a7a'}
          />
        ))}
        <path d="M444 350.5H592" stroke="#2d7a7a" />
      </g>

      {/* Someone's selection, in the app's own style. */}
      <g fill="none" stroke="#f38020" strokeWidth="1.5">
        <rect x="56" y="84" width="126" height="100" />
      </g>
      <g fill="#fff" stroke="#f38020" strokeWidth="1.5">
        <rect x="52" y="80" width="8" height="8" rx="1.5" />
        <rect x="178" y="80" width="8" height="8" rx="1.5" />
        <rect x="52" y="180" width="8" height="8" rx="1.5" />
        <rect x="178" y="180" width="8" height="8" rx="1.5" />
      </g>

      <g transform="translate(130 186)">
        <path d="M0 0V17L5 12.5L8.5 20L12 18.5L8.5 11.5H15Z" fill="#f38020" stroke="#fff" strokeWidth="1" />
        <rect x="12" y="20" width="44" height="20" rx="4" fill="#f38020" />
        <text x="34" y="34" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#0b2a2a">
          Maya
        </text>
      </g>
      <g transform="translate(372 300)">
        <path d="M0 0V17L5 12.5L8.5 20L12 18.5L8.5 11.5H15Z" fill="#4fd0c5" stroke="#fff" strokeWidth="1" />
        <rect x="12" y="20" width="42" height="20" rx="4" fill="#4fd0c5" />
        <text x="33" y="34" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#04201f">
          Theo
        </text>
      </g>
    </svg>
  );
}

/** The auth screens: the form on one side, a board in progress on the other, once there's room for both. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full overflow-y-auto bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)]">
      <aside className="ink dotgrid relative hidden min-h-0 flex-col overflow-hidden bg-surface lg:flex">
        <div className="min-h-0 flex-1 p-8 pb-0">
          <BoardScene />
        </div>
        <div className="px-12 pb-11">
          <p className="font-display text-[34px] leading-[1.15] font-semibold tracking-tight">
            One board.
            <br />
            Everyone on it.
          </p>
          <p className="mt-3 max-w-md text-[15px] text-muted">
            Plan, map and decide together, on a canvas that never runs out of room.
          </p>
        </div>
      </aside>
      <main className="flex min-h-full flex-col px-6 py-7 sm:px-12">
        <Logo height={28} />
        <div className="my-auto w-full max-w-sm py-10">{children}</div>
      </main>
    </div>
  );
}
