import { buildHaulInviteEmailContent, sendHaulInviteEmail } from '../haulInviteEmail';

const URL_ = 'https://myfinediet.com/haul-invitations/5b0a6d0e-2f0b-4d6e-9d3e-0c1f6f1d7a11';

describe('buildHaulInviteEmailContent', () => {
  it('links to the given landing URL and names the owner', () => {
    const c = buildHaulInviteEmailContent({ inviteUrl: URL_, ownerName: 'Olive Owner' });
    expect(c.subject).toBe('Olive Owner invited you to a grocery Haul on Fine Diet');
    expect(c.html).toContain(`href="${URL_}"`);
    expect(c.text).toContain(URL_);
  });

  it('falls back to a neutral sender when the owner name is unknown', () => {
    const c = buildHaulInviteEmailContent({ inviteUrl: URL_, ownerName: null });
    expect(c.subject).toBe('You have been invited to a grocery Haul on Fine Diet');
    expect(c.html).toContain('Someone invited you');
  });

  it('HTML-escapes the owner name and strips control characters', () => {
    const c = buildHaulInviteEmailContent({
      inviteUrl: URL_,
      ownerName: '<script>alert(1)</script>\r\nBcc: x@y.z',
    });
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
    expect(c.subject).not.toMatch(/[\r\n]/);
  });
});

describe('sendHaulInviteEmail', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to Resend with the bearer key and the shared sender', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(
      sendHaulInviteEmail({
        to: 'a@b.co',
        inviteUrl: URL_,
        ownerName: 'Olive',
        apiKey: 're_key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe('sent');
    const [endpoint, init] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer re_key');
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({ from: 'Fine Diet <hi@myfinediet.com>', to: 'a@b.co' });
  });

  it('fails closed without an API key (no request made)', async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const fetchImpl = jest.fn();
    try {
      await expect(
        sendHaulInviteEmail({
          to: 'a@b.co',
          inviteUrl: URL_,
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ).resolves.toBe('failed');
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.RESEND_API_KEY = original;
    }
  });

  it('reports failure (never throws) on a rejected response or a network error', async () => {
    await expect(
      sendHaulInviteEmail({
        to: 'a@b.co',
        inviteUrl: URL_,
        apiKey: 'k',
        fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch,
      }),
    ).resolves.toBe('failed');
    await expect(
      sendHaulInviteEmail({
        to: 'a@b.co',
        inviteUrl: URL_,
        apiKey: 'k',
        fetchImpl: jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch,
      }),
    ).resolves.toBe('failed');
  });
});
