/**
 * Social Recipe / Meal Evidence Importer v1.
 *
 * New-build lane for recovering truthful recipe/meal evidence from
 * social posts and videos. This is intentionally separate from the
 * deterministic recipe paste parser; evidence is preserved before any
 * editable draft is created.
 */

import type { ImportedMeal, ImportedMealDraftPayload } from '@/lib/plans/types';

export const SOCIAL_IMPORT_VERSION = 'social-recipe-evidence-importer-v1';

export type SocialImportPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'threads'
  | 'x'
  | 'unknown';

export type SocialImportSupportedPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'facebook';

export type SocialImportContentType =
  | 'single_recipe'
  | 'multi_recipe'
  | 'meal_plan'
  | 'what_i_eat_in_a_day'
  | 'grocery_haul'
  | 'restaurant_or_menu'
  | 'supplement_or_product'
  | 'not_food_related'
  | 'unknown_or_insufficient';

export type SocialImportJobStatus =
  | 'pending'
  | 'evidence_acquired'
  | 'extracted'
  | 'draft_created'
  | 'manual_review'
  | 'failed';

export type SocialEvidenceSourceKind =
  | 'metadata'
  | 'creator_caption'
  | 'transcript'
  | 'external_transcript'
  | 'user_assisted_text'
  | 'onscreen_text'
  | 'user_hint';

export type SocialEvidenceQuality =
  | 'strong'
  | 'partial'
  | 'weak'
  | 'unavailable';

export interface SocialEvidenceReference {
  evidence_source_id: string;
  quote: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  frame_ref?: string | null;
}

export interface SocialImportReviewItem {
  code:
    | 'missing_quantity'
    | 'vague_quantity'
    | 'missing_servings'
    | 'unclear_step_order'
    | 'conflicting_evidence'
    | 'insufficient_evidence'
    | 'provider_timeout'
    | 'extraction_too_large'
    | 'provider_invalid_json'
    | 'model_unavailable'
    | 'extraction_validation_failed'
    | 'unsupported_content_type'
    | 'unsupported_platform'
    | 'needs_user_assisted_text';
  severity: 'info' | 'warning' | 'blocker';
  message: string;
  evidence_refs: SocialEvidenceReference[];
}

export interface SocialImportJob {
  id: string;
  person_id: string;
  source_url: string | null;
  platform: SocialImportPlatform;
  content_type: SocialImportContentType;
  status: SocialImportJobStatus;
  imported_meal_id: string | null;
  raw_request_json: SocialImportCreateInput;
  review_summary_json: SocialImportReviewItem[];
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialImportEvidenceSource {
  id: string;
  job_id: string;
  person_id: string;
  source_kind: SocialEvidenceSourceKind;
  source_label: string | null;
  platform: SocialImportPlatform;
  raw_text: string | null;
  normalized_text: string | null;
  language: string | null;
  quality: SocialEvidenceQuality;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface SocialExtractedField<T> {
  value: T;
  confidence: 'high' | 'medium' | 'low';
  evidence_refs: SocialEvidenceReference[];
}

export type SocialQuantityStatus =
  | 'stated'
  | 'vague'
  | 'inferred'
  | 'unknown';

export interface SocialExtractedIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  quantity_text: string | null;
  quantity_status: SocialQuantityStatus;
  preparation_note: string | null;
  confidence: 'high' | 'medium' | 'low';
  evidence_refs: SocialEvidenceReference[];
}

export interface SocialExtractedStep {
  order: number;
  instruction: string;
  timing_text: string | null;
  confidence: 'high' | 'medium' | 'low';
  evidence_refs: SocialEvidenceReference[];
}

export interface SocialExtractedRecipe {
  title: SocialExtractedField<string | null>;
  description: SocialExtractedField<string | null>;
  servings: SocialExtractedField<number | null> & {
    status: 'stated' | 'inferred' | 'unknown';
    text: string | null;
  };
  ingredients: SocialExtractedIngredient[];
  steps: SocialExtractedStep[];
  review_items: SocialImportReviewItem[];
}

export interface SocialExtractedMealPlanItem {
  label: string;
  description: string | null;
  evidence_refs: SocialEvidenceReference[];
  confidence: 'high' | 'medium' | 'low';
}

export interface SocialImportExtractionPayload {
  version: typeof SOCIAL_IMPORT_VERSION;
  content_type: SocialImportContentType;
  title: SocialExtractedField<string | null>;
  summary: string | null;
  recipes: SocialExtractedRecipe[];
  meal_plan_items: SocialExtractedMealPlanItem[];
  review_items: SocialImportReviewItem[];
  warnings: string[];
}

export interface SocialImportExtraction {
  id: string;
  job_id: string;
  person_id: string;
  extraction_version: string;
  provider: string;
  model: string | null;
  output_json: SocialImportExtractionPayload;
  warnings_json: string[];
  created_at: string;
}

export interface SocialImportCreateInput {
  url?: string | null;
  assisted_text?: string | null;
  onscreen_text?: string | null;
  user_hint?: string | null;
}

export interface SocialImportDetail {
  job: SocialImportJob;
  evidence_sources: SocialImportEvidenceSource[];
  extraction: SocialImportExtraction | null;
  imported_meal: ImportedMeal | null;
}

export interface SocialImportedMealDraftPayload extends ImportedMealDraftPayload {
  social_import: {
    version: typeof SOCIAL_IMPORT_VERSION;
    job_id: string;
    extraction_id: string | null;
    content_type: SocialImportContentType;
    review_items: SocialImportReviewItem[];
    evidence_source_ids: string[];
    claim_provenance: Record<string, SocialEvidenceReference[]>;
  };
}
