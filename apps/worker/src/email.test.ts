import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardInviteEmail, escapeHtml, resetPasswordEmail, sendEmail, verifyEmail } from './email';

const env = (key: string) =>
  ({ RESEND_API_KEY: key, EMAIL_FROM: 'Canvasly <noreply@example.com>' }) as unknown as Env;

afterEach(() => vi.restoreAllMocks());

describe('email templates', () => {
  it('escapes user-controlled names and titles in HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
    const mail = boardInviteEmail({
      to: 'bob@example.com',
      inviter: '<b>Eve</b>',
      title: '<script>steal()</script>',
      role: 'editor',
      url: 'https://canvasly.test/b/1',
      hasAccount: true,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Eve</b>');
    expect(mail.html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
    expect(mail.subject).toContain('<b>Eve</b>'); // subjects are plain text, not HTML
  });

  it('includes the action link in both HTML and text parts', () => {
    for (const mail of [
      verifyEmail('a@example.com', 'Ada', 'https://canvasly.test/api/auth/verify-email?token=t&x=1'),
      resetPasswordEmail('a@example.com', 'Ada', 'https://canvasly.test/api/auth/reset-password/t'),
    ]) {
      expect(mail.text).toContain('https://canvasly.test/');
      expect(mail.html).toContain('href="https://canvasly.test/');
    }
    expect(verifyEmail('a@example.com', 'Ada', 'https://x.test/?a=1&b=2').html).toContain('a=1&amp;b=2');
  });

  it('tells invitees without an account to sign up with the invited address', () => {
    const mail = boardInviteEmail({
      to: 'new@example.com',
      inviter: 'Ada',
      title: 'Roadmap',
      role: 'viewer',
      url: 'https://canvasly.test/',
      hasAccount: false,
    });
    expect(mail.text).toContain('new@example.com');
    expect(mail.html).toContain('Sign up');
  });
});

describe('sendEmail', () => {
  it('posts to Resend with the configured sender', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"1"}'));
    await sendEmail(env('re_test'), verifyEmail('a@example.com', 'Ada', 'https://x.test/v'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init!.body as string) as { from: string; to: string[]; subject: string };
    expect(body.from).toBe('Canvasly <noreply@example.com>');
    expect(body.to).toEqual(['a@example.com']);
  });

  it('throws on API errors so callers can decide what to do', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('domain not verified', { status: 403 }));
    await expect(sendEmail(env('re_test'), verifyEmail('a@example.com', 'Ada', 'u'))).rejects.toThrow(/403/);
  });

  it('only logs when no API key is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail(env(''), verifyEmail('a@example.com', 'Ada', 'https://x.test/v'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toContain('https://x.test/v');
  });
});
