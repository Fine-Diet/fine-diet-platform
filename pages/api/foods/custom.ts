/**
 * POST /api/foods/custom — Create a custom food item
 * 
 * Creates a new food_objects row with source_type='user_custom'
 * tied to the authenticated user's person_id.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { createCustomFood } from '@/lib/food/foodServerService';

// Zod schema for request validation
const CreateCustomFoodSchema = z.object({
  // Required
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  
  // Base nutrition (optional but encouraged)
  calories: z.number().min(0, 'Calories must be >= 0').optional(),
  proteinG: z.number().min(0, 'Protein must be >= 0').optional(),
  carbsG: z.number().min(0, 'Carbs must be >= 0').optional(),
  fatG: z.number().min(0, 'Fat must be >= 0').optional(),
  
  // Serving info
  servingSizeG: z.number().min(0.1, 'Serving size must be > 0').optional(),
  servingUnit: z.string().max(50).optional(),
  servingDescription: z.string().max(200).optional(),
  householdServingText: z.string().max(200).optional(),
  
  // Advanced micronutrients
  fiberG: z.number().min(0, 'Fiber must be >= 0').optional(),
  sugarG: z.number().min(0, 'Sugar must be >= 0').optional(),
  sodiumMg: z.number().min(0, 'Sodium must be >= 0').optional(),
  nutrientsExtended: z.record(z.string(), z.number()).optional(),
  
  // Options
  saveToFavorites: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await getCurrentUserWithRoleFromApi(req, res);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Resolve person_id
    const personId = await getPersonIdFromAuthUserId(user.id);
    if (!personId) {
      return res.status(403).json({ error: 'No linked person record' });
    }

    // Validate request body
    const parseResult = CreateCustomFoodSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', errors });
    }

    const input = parseResult.data;

    // Create the custom food
    const food = await createCustomFood(personId, input);

    return res.status(201).json({ food });
  } catch (error) {
    console.error('[POST /api/foods/custom] Error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to create custom food' 
    });
  }
}
