/**
 * Transactional email through Resend's HTTP API (free tier: 3,000/month, 100/day). Cloudflare's own Email
 * Service can't send to arbitrary recipients on the Workers Free plan.
 *
 * Without RESEND_API_KEY (local dev, tests) emails are logged instead of sent, and the auth config keeps
 * email verification off so sign-up still works.
 */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const emailEnabled = (env: Env): boolean => !!env.RESEND_API_KEY;

export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email not configured] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, client-safe HTML layout with a single call-to-action button. */
function layout(
  heading: string,
  paragraphs: string[],
  action: { label: string; url: string },
  footer: string,
) {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;line-height:1.5">${t}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f2f5f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0b2a2a">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #d8e1df;border-radius:10px;padding:32px">
<div style="font-weight:700;font-size:16px;color:#034d4c;margin-bottom:24px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ed5b0f;vertical-align:-1px;margin-right:7px"></span>Canvasly</div>
<h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>${p}
<a href="${escapeHtml(action.url)}" style="display:inline-block;background:#f38020;color:#0b2a2a;text-decoration:none;padding:10px 18px;border-radius:7px;font-weight:600">${action.label}</a>
<p style="margin:24px 0 0;font-size:12px;color:#486362;line-height:1.5">${footer}</p>
</div></body></html>`;
}

export function verifyEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: 'Confirm your email for Canvasly',
    html: layout(
      `Welcome, ${escapeHtml(name)}`,
      ['Confirm your email address to finish setting up your Canvasly account.'],
      { label: 'Confirm email', url },
      "If you didn't create an account, you can ignore this email.",
    ),
    text: `Welcome, ${name}.\n\nConfirm your email to finish setting up your Canvasly account:\n${url}\n\nIf you didn't create an account, ignore this email.`,
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: 'Reset your Canvasly password',
    html: layout(
      'Reset your password',
      [`Hi ${escapeHtml(name)}, someone asked to reset the password for your Canvasly account.`],
      { label: 'Choose a new password', url },
      "This link expires in 1 hour. If you didn't ask for it, you can ignore this email — your password won't change.",
    ),
    text: `Hi ${name},\n\nReset your Canvasly password (link expires in 1 hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function boardInviteEmail(opts: {
  to: string;
  inviter: string;
  title: string;
  role: 'editor' | 'viewer';
  url: string;
  hasAccount: boolean;
}): Email {
  const { to, inviter, title, role, url, hasAccount } = opts;
  const verb = role === 'editor' ? 'edit' : 'view';
  const next = hasAccount
    ? 'Open the board:'
    : `Create a Canvasly account with this email address (${to}) and confirm it — the board will appear on your dashboard.`;
  return {
    to,
    subject: `${inviter} shared “${title}” with you`,
    html: layout(
      `${escapeHtml(inviter)} shared a board with you`,
      [
        `You can now ${verb} <strong>${escapeHtml(title)}</strong> on Canvasly.`,
        ...(hasAccount ? [] : [escapeHtml(next)]),
      ],
      { label: hasAccount ? 'Open board' : 'Sign up', url },
      'You received this because a Canvasly user invited this address to a board.',
    ),
    text: `${inviter} shared "${title}" with you on Canvasly (${role}).\n\n${next}\n${url}`,
  };
}
