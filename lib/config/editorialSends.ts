/**
 * Editorial Send Configuration — Fine Print Weekly
 *
 * Each send is defined as an EditorialCampaign object.
 * The campaignSlug is stored in people_events.metadata for observability.
 *
 * ## How to trigger a send
 *
 * Option A — via n8n (recommended for production):
 *   POST https://finediet.app.n8n.cloud/webhook/fine-diet/editorial-send
 *   Content-Type: application/json
 *   Body: { ...campaign }
 *
 * Option B — directly (for testing):
 *   POST https://myfinediet.com/api/editorial/send
 *   Authorization: Bearer <EDITORIAL_API_KEY>
 *   Content-Type: application/json
 *   Body: { ...campaign }
 *
 * ## Merge fields in the "Fine Print — Weekly" template
 *   {{{FIRST_NAME}}}       — auto-resolved from audience
 *   {{{UNSUBSCRIBE_URL}}}  — signed URL, auto-generated per contact
 *   {{{HEADLINE}}}         — from campaign config
 *   {{{BODY}}}             — from campaign config (plain text, no HTML tags)
 *   {{{CTA_URL}}}          — from campaign config
 *   {{{CTA_TEXT}}}         — from campaign config
 */

export interface EditorialCampaign {
  /** Unique slug — logged in people_events.metadata.campaignSlug */
  campaignSlug: string;
  /** Resend template ID */
  templateId: string;
  /** Email subject line */
  subject: string;
  /** Preview / preheader text */
  previewText: string;
  /** Article headline (→ HEADLINE merge field) */
  headline: string;
  /** Editorial body copy — plain text only, no HTML (→ BODY merge field) */
  body: string;
  /** Primary CTA URL (→ CTA_URL merge field) */
  ctaUrl: string;
  /** CTA button label (→ CTA_TEXT merge field) */
  ctaText: string;
}

// ---------------------------------------------------------------------------
// Template IDs
// ---------------------------------------------------------------------------

/** "Fine Print — Weekly" template in Resend */
export const FINE_PRINT_WEEKLY_TEMPLATE_ID = '6f8dfa6b-a0fd-420e-9cd0-db69ba842919';

// ---------------------------------------------------------------------------
// Campaign library
// ---------------------------------------------------------------------------

/**
 * Issue 001 — First editorial send to post-nurture audience.
 * Update subject/headline/body before sending.
 */
export const finePrintIssue001: EditorialCampaign = {
  campaignSlug: 'fine-print-001',
  templateId: FINE_PRINT_WEEKLY_TEMPLATE_ID,
  subject: 'Why most nutrition advice is backwards',
  previewText: 'The real reason popular diets fail — and what actually works.',
  headline: 'Why most nutrition advice is backwards',
  body: 'Most diet advice starts with restriction. Cut carbs. Count calories. Eliminate entire food groups. The problem is not the advice itself — it is the order of operations.\n\nBefore you change what you eat, you need to understand how your body actually responds to food. That means looking at your gut microbiome, your metabolic markers, and your current eating patterns as a system.\n\nAt Fine Diet, we call this the precision-first approach. Instead of applying generic rules, we identify the specific changes most likely to move the needle for your biology.',
  ctaUrl: 'https://myfinediet.com',
  ctaText: 'Read the full take',
};
