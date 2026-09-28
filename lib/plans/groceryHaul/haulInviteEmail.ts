/**
 * Invite to Haul v1 — transactional invitation email (Resend).
 *
 * Used for invitees who already have a Fine Diet / Supabase account, where
 * `auth.admin.inviteUserByEmail` must NOT be called (Supabase errors for an
 * existing confirmed user), and as the fallback when the Auth invite fails.
 *
 * The email only carries a link to the dedicated landing. It never grants
 * membership: the recipient must sign in and pass the accept checks
 * (confirmed Auth email == invitation target, linked people record).
 *
 * Server-only. Uses the same Resend HTTP API, sender, and RESEND_API_KEY as the
 * existing campaign/product-update sends.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Fine Diet <hi@myfinediet.com>';
const REPLY_TO = 'hi@myfinediet.com';

export interface SendHaulInviteEmailArgs {
  to: string;
  inviteUrl: string;
  /** Owner's display name, when known. */
  ownerName?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Single-line, control-character-free display text. */
function cleanName(value: string | null | undefined): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : null;
}

export function buildHaulInviteEmailContent(args: {
  inviteUrl: string;
  ownerName?: string | null;
}): { subject: string; html: string; text: string } {
  const owner = cleanName(args.ownerName);
  const who = owner ?? 'Someone';
  const subject = owner
    ? `${owner} invited you to a grocery Haul on Fine Diet`
    : 'You have been invited to a grocery Haul on Fine Diet';
  const safeUrl = escapeHtml(args.inviteUrl);
  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">',
    `<p style="font-size:16px;line-height:1.5">${escapeHtml(who)} invited you to add items to a grocery Haul on Fine Diet.</p>`,
    `<p style="margin:24px 0"><a href="${safeUrl}" style="background:#1a1a1a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:15px">View invitation</a></p>`,
    '<p style="font-size:13px;line-height:1.5;color:#666">Sign in with this email address to accept. If you were not expecting this, you can ignore this message.</p>',
    '</div>',
  ].join('');
  const text = `${who} invited you to add items to a grocery Haul on Fine Diet.\n\nView the invitation: ${args.inviteUrl}\n\nSign in with this email address to accept. If you were not expecting this, you can ignore this message.`;
  return { subject, html, text };
}

/** Resolves 'sent' only when Resend accepted the message; never throws. */
export async function sendHaulInviteEmail(
  args: SendHaulInviteEmailArgs,
): Promise<'sent' | 'failed'> {
  const apiKey = args.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[haulInviteEmail] RESEND_API_KEY is not configured.');
    return 'failed';
  }
  const { subject, html, text } = buildHaulInviteEmailContent(args);
  try {
    const response = await (args.fetchImpl ?? fetch)(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: args.to,
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      console.error('[haulInviteEmail] Resend rejected the message:', response.status);
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[haulInviteEmail] Resend request threw:', err);
    return 'failed';
  }
}
