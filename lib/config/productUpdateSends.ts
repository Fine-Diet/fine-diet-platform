/**
 * Product Update Send Configuration
 *
 * Reference config for the Product Update email send system.
 * The actual send is triggered via POST /api/product-update/send
 * with an EditorialCampaign-shaped payload.
 *
 * Auth: Bearer <EDITORIAL_API_KEY>
 *
 * Audience rule:
 *   email_preferences.product_updates = true
 *   email_preferences.unsubscribe_all_at IS NULL
 *   (view: v_product_updates_audience)
 *
 * No fine_print_sequence_completed required.
 * No email_marketing subscription required.
 *
 * Events logged:
 *   product_update_sent        — one per successful send
 *   product_update_send_failed — one per failed send (with error metadata)
 */

/** "Product Update" template in Resend */
export const PRODUCT_UPDATE_TEMPLATE_ID = 'ba2cc47b-e325-42c7-b896-5f2ecf065219';

/**
 * Shape of the payload required by POST /api/product-update/send.
 * Identical to EditorialCampaign — reuse the same interface.
 */
export interface ProductUpdateCampaign {
  /** Unique slug — logged in people_events.metadata.campaignSlug */
  campaignSlug: string;
  /** Resend template ID */
  templateId: string;
  /** Email subject line */
  subject: string;
  /** Preview / preheader text */
  previewText: string;
  /** Update headline (→ HEADLINE merge field) */
  headline: string;
  /** Body copy — plain text, no HTML (→ BODY merge field) */
  body: string;
  /** Primary CTA URL (→ CTA_URL merge field) */
  ctaUrl: string;
  /** CTA button label (→ CTA_TEXT merge field) */
  ctaText: string;
}

/**
 * Local development send URL.
 * Replace with the production domain when triggering from n8n or a script.
 */
export const PRODUCT_UPDATE_SEND_URL = 'http://localhost:3000/api/product-update/send';
