import type { GrantableRole, LinkRole, ShareSettings } from '@canvasly/shared';
import { Check, Copy, Link2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, shareLinkUrl } from '../lib/api';

const select =
  'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100';

const LINK_OPTIONS: { value: LinkRole; label: string; hint: string }[] = [
  { value: null, label: 'Off', hint: 'Only people added below can open the board.' },
  { value: 'viewer', label: 'Anyone can view', hint: 'Public, view-only. No sign-in needed.' },
  {
    value: 'editor',
    label: 'Signed-in users can edit',
    hint: 'Anyone who signs in and opens the link joins as an editor.',
  },
];

export function ShareDialog({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<GrantableRole>('editor');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getShare(boardId)
      .then(setSettings)
      .catch((e: Error) => setMessage({ kind: 'error', text: e.message }));
  }, [boardId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<ShareSettings>) => {
    setBusy(true);
    try {
      setSettings(await fn());
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const res = await api.invite(boardId, email, role);
      setSettings(res.settings);
      setEmail('');
      const sent = res.emailed ? ' We emailed them a link.' : '';
      setMessage(
        res.status === 'added'
          ? { kind: 'ok', text: `Added ${res.name} as ${role}.${sent}` }
          : {
              kind: 'ok',
              text: `No account for ${email} yet.${sent} They get access after signing up and confirming that email address — or send them the link below.`,
            },
      );
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const link = settings?.linkRole && settings.linkToken ? shareLinkUrl(settings.linkToken) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Share board"
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        data-testid="share-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share board</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={invite} className="mb-2 flex gap-2">
          <input
            type="email"
            required
            placeholder="Invite by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
            data-testid="invite-email"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as GrantableRole)}
            className={select}
            aria-label="Role"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Invite
          </button>
        </form>
        {message && (
          <p
            className={`mb-3 text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}
            data-testid="share-message"
          >
            {message.text}
          </p>
        )}

        <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-zinc-400">
          People with access
        </h3>
        <ul
          className="mb-4 max-h-56 divide-y divide-gray-100 overflow-y-auto dark:divide-zinc-800"
          data-testid="member-list"
        >
          {settings?.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-zinc-400">{m.email}</p>
              </div>
              {m.role === 'owner' ? (
                <span className="text-sm text-gray-500 dark:text-zinc-400">Owner</span>
              ) : (
                <>
                  <select
                    value={m.role}
                    aria-label={`Role for ${m.name}`}
                    className={select}
                    onChange={(e) =>
                      void run(() => api.setMemberRole(boardId, m.userId, e.target.value as GrantableRole))
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => void run(() => api.removeMember(boardId, m.userId))}
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-zinc-800"
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
          {settings?.invites.map((inv) => (
            <li key={inv.email} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{inv.email}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Invited · {inv.role} · waiting for sign-up
                </p>
              </div>
              <button
                type="button"
                aria-label={`Cancel invite for ${inv.email}`}
                onClick={() => void run(() => api.cancelInvite(boardId, inv.email))}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>

        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-zinc-400">
          <Link2 size={14} /> Link access
        </h3>
        <div className="flex flex-col gap-1">
          {LINK_OPTIONS.map((o) => (
            <label
              key={String(o.value)}
              className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              <input
                type="radio"
                name="link"
                className="mt-1"
                checked={(settings?.linkRole ?? null) === o.value}
                onChange={() => void run(() => api.setLink(boardId, o.value))}
              />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-gray-500 dark:text-zinc-400">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {link && (
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-800"
              data-testid="share-link"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs hover:bg-gray-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              title="Create a new link (the old one stops working)"
              aria-label="Reset link"
              onClick={() => void run(() => api.rotateLink(boardId))}
              className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
