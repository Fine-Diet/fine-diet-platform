/**
 * API Route: Get Waitlist Signups
 * 
 * Admin-only endpoint for viewing waitlist signups.
 * Protected with role-based access control (admin/editor roles)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  goal: string | null;
  source: string | null;
  created_at: string;
}

interface GetResponse {
  entries: WaitlistEntry[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | { error: string }>
) {
  // Require editor or admin role
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  // Import server client (only works on server)
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  // GET: Fetch all waitlist entries
  if (req.method === 'GET') {
    try {
      const { data: entries, error: entriesError } = await supabaseAdmin
        .from('waitlist')
        .select('id, email, name, goal, source, created_at')
        .order('created_at', { ascending: false });

      if (entriesError) {
        console.error('Supabase error fetching waitlist entries:', entriesError);
        return res.status(500).json({
          error: `Database error: ${entriesError.message}`,
        });
      }

      return res.status(200).json({
        entries: (entries || []) as WaitlistEntry[],
      });
    } catch (error) {
      console.error('Error fetching waitlist entries:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch waitlist entries',
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}

