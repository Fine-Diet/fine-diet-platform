/**
 * Email Campaign Types
 *
 * Shared types for the Fine Diet email campaign management system.
 * Used by admin UI, API routes, and the send infrastructure.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type CampaignStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'archived';

export type CampaignType =
  | 'editorial'
  | 'nurture'
  | 'announcement'
  | 'promotional'
  | 'product_update';

export type AudienceKey =
  | 'fine_print_post_nurture'
  | 'product_updates_all'
  | 'newsletter'
  | 'waitlist';

export type TemplateKey = 'fine_print_weekly' | 'product_update_weekly';

// ---------------------------------------------------------------------------
// Content shape (stored in content_json column)
// ---------------------------------------------------------------------------

export interface CampaignContentJson {
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}

// ---------------------------------------------------------------------------
// Core record
// ---------------------------------------------------------------------------

export interface EmailCampaign {
  id: string;
  slug: string;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  template_key: TemplateKey;
  template_id: string | null;
  subject: string;
  preview_text: string;
  content_json: CampaignContentJson;
  hero_image_url: string | null;
  hero_image_asset_id: string | null;
  audience_key: AudienceKey;
  scheduled_for: string | null;
  created_by_person_id: string | null;
  approved_by_person_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Status metadata (labels, colors, allowed transitions)
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  sent: 'Sent',
  archived: 'Archived',
};

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  sent: 'bg-purple-100 text-purple-800',
  archived: 'bg-red-100 text-red-800',
};

/** Allowed status transitions per role */
export const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'approved', 'archived'],
  approved: ['in_review', 'scheduled', 'archived'],
  scheduled: ['approved', 'archived'],
  sent: ['archived'],
  archived: [],
};

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export interface TemplateOption {
  key: TemplateKey;
  label: string;
  templateId: string;
  description: string;
}

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    key: 'fine_print_weekly',
    label: 'Fine Print — Weekly',
    templateId: '6f8dfa6b-a0fd-420e-9cd0-db69ba842919',
    description: 'Editorial weekly newsletter. Masthead, headline, body, CTA.',
  },
  {
    key: 'product_update_weekly',
    label: 'Product Update',
    templateId: 'ba2cc47b-e325-42c7-b896-5f2ecf065219',
    description: 'Product and platform update emails. Clean layout with headline, body, and CTA.',
  },
];

// ---------------------------------------------------------------------------
// Audience registry
// ---------------------------------------------------------------------------

export interface AudienceOption {
  key: AudienceKey;
  label: string;
  description: string;
}

export const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    key: 'fine_print_post_nurture',
    label: 'Fine Print — Post-Nurture',
    description: 'Contacts who completed the 3-email Fine Print nurture sequence.',
  },
  {
    key: 'product_updates_all',
    label: 'Product Updates — All',
    description: 'Contacts with product_updates=true who are not globally unsubscribed.',
  },
  {
    key: 'newsletter',
    label: 'Newsletter',
    description: 'General newsletter subscribers.',
  },
  {
    key: 'waitlist',
    label: 'Waitlist',
    description: 'Product waitlist signups.',
  },
];

// ---------------------------------------------------------------------------
// Campaign type registry
// ---------------------------------------------------------------------------

export const CAMPAIGN_TYPE_OPTIONS: { value: CampaignType; label: string }[] = [
  { value: 'editorial', label: 'Editorial' },
  { value: 'product_update', label: 'Product Update' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'nurture', label: 'Nurture' },
];
