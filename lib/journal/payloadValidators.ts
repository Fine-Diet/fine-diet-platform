/**
 * Zod validators for journal entry payloads per entry_type.
 * Used by journalServerService for create/update validation.
 */

import { z } from 'zod';
import type { JournalEntryType } from './types';

// ============================================================================
// Per-type payload schemas
// ============================================================================

export const intakePayloadSchema = z.object({
  name: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  calories: z.number().optional(),
  macros: z
    .object({
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .optional(),
  foodObjectId: z.string().optional(),
  servingSizeG: z.number().optional(),
  measures: z
    .array(
      z.object({
        unit: z.string(),
        grams: z.number(),
        label: z.string().optional(),
      })
    )
    .optional(),
});

export const waterPayloadSchema = z.object({
  amount: z.number().min(0.1, 'Amount must be > 0'),
  unit: z.enum(['oz', 'ml']),
});

export const supplementPayloadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  dose: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
});

export const moodPayloadSchema = z.object({
  score: z.number().min(1).max(10),
  tags: z.array(z.string()).optional(),
  note: z.string().max(500).optional(),
});

export const bowelPayloadSchema = z.object({
  bristol: z.number().min(1).max(7),
  urgency: z.number().min(0).max(3).optional(),
  discomfort: z.number().min(0).max(3).optional(),
  note: z.string().max(500).optional(),
});

export const cyclePayloadSchema = z.object({
  phase: z.enum(['period', 'follicular', 'ovulation', 'luteal']).optional(),
  cycleDay: z.number().min(1).max(35).optional(),
  symptoms: z.array(z.string()).optional(),
});

export const movementPayloadSchema = z.object({
  type: z.string().min(1, 'Type is required').max(100),
  minutes: z.number().min(1, 'Minutes must be > 0').max(1440),
  intensity: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

export const bloodPressurePayloadSchema = z.object({
  systolic: z.number().min(50).max(300),
  diastolic: z.number().min(30).max(200),
  unit: z.literal('mmHg'),
  pulse: z.number().min(30).max(250).optional(),
  note: z.string().max(500).optional(),
});

export const sleepPayloadSchema = z.object({
  durationMinutes: z.number().min(1).max(1440),
  quality: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  note: z.string().max(500).optional(),
});

export const notePayloadSchema = z.object({
  text: z.string().min(1, 'Text is required').max(2000),
});

// other: allow arbitrary object
export const otherPayloadSchema = z.record(z.string(), z.unknown()).optional().default({});

// ============================================================================
// Validator map
// ============================================================================

const PAYLOAD_SCHEMAS: Record<string, z.ZodType<unknown>> = {
  intake: intakePayloadSchema,
  water: waterPayloadSchema,
  supplement: supplementPayloadSchema,
  mood: moodPayloadSchema,
  bowel: bowelPayloadSchema,
  cycle: cyclePayloadSchema,
  movement: movementPayloadSchema,
  blood_pressure: bloodPressurePayloadSchema,
  sleep: sleepPayloadSchema,
  note: notePayloadSchema,
  other: otherPayloadSchema,
};

/**
 * Validate payload for a given entry_type.
 * Returns { success: true, data } or { success: false, error: string }.
 */
export function validatePayload(
  entryType: JournalEntryType,
  payload: unknown
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = PAYLOAD_SCHEMAS[entryType] ?? PAYLOAD_SCHEMAS.other;
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }
  const firstIssue = result.error.issues[0];
  const message = firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Invalid payload';
  return { success: false, error: message };
}
