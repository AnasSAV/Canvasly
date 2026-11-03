import { colorForUser, type GrantableRole, type LinkRole, type ShareSettings } from '@canvasly/shared';
import { Check, CircleAlert, CircleCheck, Copy, RefreshCw, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, shareLinkUrl } from '../lib/api';
import { Dialog } from './Dialog';
import { Select } from './Select';

const ROLES: { value: GrantableRole; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

const LINK_OPTIONS: { value: LinkRole; label: string; hint: string }[] = [
  { value: null, label: 'Off', hint: 'Only people added above can open the board.' },
  { value: 'viewer', label: 'Anyone can view', hint: 'Public, view-only. No sign-in needed.' },
  {
    value: 'editor',
    label: 'Signed-in users can edit',
    hint: 'Anyone who signs in and opens the link joins as an editor.',
  },
];

const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? '?';

const removeButton =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger';

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
      // Anything changed here while this was loading is newer than what it returns.
      .then((loaded) => setSettings((current) => current ?? loaded))
      .catch((e: Error) => setMessage({ kind: 'error', text: e.message }));
  }, [boardId]);

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
  const MessageIcon = message?.kind === 'error' ? CircleAlert : CircleCheck;

  return (
    <Dialog label="Share board" title="Share board" onClose={onClose} testId="share-dialog">
      <form onSubmit={invite} className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input
          type="email"
          required
          autoFocus
          placeholder="Invite by email"
          aria-label="Invite by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field min-w-40 flex-1"
          data-testid="invite-email"
        />
        <Select label="Role" value={role} options={ROLES} onChange={setRole} className="w-28" />
        <button type="submit" disabled={busy} className="btn btn-primary">
          Invite
        </button>
      </form>
      {message && (
        <p
          className={`mt-2 flex items-start gap-1.5 text-[13px] leading-snug ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}
          data-testid="share-message"
        >
          <MessageIcon size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{message.text}</span>
        </p>
      )}

      <h3 className="mt-5 mb-1 text-xs font-semibold text-muted">People with access</h3>
      <ul className="max-h-56 overflow-y-auto" data-testid="member-list">
        {!settings && (
          <li className="flex items-center gap-2.5 py-2" aria-hidden>
            <span className="skeleton h-7 w-7 rounded-full!" />
            <span className="skeleton h-3.5 w-40" />
          </li>
        )}
        {settings?.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: colorForUser(m.userId) }}
              aria-hidden
            >
              {initial(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{m.name}</p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            {m.role === 'owner' ? (
              <span className="badge mr-1">Owner</span>
            ) : (
              <>
                <Select
                  small
                  label={`Role for ${m.name}`}
                  value={m.role}
                  options={ROLES}
                  onChange={(next) => void run(() => api.setMemberRole(boardId, m.userId, next))}
                  className="w-24"
                />
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  data-tip="Remove"
                  onClick={() => void run(() => api.removeMember(boardId, m.userId))}
                  className={removeButton}
                >
                  <X size={15} />
                </button>
              </>
            )}
          </li>
        ))}
        {settings?.invites.map((inv) => (
          <li key={inv.email} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-[11px] font-semibold text-muted"
              aria-hidden
            >
              {initial(inv.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{inv.email}</p>
              <p className="text-xs text-muted">Invited · {inv.role} · waiting for sign-up</p>
            </div>
            <button
              type="button"
              aria-label={`Cancel invite for ${inv.email}`}
              data-tip="Cancel invite"
              onClick={() => void run(() => api.cancelInvite(boardId, inv.email))}
              className={removeButton}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-muted">Link access</h3>
      <div className="overflow-hidden rounded-lg border border-line">
        {LINK_OPTIONS.map((o) => {
          const checked = (settings?.linkRole ?? null) === o.value;
          return (
            <label
              key={String(o.value)}
              className={`relative flex cursor-pointer items-start gap-2.5 border-b border-line px-3 py-2 last:border-0 ${
                checked ? 'bg-selected' : 'hover:bg-hover'
              }`}
            >
              <input
                type="radio"
                name="link"
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                checked={checked}
                onChange={() => void run(() => api.setLink(boardId, o.value))}
              />
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-(--focus) ${
                  checked ? 'border-teal bg-teal' : 'border-line-strong bg-surface'
                }`}
                aria-hidden
              >
                {checked && <span className="h-1.5 w-1.5 rounded-full bg-on-teal" />}
              </span>
              <span>
                <span className={`block text-[13px] font-semibold ${checked ? 'text-on-selected' : ''}`}>
                  {o.label}
                </span>
                <span className={`block text-xs ${checked ? 'text-on-selected' : 'text-muted'}`}>
                  {o.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {link && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            readOnly
            value={link}
            aria-label="Share link"
            onFocus={(e) => e.target.select()}
            className="field num bg-sunken! text-xs!"
            data-testid="share-link"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-secondary w-24"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            data-tip="Create a new link. The old one stops working."
            aria-label="Reset link"
            onClick={() => void run(() => api.rotateLink(boardId))}
            className="btn btn-secondary w-9 px-0!"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
