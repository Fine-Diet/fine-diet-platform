import { z } from 'zod';
import { SOCIAL_IMPORT_VERSION } from './types';

export const SocialImportPlatformSchema = z.enum([
  'youtube',
  'tiktok',
  'instagram',
  'facebook',
  'threads',
  'x',
  'unknown',
]);

export const SocialImportContentTypeSchema = z.enum([
  'single_recipe',
  'multi_recipe',
  'meal_plan',
  'what_i_eat_in_a_day',
  'grocery_haul',
  'restaurant_or_menu',
  'supplement_or_product',
  'not_food_related',
  'unknown_or_insufficient',
]);

export const SocialImportJobStatusSchema = z.enum([
  'pending',
  'evidence_acquired',
  'extracted',
  'draft_created',
  'manual_review',
  'failed',
]);

export const SocialEvidenceSourceKindSchema = z.enum([
  'metadata',
  'creator_caption',
  'transcript',
  'external_transcript',
  'user_assisted_text',
  'onscreen_text',
  'user_hint',
]);

export const SocialEvidenceQualitySchema = z.enum([
  'strong',
  'partial',
  'weak',
  'unavailable',
]);

export const SocialEvidenceReferenceSchema = z.object({
  evidence_source_id: z.string().uuid(),
  quote: z.string().max(1000).nullable(),
  start_seconds: z.number().nonnegative().nullable().optional(),
  end_seconds: z.number().nonnegative().nullable().optional(),
  frame_ref: z.string().max(300).nullable().optional(),
});

export const SocialImportReviewItemSchema = z.object({
  code: z.enum([
    'missing_quantity',
    'vague_quantity',
    'missing_servings',
    'unclear_step_order',
    'conflicting_evidence',
    'insufficient_evidence',
    'provider_timeout',
    'extraction_too_large',
    'provider_invalid_json',
    'model_unavailable',
    'extraction_validation_failed',
    'unsupported_content_type',
    'unsupported_platform',
    'needs_user_assisted_text',
  ]),
  severity: z.enum(['info', 'warning', 'blocker']),
  message: z.string().min(1).max(1000),
  evidence_refs: z.array(SocialEvidenceReferenceSchema).max(20),
});

const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const SocialExtractedFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: ConfidenceSchema,
    evidence_refs: z.array(SocialEvidenceReferenceSchema).max(20),
  });

export const SocialExtractedIngredientSchema = z.object({
  name: z.string().trim().min(1).max(300),
  quantity: z.number().positive().nullable(),
  unit: z.string().trim().max(80).nullable(),
  quantity_text: z.string().trim().max(200).nullable(),
  quantity_status: z.enum(['stated', 'vague', 'inferred', 'unknown']),
  preparation_note: z.string().trim().max(500).nullable(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(SocialEvidenceReferenceSchema).min(1).max(20),
});

export const SocialExtractedStepSchema = z.object({
  order: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(2000),
  timing_text: z.string().trim().max(200).nullable(),
  confidence: ConfidenceSchema,
  evidence_refs: z.array(SocialEvidenceReferenceSchema).min(1).max(20),
});

export const SocialExtractedRecipeSchema = z.object({
  title: SocialExtractedFieldSchema(z.string().trim().max(300).nullable()),
  description: SocialExtractedFieldSchema(z.string().trim().max(2000).nullable()),
  servings: SocialExtractedFieldSchema(z.number().positive().max(100).nullable()).and(
    z.object({
      status: z.enum(['stated', 'inferred', 'unknown']),
      text: z.string().trim().max(200).nullable(),
    }),
  ),
  ingredients: z.array(SocialExtractedIngredientSchema).max(200),
  steps: z.array(SocialExtractedStepSchema).max(100),
  review_items: z.array(SocialImportReviewItemSchema).max(100),
});

export const SocialExtractedMealPlanItemSchema = z.object({
  label: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullable(),
  evidence_refs: z.array(SocialEvidenceReferenceSchema).min(1).max(20),
  confidence: ConfidenceSchema,
});

export const SocialImportExtractionPayloadSchema = z.object({
  version: z.literal(SOCIAL_IMPORT_VERSION),
  content_type: SocialImportContentTypeSchema,
  title: SocialExtractedFieldSchema(z.string().trim().max(300).nullable()),
  summary: z.string().trim().max(3000).nullable(),
  recipes: z.array(SocialExtractedRecipeSchema).max(20),
  meal_plan_items: z.array(SocialExtractedMealPlanItemSchema).max(100),
  review_items: z.array(SocialImportReviewItemSchema).max(150),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(50),
});

export const SocialImportCreateRequestSchema = z
  .object({
    url: z.string().url().nullable().optional(),
    assisted_text: z.string().min(1).max(40_000).nullable().optional(),
    onscreen_text: z.string().min(1).max(20_000).nullable().optional(),
    user_hint: z.string().min(1).max(5000).nullable().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.url?.trim()) ||
      Boolean(data.assisted_text?.trim()) ||
      Boolean(data.onscreen_text?.trim()) ||
      Boolean(data.user_hint?.trim()),
    {
      message:
        'Provide at least one social URL, assisted text, on-screen text, or user hint.',
    },
  );

export const SocialImportRerunRequestSchema = z.object({
  assisted_text: z.string().min(1).max(40_000).nullable().optional(),
  onscreen_text: z.string().min(1).max(20_000).nullable().optional(),
  user_hint: z.string().min(1).max(5000).nullable().optional(),
});

export type SocialImportCreateRequest = z.infer<
  typeof SocialImportCreateRequestSchema
>;
