/**
 * Shared error → HTTP mapping for the Haul collaboration API routes.
 * Server-only. Never echoes raw database or Auth error text.
 */

import type { NextApiResponse } from 'next';
import {
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
} from './service';

export function respondCollaborationError(
  res: NextApiResponse,
  err: unknown,
  tag: string,
): void {
  if (err instanceof GroceryHaulNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof GroceryHaulForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof GroceryHaulValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof GroceryHaulConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  console.error(`[API ${tag}] error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

export function singleQueryString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
