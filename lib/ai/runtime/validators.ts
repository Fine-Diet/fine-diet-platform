/**
 * Plans Phase 16 — Zod schemas for AI runtime admin inputs.
 */

import { z } from 'zod';
import { AI_MODEL_TIERS, AI_TASK_TYPES } from './types';

export const ModelConfigUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    tier: z.enum(AI_MODEL_TIERS).optional(),
    display_name: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    task_types: z.array(z.enum(AI_TASK_TYPES)).optional(),
    max_input_tokens: z.number().int().min(1).max(2_000_000).optional().nullable(),
    max_output_tokens: z.number().int().min(1).max(2_000_000).optional().nullable(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'No fields provided.',
  });
export type ModelConfigUpdateInput = z.infer<typeof ModelConfigUpdateSchema>;

export const TaskPolicyUpdateSchema = z
  .object({
    preferred_model_config_id: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    fallback_model_config_id: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    deterministic_fallback_available: z.boolean().optional(),
    required_entitlement: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .transform((v) => (v == null || v === '' ? null : v)),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'No fields provided.',
  });
export type TaskPolicyUpdateInput = z.infer<typeof TaskPolicyUpdateSchema>;
