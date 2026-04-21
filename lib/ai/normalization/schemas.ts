/**
 * Plans Phase 17 — Normalization task schemas.
 *
 * AI-assisted normalization must pass Zod validation before its output
 * is trusted by a feature. If the AI output fails validation, the
 * caller falls back to deterministic parsing and the original text is
 * preserved.
 *
 * The shapes here are intentionally small and non-semantic: we want
 * language cleanup and coarse structure, not food-object creation or
 * NDS math. Trusted matching and nutrition estimation happen
 * downstream in the deterministic importer.
 */

import { z } from 'zod';

const MAX_TEXT_CHARS = 50_000;

const trimmedString = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, { message: 'Text cannot be empty.' });

export const NormalizedRecipeTextSchema = z.object({
  title: z.string().trim().max(300).optional().nullable(),
  text: trimmedString.refine((s) => s.length <= MAX_TEXT_CHARS, {
    message: `Normalized text exceeds ${MAX_TEXT_CHARS} characters.`,
  }),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type NormalizedRecipeText = z.infer<typeof NormalizedRecipeTextSchema>;

export const NormalizedMenuTextSchema = z.object({
  restaurant_name: z.string().trim().max(300).optional().nullable(),
  text: trimmedString.refine((s) => s.length <= MAX_TEXT_CHARS, {
    message: `Normalized text exceeds ${MAX_TEXT_CHARS} characters.`,
  }),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type NormalizedMenuText = z.infer<typeof NormalizedMenuTextSchema>;

/**
 * Generic "structure extraction" result for future tasks (e.g.
 * pulling an ingredient list out of messy copy). Kept deliberately
 * minimal — extend when a concrete feature needs it.
 */
export const ExtractedStructureSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1).max(200).nullable().optional(),
        lines: z.array(z.string().trim().min(1).max(500)).min(1).max(500),
      }),
    )
    .min(1)
    .max(100),
});
export type ExtractedStructure = z.infer<typeof ExtractedStructureSchema>;
