/**
 * Admin Page: Email Campaign Editor
 *
 * Full editor for a single campaign. Three modes:
 *   - Edit: structured content fields, template/audience selection, image picker
 *   - Preview: in-browser render using template HTML + current campaign values
 *   - Details: status history, metadata
 *
 * Actions available:
 *   - Auto-save on every field blur
 *   - Preview (client-side, no email sent)
 *   - Send Proof (real email to one test address)
 *   - Status transitions (Submit for Review, Approve, Archive)
 *
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useCallback, useRef, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { ImageFieldWithPicker } from '@/components/admin/ImageFieldWithPicker';
import type { EmailCampaign, CampaignStatus, CampaignContentJson } from '@/lib/emailCampaignTypes';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CAMPAIGN_TYPE_OPTIONS,
  AUDIENCE_OPTIONS,
  TEMPLATE_OPTIONS,
  STATUS_TRANSITIONS,
} from '@/lib/emailCampaignTypes';
import type { MetricsResponse, CampaignMetrics, EmailEventRow } from '@/pages/api/admin/campaigns/[id]/metrics';

// ---------------------------------------------------------------------------
// Template HTML for in-browser preview
// Mirrors the published Resend templates.
// Variables: {{{FIRST_NAME}}}, {{{HEADLINE}}}, {{{BODY}}}, {{{CTA_URL}}}, {{{CTA_TEXT}}}, {{{UNSUBSCRIBE_URL}}}
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
              <p style="margin:0;font-size:15px;color:#555;font-family:'Georgia',serif;">Hi {{{FIRST_NAME}}},</p>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:20px 40px 0;">
              <h1 style="margin:0;font-family:'Georgia',serif;font-size:28px;font-weight:700;color:#1a1a1a;line-height:1.25;">{{{HEADLINE}}}</h1>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="width:40px;height:2px;background:#c8a96e;"></div>
            </td>
          </tr>

          <!-- Hero Image (conditional) -->
          {{#if HERO_IMAGE_URL}}
          <tr>
            <td style="padding:24px 40px 0;">
              <img src="{{{HERO_IMAGE_URL}}}" alt="" style="width:100%;max-width:520px;border-radius:3px;display:block;" />
            </td>
          </tr>
          {{/if}}

          <!-- Body -->
          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0;font-size:16px;line-height:1.75;color:#333;font-family:'Georgia',serif;white-space:pre-line;">{{{BODY}}}</p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a1a1a;border-radius:3px;">
                    <a href="{{{CTA_URL}}}" style="display:inline-block;padding:14px 28px;font-family:'Georgia',serif;font-size:14px;color:#ffffff;text-decoration:none;letter-spacing:0.5px;">{{{CTA_TEXT}}}</a>
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
                <a href="{{{UNSUBSCRIBE_URL}}}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
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
// Product Update template HTML (mirrors the published "Product Update" Resend template)
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
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#374151;margin-top:0;margin-bottom:24px;">Hi {{{FIRST_NAME}}},</p>
              <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;line-height:34px;color:#0f172a;margin-top:0;margin-bottom:20px;">{{{HEADLINE}}}</h1>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#374151;margin-top:0;margin-bottom:32px;white-space:pre-line;">{{{BODY}}}</p>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#0f172a" style="background-color:#0f172a;border-radius:6px;">
                    <a href="{{{CTA_URL}}}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;padding-top:14px;padding-bottom:14px;padding-left:28px;padding-right:28px;">{{{CTA_TEXT}}}</a>
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
                    <a href="{{{UNSUBSCRIBE_URL}}}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
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

const PREVIEW_TEMPLATES: Record<string, string> = {
  fine_print_weekly: FINE_PRINT_WEEKLY_HTML,
  product_update_weekly: PRODUCT_UPDATE_HTML,
};

// ---------------------------------------------------------------------------
// Render preview HTML by replacing merge field placeholders
// ---------------------------------------------------------------------------

function renderPreviewHtml(
  template: string,
  campaign: EmailCampaign,
  content: CampaignContentJson,
): string {
  const heroBlock = campaign.hero_image_url
    ? `<tr><td style="padding:24px 40px 0;"><img src="${campaign.hero_image_url}" alt="" style="width:100%;max-width:520px;border-radius:3px;display:block;" /></td></tr>`
    : '';

  return template
    .replace(/\{\{\{FIRST_NAME\}\}\}/g, 'Rashad')
    .replace(/\{\{\{HEADLINE\}\}\}/g, content.headline || '<em style="color:#aaa">(No headline)</em>')
    .replace(/\{\{\{BODY\}\}\}/g, content.body || '<em style="color:#aaa">(No body copy)</em>')
    .replace(/\{\{\{CTA_URL\}\}\}/g, content.ctaUrl || '#')
    .replace(/\{\{\{CTA_TEXT\}\}\}/g, content.ctaText || 'Learn More')
    .replace(/\{\{\{UNSUBSCRIBE_URL\}\}\}/g, '#preview-unsubscribe')
    .replace(/\{\{\{HERO_IMAGE_URL\}\}\}/g, campaign.hero_image_url || '')
    .replace(/\{\{#if HERO_IMAGE_URL\}\}[\s\S]*?<\/tr>/g, heroBlock ? heroBlock : '')
    .replace(/\{\{\/if\}\}/g, '');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CAMPAIGN_STATUS_COLORS[status]}`}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {hint && <span className="ml-2 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {maxLength && (
        <p className="mt-1 text-xs text-gray-400 text-right">{value.length}/{maxLength}</p>
      )}
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof modal
// ---------------------------------------------------------------------------

function ProofModal({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const send = async () => {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error || 'Send failed.' });
      } else {
        setResult({ ok: true, message: `Proof sent to ${data.sentTo}` });
      }
    } catch {
      setResult({ ok: false, message: 'Network error.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Send Proof</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sends this campaign to one address only. Uses the real send stack — subject is prefixed with [PROOF].
        </p>

        {result && (
          <div className={`rounded p-3 mb-4 text-sm ${result.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {result.message}
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test@example.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && send()}
          autoFocus
        />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !email.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm"
          >
            {sending ? 'Sending…' : 'Send Proof'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reporting tab component
// ---------------------------------------------------------------------------

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  delivered:        'Delivered',
  opened:           'Opened',
  clicked:          'Clicked',
  bounced:          'Bounced',
  complained:       'Spam Complaint',
  delivery_delayed: 'Delayed',
  failed:           'Failed',
  suppressed:       'Suppressed',
};

const EVENT_COLORS: Record<string, string> = {
  delivered:  'bg-green-100 text-green-800',
  opened:     'bg-blue-100 text-blue-800',
  clicked:    'bg-purple-100 text-purple-800',
  bounced:    'bg-red-100 text-red-800',
  complained: 'bg-orange-100 text-orange-800',
  failed:     'bg-red-100 text-red-800',
  suppressed: 'bg-gray-100 text-gray-600',
  delivery_delayed: 'bg-yellow-100 text-yellow-800',
};

function ReportingTab({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/campaigns/${campaignId}/metrics`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load metrics.');
        setData(json as MetricsResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">Loading metrics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, recentEvents, topUrls } = data;
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const noData = metrics.sent === 0 && metrics.delivered === 0;

  return (
    <div className="space-y-6">
      {noData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            No send data yet. Metrics will appear here after this campaign is sent and Resend delivers events via webhook.
          </p>
        </div>
      )}

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Sent" value={metrics.sent} />
        <MetricCard label="Delivered" value={metrics.delivered} />
        <MetricCard
          label="Opens"
          value={metrics.opened}
          sub={metrics.delivered > 0 ? `${fmtPct(metrics.open_rate)} open rate` : undefined}
        />
        <MetricCard
          label="Clicks"
          value={metrics.clicked}
          sub={metrics.delivered > 0 ? `${fmtPct(metrics.click_rate)} click rate` : undefined}
        />
        <MetricCard label="Bounced" value={metrics.bounced} />
      </div>

      {/* Top URLs */}
      {topUrls.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Clicked Links</h3>
          <div className="space-y-2">
            {topUrls.map(({ url, clicks }) => (
              <div key={url} className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-800 w-8 text-right flex-shrink-0">{clicks}</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate min-w-0"
                  title={url}
                >
                  {url}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            Recent Activity
            {recentEvents.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">last {recentEvents.length} events</span>
            )}
          </h3>
        </div>

        {recentEvents.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400">No events recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
            {recentEvents.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    EVENT_COLORS[ev.event_type] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                </span>
                <span className="text-sm text-gray-700 truncate min-w-0 flex-1">{ev.email}</span>
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline truncate max-w-[200px]"
                    title={ev.url}
                  >
                    {ev.url}
                  </a>
                )}
                <span className="text-xs text-gray-400 flex-shrink-0">{fmtDate(ev.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'edit' | 'preview' | 'reporting';

interface PageProps {
  user: AuthenticatedUser | null;
  campaign: EmailCampaign | null;
  error?: string;
}

export default function CampaignEditorPage({ user, campaign: initialCampaign, error: serverError }: PageProps) {
  const [campaign, setCampaign] = useState<EmailCampaign | null>(initialCampaign);
  const [tab, setTab] = useState<Tab>('edit');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <p className="text-gray-600">You don't have permission to access this area.</p>
      </main>
    );
  }

  if (serverError || !campaign) {
    return (
      <>
        <Head><title>Campaign Not Found • Fine Diet Admin</title></Head>
        <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
          <div className="max-w-4xl mx-auto px-4 py-10">
            <Link href="/admin/campaigns" className="text-sm text-gray-600 hover:text-gray-900 mb-6 inline-block">← Back to Campaigns</Link>
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <p className="text-sm text-red-800">{serverError || 'Campaign not found.'}</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const rawContent = campaign.content_json || ({} as Partial<CampaignContentJson>);
  const content: CampaignContentJson = {
    headline: rawContent.headline ?? '',
    body: rawContent.body ?? '',
    ctaText: rawContent.ctaText ?? '',
    ctaUrl: rawContent.ctaUrl ?? '',
  };

  const isSent = campaign.status === 'sent' || campaign.status === 'archived';
  const allowedTransitions = STATUS_TRANSITIONS[campaign.status] || [];

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  const scheduleSave = useCallback(
    (patch: Partial<EmailCampaign> & { content_json?: CampaignContentJson }) => {
      if (isSent) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        setSaveError(null);
        try {
          const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Save failed.');
          setCampaign(data.campaign);
          setSaveOk(true);
          setTimeout(() => setSaveOk(false), 2000);
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'Save failed.');
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [campaign.id, isSent],
  );

  const updateField = (field: keyof EmailCampaign, value: unknown) => {
    setCampaign((prev) => prev ? { ...prev, [field]: value } : prev);
    scheduleSave({ [field]: value });
  };

  const updateContent = (contentPatch: Partial<CampaignContentJson>) => {
    const next = { ...content, ...contentPatch };
    setCampaign((prev) => prev ? { ...prev, content_json: next } : prev);
    scheduleSave({ content_json: next });
  };

  const updateHeroImage = (url: string) => {
    setCampaign((prev) => prev ? { ...prev, hero_image_url: url } : prev);
    scheduleSave({ hero_image_url: url });
  };

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  const transitionStatus = async (nextStatus: CampaignStatus) => {
    setStatusBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status change failed.');
      setCampaign(data.campaign);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Status change failed.');
    } finally {
      setStatusBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Preview HTML
  // ---------------------------------------------------------------------------

  const previewTemplateHtml = PREVIEW_TEMPLATES[campaign.template_key] ?? FINE_PRINT_WEEKLY_HTML;
  const previewHtml = renderPreviewHtml(previewTemplateHtml, campaign, content);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const templateOption = TEMPLATE_OPTIONS.find((t) => t.key === campaign.template_key);

  return (
    <>
      <Head>
        <title>{campaign.name} • Fine Diet Admin</title>
      </Head>

      {showProof && (
        <ProofModal campaignId={campaign.id} onClose={() => setShowProof(false)} />
      )}

      <div className="min-h-screen bg-gray-100 pt-[100px] pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <div className="mb-6">
            <Link href="/admin/campaigns" className="text-sm text-gray-600 hover:text-gray-900 mb-3 inline-block">
              ← All Campaigns
            </Link>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
                  <StatusBadge status={campaign.status} />
                </div>
                <p className="text-sm text-gray-400 font-mono">{campaign.slug}</p>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {saving && <span className="text-xs text-gray-400">Saving…</span>}
                {saveOk && <span className="text-xs text-green-600">Saved</span>}

                {!isSent && (
                  <button
                    type="button"
                    onClick={() => setShowProof(true)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Send Proof
                  </button>
                )}

                {allowedTransitions.includes('in_review') && (
                  <button
                    type="button"
                    onClick={() => transitionStatus('in_review')}
                    disabled={statusBusy}
                    className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
                  >
                    Submit for Review
                  </button>
                )}

                {allowedTransitions.includes('approved') && (
                  <button
                    type="button"
                    onClick={() => transitionStatus('approved')}
                    disabled={statusBusy}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}

                {allowedTransitions.includes('draft') && campaign.status === 'in_review' && (
                  <button
                    type="button"
                    onClick={() => transitionStatus('draft')}
                    disabled={statusBusy}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back to Draft
                  </button>
                )}

                {allowedTransitions.includes('archived') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Archive this campaign?')) transitionStatus('archived');
                    }}
                    disabled={statusBusy}
                    className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Error banner */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-800">
              {saveError}
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex -mb-px gap-6">
              {(['edit', 'preview', 'reporting'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === t
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'edit' ? 'Edit' : t === 'preview' ? 'Preview' : 'Reporting'}
                </button>
              ))}
            </nav>
          </div>

          {/* ── EDIT TAB ── */}
          {tab === 'edit' && (
            <div className="space-y-6">

              {/* Identity */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                <h2 className="text-base font-semibold text-gray-800 mb-2">Identity</h2>

                <TextField
                  label="Campaign Name"
                  value={campaign.name}
                  onChange={(v) => updateField('name', v)}
                  placeholder="e.g. Fine Print Issue 002"
                />

                <TextField
                  label="Slug"
                  hint="URL-safe identifier"
                  value={campaign.slug}
                  onChange={(v) => updateField('slug', v)}
                  placeholder="fine-print-002"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Campaign Type</FieldLabel>
                    <select
                      value={campaign.campaign_type}
                      onChange={(e) => updateField('campaign_type', e.target.value)}
                      disabled={isSent}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {CAMPAIGN_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <FieldLabel>Audience</FieldLabel>
                    <select
                      value={campaign.audience_key}
                      onChange={(e) => updateField('audience_key', e.target.value)}
                      disabled={isSent}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {AUDIENCE_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      {AUDIENCE_OPTIONS.find((a) => a.key === campaign.audience_key)?.description}
                    </p>
                  </div>
                </div>

                <div>
                  <FieldLabel>Template</FieldLabel>
                  <select
                    value={campaign.template_key}
                    onChange={(e) => updateField('template_key', e.target.value)}
                    disabled={isSent}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TEMPLATE_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  {templateOption && (
                    <p className="mt-1 text-xs text-gray-400">{templateOption.description}</p>
                  )}
                </div>
              </div>

              {/* Email Envelope */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                <h2 className="text-base font-semibold text-gray-800 mb-2">Envelope</h2>

                <TextField
                  label="Subject Line"
                  hint="shown in inbox"
                  value={campaign.subject}
                  onChange={(v) => updateField('subject', v)}
                  placeholder="Why most nutrition advice is backwards"
                  maxLength={78}
                />

                <TextField
                  label="Preview Text"
                  hint="preheader · ~90 chars"
                  value={campaign.preview_text}
                  onChange={(v) => updateField('preview_text', v)}
                  placeholder="The real reason popular diets fail — and what actually works."
                  maxLength={150}
                />
              </div>

              {/* Content */}
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                <h2 className="text-base font-semibold text-gray-800 mb-2">Content</h2>

                <TextField
                  label="Headline"
                  hint="renders inside email body"
                  value={content.headline}
                  onChange={(v) => updateContent({ headline: v })}
                  placeholder="Why most nutrition advice is backwards"
                />

                <TextareaField
                  label="Body"
                  hint="plain text, line breaks preserved"
                  value={content.body}
                  onChange={(v) => updateContent({ body: v })}
                  placeholder="Most diet advice starts with restriction…"
                  rows={8}
                />

                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    label="CTA Text"
                    value={content.ctaText}
                    onChange={(v) => updateContent({ ctaText: v })}
                    placeholder="Read the full take"
                  />
                  <TextField
                    label="CTA URL"
                    value={content.ctaUrl}
                    onChange={(v) => updateContent({ ctaUrl: v })}
                    placeholder="https://myfinediet.com"
                  />
                </div>
              </div>

              {/* Hero Image */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Hero Image</h2>
                <ImageFieldWithPicker
                  label="Hero Image"
                  spec="600px wide · JPG or PNG recommended"
                  value={campaign.hero_image_url || ''}
                  onChange={updateHeroImage}
                  buttonText="Choose from Library"
                />
              </div>

              {/* Scheduling (informational for V1) */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-2">Scheduling</h2>
                <p className="text-sm text-gray-500 mb-3">
                  For V1, scheduling is informational. The actual send is triggered via n8n or the editorial send API.
                </p>
                <div>
                  <FieldLabel>Target Send Date/Time (UTC)</FieldLabel>
                  <input
                    type="datetime-local"
                    value={campaign.scheduled_for ? campaign.scheduled_for.slice(0, 16) : ''}
                    onChange={(e) => updateField('scheduled_for', e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-gray-400">Campaign ID</dt>
                    <dd className="font-mono text-gray-600 text-xs mt-0.5 break-all">{campaign.id}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Template ID</dt>
                    <dd className="font-mono text-gray-600 text-xs mt-0.5">{campaign.template_id || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Created</dt>
                    <dd className="text-gray-600 mt-0.5">{new Date(campaign.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Last Updated</dt>
                    <dd className="text-gray-600 mt-0.5">{new Date(campaign.updated_at).toLocaleString()}</dd>
                  </div>
                  {campaign.sent_at && (
                    <div>
                      <dt className="text-gray-400">Sent At</dt>
                      <dd className="text-gray-600 mt-0.5">{new Date(campaign.sent_at).toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}

          {/* ── PREVIEW TAB ── */}
          {tab === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500">
                    In-browser preview using sample merge values: <strong>First Name = Rashad</strong>.
                    No email is sent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProof(true)}
                  className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700"
                >
                  Send Proof Instead →
                </button>
              </div>

              {/* Subject preview */}
              <div className="bg-gray-800 text-white rounded-t-lg px-5 py-3 text-sm font-mono">
                <span className="text-gray-400 mr-3">Subject:</span>
                {campaign.subject || <span className="text-gray-500 italic">(no subject set)</span>}
                {campaign.preview_text && (
                  <span className="ml-3 text-gray-400 text-xs">· {campaign.preview_text}</span>
                )}
              </div>

              {/* Email render */}
              <div className="border border-gray-200 border-t-0 rounded-b-lg overflow-hidden">
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '700px', border: 'none', background: '#f5f4f0' }}
                  sandbox="allow-same-origin"
                  title="Email Preview"
                />
              </div>

              <p className="mt-3 text-xs text-gray-400 text-center">
                Preview uses a local template approximation. The actual Resend template may differ slightly.
              </p>
            </div>
          )}

          {/* ── REPORTING TAB ── */}
          {tab === 'reporting' && (
            <ReportingTab campaignId={campaign.id} />
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, campaign: null } };
  }

  const { id } = context.params as { id: string };

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return { props: { user, campaign: null, error: 'Campaign not found.' } };
    }

    return { props: { user, campaign: data as EmailCampaign } };
  } catch (err) {
    return { props: { user, campaign: null, error: 'Failed to load campaign.' } };
  }
};
