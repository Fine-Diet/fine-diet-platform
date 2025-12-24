/**
 * Role-based Access Control Helper for API Routes
 * 
 * Wrapper around requireRoleFromApi for results pack CMS
 * Uses supabaseAdmin for database operations (bypasses RLS when needed)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi, type AuthenticatedUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export interface RequireRoleResult {
  user: AuthenticatedUser;
  ok: boolean;
}

/**
 * Require editor or admin role for API routes
 * 
 * Returns user info if authorized, otherwise sends 401/403 response
 * 
 * Note: Uses supabaseAdmin for database operations (bypasses RLS)
 * RLS policies still apply for client-side queries
 */
export async function requireRole(
  req: NextApiRequest,
  res: NextApiResponse,
  roles: Array<'admin' | 'editor'>
): Promise<RequireRoleResult | null> {
  const user = await requireRoleFromApi(req, res, roles);

  if (!user) {
    return null; // Response already sent by requireRoleFromApi
  }

  return { user, ok: true };
}

/**
 * Get supabaseAdmin client for use with requireRole
 * Exported for convenience in API routes
 */
export { supabaseAdmin };

