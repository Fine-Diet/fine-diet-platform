/**
 * Plans Phase 13 — Zod validators for progress writes.
 */

import { z } from 'zod';

export const ProgressStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
]);

export const ProgressStatusPatchSchema = z.object({
  status: ProgressStatusSchema,
  /**
   * Optional 0-100 numeric progress. Item-level checkbox progress
   * leaves this unset; a future rich player can supply it.
   */
  progress_percent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable()
    .transform((v) => (v == null ? null : v)),
  notes: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
});

export type ProgressStatusPatchInput = z.infer<
  typeof ProgressStatusPatchSchema
>;
