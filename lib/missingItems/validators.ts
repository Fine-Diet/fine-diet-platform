/**
 * Plans Phase 14 — Zod validators for admin request-queue mutations.
 *
 * Runtime creates (from Journal search / Imports) are not user-facing
 * and go through the server service directly with typed inputs, so no
 * schema is exposed for them.
 */

import { z } from 'zod';

export const MissingItemStatusSchema = z.enum([
  'open',
  'resolved',
  'dismissed',
]);

export const MissingItemListQuerySchema = z.object({
  status: MissingItemStatusSchema.optional(),
  context: z
    .enum(['journal_search', 'recipe_import', 'manual_meal_entry', 'other'])
    .optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type MissingItemListQueryInput = z.infer<
  typeof MissingItemListQuerySchema
>;

export const MissingItemResolveSchema = z
  .object({
    status: z.enum(['resolved', 'dismissed']),
    resolved_food_object_id: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    resolution_notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    /**
     * Phase 15 — when true on a resolved request, also append
     * `alias_value` (or the request's normalized_input when
     * `alias_value` is omitted) to the linked food_objects.aliases
     * array. Ignored on 'dismissed'.
     */
    apply_alias_enrichment: z.boolean().optional().default(false),
    alias_value: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'dismissed' && val.resolved_food_object_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolved_food_object_id'],
        message: 'Dismissed requests cannot carry a resolved_food_object_id.',
      });
    }
    if (val.status === 'dismissed' && val.apply_alias_enrichment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apply_alias_enrichment'],
        message: 'Dismissed requests cannot apply alias enrichment.',
      });
    }
    if (val.apply_alias_enrichment && !val.resolved_food_object_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apply_alias_enrichment'],
        message:
          'Alias enrichment requires resolved_food_object_id (aliases must attach to a trusted object).',
      });
    }
  });

export type MissingItemResolveInput = z.infer<typeof MissingItemResolveSchema>;

/**
 * Admin-side food-object candidate search — query is the substring the
 * admin typed, limit is clamped at the route layer.
 */
export const FoodObjectCandidateQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((v) => v),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type FoodObjectCandidateQueryInput = z.infer<
  typeof FoodObjectCandidateQuerySchema
>;
