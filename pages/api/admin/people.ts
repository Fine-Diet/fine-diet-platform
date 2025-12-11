/**
 * API Route: Manage User Roles
 * 
 * Admin-only endpoint for viewing and updating user roles.
 * Protected with role-based access control (admin only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi, type UserRole } from '@/lib/authServer';

interface ProfileSummary {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

interface GetResponse {
  profiles: ProfileSummary[];
}

interface PatchRequest {
  id: string;
  role: UserRole;
}

interface PatchResponse {
  profile: ProfileSummary;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PatchResponse | { error: string }>
) {
  // Require admin role only
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  // Import server client (only works on server)
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  // GET: Fetch all profiles
  if (req.method === 'GET') {
    try {
      // Fetch profiles from profiles table
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, role, updated_at')
        .order('updated_at', { ascending: false });

      if (profilesError) {
        console.error('Supabase error fetching profiles:', profilesError);
        return res.status(500).json({
          error: `Database error: ${profilesError.message}`,
        });
      }

      // Fetch user emails from auth.users using admin API
      // Note: We need to get emails separately since profiles table doesn't store email
      const profileSummaries: ProfileSummary[] = [];
      
      for (const profile of profiles || []) {
        try {
          // Get user details from auth.users via admin API
          const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
          
          const email = userData?.user?.email || '';
          const createdAt = userData?.user?.created_at || profile.updated_at || new Date().toISOString();

          profileSummaries.push({
            id: profile.id,
            email,
            role: (profile.role as UserRole) || 'user',
            created_at: createdAt,
          });
        } catch (err) {
          // If we can't get user details, still include the profile with empty email
          console.warn(`Could not fetch email for profile ${profile.id}:`, err);
          profileSummaries.push({
            id: profile.id,
            email: '',
            role: (profile.role as UserRole) || 'user',
            created_at: profile.updated_at || new Date().toISOString(),
          });
        }
      }

      return res.status(200).json({ profiles: profileSummaries });
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }

  // PATCH: Update a user's role
  if (req.method === 'PATCH') {
    try {
      const body = req.body as PatchRequest;

      // Validate input
      if (!body.id || typeof body.id !== 'string' || body.id.trim() === '') {
        return res.status(400).json({
          error: 'Invalid id: must be a non-empty string',
        });
      }

      const validRoles: UserRole[] = ['user', 'editor', 'admin'];
      if (!body.role || !validRoles.includes(body.role)) {
        return res.status(400).json({
          error: `Invalid role: must be one of ${validRoles.join(', ')}`,
        });
      }

      // Update the profile
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ role: body.role })
        .eq('id', body.id)
        .select('id, role, updated_at')
        .single();

      if (updateError) {
        console.error('Supabase error updating profile:', updateError);
        return res.status(500).json({
          error: `Database error: ${updateError.message}`,
        });
      }

      if (!updatedProfile) {
        return res.status(404).json({
          error: 'Profile not found',
        });
      }

      // Get user email from auth.users
      let email = '';
      let createdAt = updatedProfile.updated_at || new Date().toISOString();
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(body.id);
        email = userData?.user?.email || '';
        createdAt = userData?.user?.created_at || createdAt;
      } catch (err) {
        console.warn(`Could not fetch email for profile ${body.id}:`, err);
      }

      const profileSummary: ProfileSummary = {
        id: updatedProfile.id,
        email,
        role: (updatedProfile.role as UserRole) || 'user',
        created_at: createdAt,
      };

      return res.status(200).json({ profile: profileSummary });
    } catch (error) {
      console.error('API error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}

