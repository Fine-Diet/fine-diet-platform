/**
 * API Route: Resolve Results Pack
 * 
 * GET /api/results-packs/resolve?assessmentType=...&resultsVersion=...&levelId=...
 * 
 * Resolves results pack from CMS (with preview support) or file fallback.
 * Client-side endpoint for ResultsScreen component.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { resolveResultsPack } from '@/lib/assessments/results/resolveResultsPack';

interface ResolveResponse {
  success: boolean;
  pack?: any;
  source?: 'cms' | 'file';
  contentHash?: string;
  schemaVersion?: string;
  publishedAt?: string;
  resultsPackRef?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResolveResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const assessmentType = req.query.assessmentType as string;
    const resultsVersion = req.query.resultsVersion as string;
    const levelId = req.query.levelId as string;
    const preview = req.query.preview === '1' || req.query.preview === 'true';
    
    // Parse resultsPackRef from query (if provided)
    let resultsPackRef = null;
    if (req.query.resultsPackRef && typeof req.query.resultsPackRef === 'string') {
      try {
        resultsPackRef = JSON.parse(req.query.resultsPackRef);
      } catch {
        // Invalid JSON, ignore
      }
    }

    if (!assessmentType || !resultsVersion || !levelId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: assessmentType, resultsVersion, levelId',
      });
    }

    // Get user role for preview check (silent - don't send error response if not authenticated)
    let userRole: 'user' | 'editor' | 'admin' = 'user';
    try {
      // Use getCurrentUserWithRoleFromApi to check auth (returns null if not authenticated)
      const { getCurrentUserWithRoleFromApi } = await import('@/lib/authServer');
      const user = await getCurrentUserWithRoleFromApi(req, res);
      
      if (user) {
        userRole = user.role;
      }
    } catch {
      // Not authenticated or error - default to 'user' (silent failure)
    }

    // Resolve pack
    const result = await resolveResultsPack({
      assessmentType,
      resultsVersion,
      levelId,
      preview,
      userRole,
      resultsPackRef: resultsPackRef || undefined,
    });

    return res.status(200).json({
      success: true,
      pack: result.pack,
      source: result.source,
      contentHash: result.contentHash,
      schemaVersion: result.schemaVersion,
      publishedAt: result.publishedAt,
      resultsPackRef: result.resultsPackRef,
    });
  } catch (error) {
    console.error('Resolve results pack error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

