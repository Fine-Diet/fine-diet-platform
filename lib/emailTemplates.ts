/**
 * Email Template Renderer
 *
 * Server-side HTML rendering for email campaigns.
 * Resend's /emails endpoint requires explicit `html` or `text` — template_id + params alone
 * returns 422. This module renders template HTML inline before sending.
 *
 * Usage:
 *   const { html, text } = renderCampaignEmail('fine_print_weekly', vars);
 *   // then pass html/text directly to Resend, no template_id needed
 */

export interface CampaignEmailVars {
  firstName: string;
  headline: string;
  body: string;
  ctaUrl: string;
  ctaText: string;
  unsubscribeUrl: string;
  heroImageUrl?: string;
}

// ---------------------------------------------------------------------------
// Fine Print — Weekly HTML
// ---------------------------------------------------------------------------

const FINE_PRINT_WEEKLY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>The Fine Print</title>
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #e8e5de;">

          <!-- Masthead -->
          <tr>
            <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
              <div style="font-family:'Georgia',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#a8a090;margin-bottom:6px;">Fine Diet</div>
              <div style="font-family:'Georgia',serif;font-size:26px;color:#ffffff;font-style:italic;">The Fine Print</div>
            </td>
          </tr>

          <!-- Salutation -->
          <tr>
            <td style="padding:36px 40px 0;">
              <p style="margin:0;font-size:15px;color:#555;font-family:'Georgia',serif;">Hi {{FIRST_NAME}},</p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:20px 40px 0;">
              <h1 style="margin:0;font-family:'Georgia',serif;font-size:28px;font-weight:700;color:#1a1a1a;line-height:1.25;">{{HEADLINE}}</h1>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="width:40px;height:2px;background:#c8a96e;"></div>
            </td>
          </tr>

          {{HERO_IMAGE_BLOCK}}

          <!-- Body -->
          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0;font-size:16px;line-height:1.75;color:#333;font-family:'Georgia',serif;white-space:pre-line;">{{BODY}}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a1a1a;border-radius:3px;">
                    <a href="{{CTA_URL}}" style="display:inline-block;padding:14px 28px;font-family:'Georgia',serif;font-size:14px;color:#ffffff;text-decoration:none;letter-spacing:0.5px;">{{CTA_TEXT}}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#f5f4f0;border-top:1px solid #e8e5de;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:#999;font-family:Arial,sans-serif;">You're receiving this because you signed up for the Fine Print newsletter.</p>
              <p style="margin:0;font-size:12px;font-family:Arial,sans-serif;">
                <a href="{{UNSUBSCRIBE_URL}}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Product Update HTML
// ---------------------------------------------------------------------------

const PRODUCT_UPDATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f4">
    <tr>
      <td align="center" style="padding-top:40px;padding-bottom:40px;padding-left:16px;padding-right:16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td bgcolor="#0f172a" style="background-color:#0f172a;padding-top:28px;padding-bottom:28px;padding-left:40px;padding-right:40px;border-radius:8px 8px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:-0.3px;">Fine Diet</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;">Product Update</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding-top:40px;padding-bottom:40px;padding-left:40px;padding-right:40px;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#374151;margin-top:0;margin-bottom:24px;">Hi {{FIRST_NAME}},</p>
              <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;line-height:34px;color:#0f172a;margin-top:0;margin-bottom:20px;">{{HEADLINE}}</h1>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#374151;margin-top:0;margin-bottom:32px;white-space:pre-line;">{{BODY}}</p>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#0f172a" style="background-color:#0f172a;border-radius:6px;">
                    <a href="{{CTA_URL}}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;padding-top:14px;padding-bottom:14px;padding-left:28px;padding-right:28px;">{{CTA_TEXT}}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color:#f8fafc;padding-top:24px;padding-bottom:24px;padding-left:40px;padding-right:40px;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:top;">
                    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;margin-top:0;margin-bottom:4px;">Fine Diet &mdash; hi@myfinediet.com</p>
                    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;margin-top:0;margin-bottom:0;">You're receiving this because you signed up for Fine Diet product updates.</p>
                  </td>
                  <td align="right" style="vertical-align:top;white-space:nowrap;">
                    <a href="{{UNSUBSCRIBE_URL}}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(template: string, vars: CampaignEmailVars): string {
  const heroBlock = vars.heroImageUrl
    ? `<tr><td style="padding:24px 40px 0;"><img src="${escapeHtml(vars.heroImageUrl)}" alt="" width="520" border="0" style="width:100%;max-width:520px;border-radius:3px;display:block;" /></td></tr>`
    : '';

  return template
    .replace(/\{\{FIRST_NAME\}\}/g, escapeHtml(vars.firstName))
    .replace(/\{\{HEADLINE\}\}/g, escapeHtml(vars.headline))
    .replace(/\{\{BODY\}\}/g, escapeHtml(vars.body))
    .replace(/\{\{CTA_URL\}\}/g, escapeHtml(vars.ctaUrl))
    .replace(/\{\{CTA_TEXT\}\}/g, escapeHtml(vars.ctaText))
    .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, escapeHtml(vars.unsubscribeUrl))
    .replace(/\{\{HERO_IMAGE_BLOCK\}\}/g, heroBlock);
}

function renderText(vars: CampaignEmailVars): string {
  return [
    `Hi ${vars.firstName},`,
    '',
    vars.headline,
    '',
    vars.body,
    '',
    `${vars.ctaText}: ${vars.ctaUrl}`,
    '',
    '---',
    `Unsubscribe: ${vars.unsubscribeUrl}`,
  ].join('\n');
}

const TEMPLATE_HTML: Record<string, string> = {
  fine_print_weekly: FINE_PRINT_WEEKLY_HTML,
  product_update_weekly: PRODUCT_UPDATE_HTML,
};

/**
 * Render a campaign email to html + text strings ready to send via Resend.
 * Falls back to fine_print_weekly if the key is unrecognised.
 */
export function renderCampaignEmail(
  templateKey: string,
  vars: CampaignEmailVars,
): { html: string; text: string } {
  const template = TEMPLATE_HTML[templateKey] ?? FINE_PRINT_WEEKLY_HTML;
  return {
    html: renderHtml(template, vars),
    text: renderText(vars),
  };
}

