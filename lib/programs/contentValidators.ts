/**
 * Plans Phase 12 — Zod validators for program content authoring.
 *
 * These are the gatekeepers on every admin API route. Shapes stay close
 * to the DB columns; stricter-than-DB rules (slug shape, URL validity,
 * min/max title lengths) live here to keep the DB check-constraints
 * simple.
 */

import { z } from 'zod';

const STATUS_SCHEMA = z.enum(['draft', 'published', 'archived']);
const ITEM_TYPE_SCHEMA = z.enum([
  'article',
  'guidance',
  'video',
  'milestone',
]);

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const TRIMMED_STRING = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max);

const OPTIONAL_NULLABLE_STRING = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v));

const METADATA_SCHEMA = z
  .record(z.string(), z.unknown())
  .optional()
  .transform((v) => v ?? {});

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export const ProgramCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, or dashes.'),
  title: TRIMMED_STRING(1, 200),
  tagline: OPTIONAL_NULLABLE_STRING(280),
  description: OPTIONAL_NULLABLE_STRING(4000),
  storefront_href: OPTIONAL_NULLABLE_STRING(500),
  status: STATUS_SCHEMA.optional().default('draft'),
  metadata: METADATA_SCHEMA,
});

export const ProgramUpdateSchema = ProgramCreateSchema.partial().extend({
  // Slug is immutable after creation to preserve join semantics with
  // program_assignments.program_slug. Admins delete + recreate if needed.
  slug: z.undefined().optional(),
});

export type ProgramCreateInput = z.infer<typeof ProgramCreateSchema>;
export type ProgramUpdateInput = z.infer<typeof ProgramUpdateSchema>;

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ProgramModuleCreateSchema = z.object({
  title: TRIMMED_STRING(1, 200),
  description: OPTIONAL_NULLABLE_STRING(2000),
  ordinal: z.number().int().min(0).max(10000).optional(),
  status: STATUS_SCHEMA.optional().default('draft'),
  metadata: METADATA_SCHEMA,
});

export const ProgramModuleUpdateSchema = ProgramModuleCreateSchema.partial();

export type ProgramModuleCreateInput = z.infer<typeof ProgramModuleCreateSchema>;
export type ProgramModuleUpdateInput = z.infer<typeof ProgramModuleUpdateSchema>;

// ---------------------------------------------------------------------------
// Content item
// ---------------------------------------------------------------------------

const VIDEO_URL_SCHEMA = z
  .string()
  .trim()
  .max(1000)
  .url('video_url must be a valid URL.')
  .optional()
  .nullable()
  .transform((v) => (v == null || v === '' ? null : v));

export const ProgramContentItemCreateSchema = z
  .object({
    item_type: ITEM_TYPE_SCHEMA,
    title: TRIMMED_STRING(1, 200),
    summary: OPTIONAL_NULLABLE_STRING(500),
    body: OPTIONAL_NULLABLE_STRING(50000),
    video_url: VIDEO_URL_SCHEMA,
    video_provider: OPTIONAL_NULLABLE_STRING(64),
    estimated_minutes: z
      .number()
      .int()
      .min(0)
      .max(100000)
      .optional()
      .nullable()
      .transform((v) => (v == null ? null : v)),
    ordinal: z.number().int().min(0).max(10000).optional(),
    status: STATUS_SCHEMA.optional().default('draft'),
    metadata: METADATA_SCHEMA,
  })
  .superRefine((val, ctx) => {
    if (val.item_type === 'video' && !val.video_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['video_url'],
        message: 'video items require a video_url.',
      });
    }
  });

export const ProgramContentItemUpdateSchema = z
  .object({
    item_type: ITEM_TYPE_SCHEMA.optional(),
    title: TRIMMED_STRING(1, 200).optional(),
    summary: OPTIONAL_NULLABLE_STRING(500),
    body: OPTIONAL_NULLABLE_STRING(50000),
    video_url: VIDEO_URL_SCHEMA,
    video_provider: OPTIONAL_NULLABLE_STRING(64),
    estimated_minutes: z
      .number()
      .int()
      .min(0)
      .max(100000)
      .optional()
      .nullable()
      .transform((v) => (v == null ? null : v)),
    ordinal: z.number().int().min(0).max(10000).optional(),
    status: STATUS_SCHEMA.optional(),
    metadata: METADATA_SCHEMA,
  });

export type ProgramContentItemCreateInput = z.infer<
  typeof ProgramContentItemCreateSchema
>;
export type ProgramContentItemUpdateInput = z.infer<
  typeof ProgramContentItemUpdateSchema
>;

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

/**
 * Accepts the full ordered list of ids. Server will rewrite ordinals
 * 0..n-1 in that order inside a transaction.
 */
export const ReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1).max(500),
});
export type ReorderInput = z.infer<typeof ReorderSchema>;
