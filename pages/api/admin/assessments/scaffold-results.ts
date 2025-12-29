/**
 * API Route: Scaffold Results Packs
 * 
 * POST /api/admin/assessments/scaffold-results
 * 
 * Ensures results pack identities for levels 1-4 exist.
 * If missing, creates them. Otherwise returns existing.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface ScaffoldResultsRequest {
  assessmentType: string;
  resultsVersion: string | number;
  locale?: string | null;
}

interface ScaffoldResultsResponse {
  packs: {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
  };
  created: {
    level1: boolean;
    level2: boolean;
    level3: boolean;
    level4: boolean;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ScaffoldResultsResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { assessmentType, resultsVersion, locale } = req.body as ScaffoldResultsRequest;

    if (!assessmentType || resultsVersion === undefined) {
      return res.status(400).json({ error: 'assessmentType and resultsVersion are required' });
    }

    const versionStr = String(resultsVersion);
    const levels = ['level1', 'level2', 'level3', 'level4'] as const;
    const packs: { [key: string]: string } = {};
    const created: { [key: string]: boolean } = {};

    // Process each level
    for (const levelId of levels) {
      // Check if pack exists
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('results_packs')
        .select('id')
        .eq('assessment_type', assessmentType)
        .eq('results_version', versionStr)
        .eq('level_id', levelId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`Error checking results pack ${levelId}:`, checkError);
        return res.status(500).json({ error: checkError.message });
      }

      if (existing) {
        // Already exists
        packs[levelId] = existing.id;
        created[levelId] = false;
      } else {
        // Create identity
        const { data: newPack, error: createError } = await supabaseAdmin
          .from('results_packs')
          .insert({
            assessment_type: assessmentType,
            results_version: versionStr,
            level_id: levelId,
          })
          .select('id')
          .single();

        if (createError) {
          console.error(`Error creating results pack ${levelId}:`, createError);
          return res.status(500).json({ error: createError.message });
        }

        packs[levelId] = newPack.id;
        created[levelId] = true;

        // Ensure pointers row exists
        const { error: ptrError } = await supabaseAdmin
          .from('results_pack_pointers')
          .upsert(
            { pack_id: newPack.id },
            { onConflict: 'pack_id' }
          );

        if (ptrError) {
          console.warn(`Error ensuring pointers row for ${levelId} (non-blocking):`, ptrError);
        }
      }
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'assessments.scaffold_results',
        entity_type: 'results_packs',
        entity_id: null, // Multiple entities
        metadata: {
          assessment_type: assessmentType,
          results_version: versionStr,
          packs: packs,
          created: created,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({
      packs: {
        level1: packs.level1,
        level2: packs.level2,
        level3: packs.level3,
        level4: packs.level4,
      },
      created: {
        level1: created.level1,
        level2: created.level2,
        level3: created.level3,
        level4: created.level4,
      },
    });
  } catch (error) {
    console.error('Scaffold results error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

