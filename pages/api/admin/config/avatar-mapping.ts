/**
 * Admin API: Save Avatar Mapping
 * 
 * Admin-only endpoint for saving avatar-mapping:global config.
 * 
 * Phase 2 / Step 2: Avatar mapping admin API.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { avatarMappingSchema } from '@/lib/contentValidators';
import { DEFAULT_AVATAR_MAPPING } from '@/lib/config/defaults';
import { isConfigKeyAllowed } from '@/lib/config/registry';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Check admin auth
  const userResult = await getCurrentUserWithRoleFromSSR({ req, res } as any);

  if (!userResult.user || userResult.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }

  // Phase 2 / Step 3: Validate key is registered
  const configKey = 'avatar-mapping:global';
  if (!isConfigKeyAllowed(configKey)) {
    return res.status(400).json({
      success: false,
      error: `Config key "${configKey}" is not registered in the config registry.`,
    });
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const payload = req.body;

    // If payload is empty or equals defaults, delete the CMS entry (reset)
    const isEmpty = !payload || Object.keys(payload).length === 0;
    const equalsDefaults = JSON.stringify(payload) === JSON.stringify(DEFAULT_AVATAR_MAPPING);

    if (isEmpty || equalsDefaults) {
      // Delete the entry
      const { error } = await supabaseAdmin
      .from('site_content')
      .delete()
      .eq('key', configKey);

      if (error) {
        console.error('[Avatar Mapping API] Error deleting entry:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to reset avatar mapping',
        });
      }

      return res.status(200).json({ success: true });
    }

    // Validate payload
    const validationResult = avatarMappingSchema.safeParse(payload);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation error: ${validationResult.error.message}`,
      });
    }

    // Upsert into site_content
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: configKey,
          data: validationResult.data,
          status: 'published',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key',
        }
      );

    if (error) {
      console.error('[Avatar Mapping API] Error upserting:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save avatar mapping',
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Avatar Mapping API] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
