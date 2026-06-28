/**
 * API Route: Public Module Discovery Metadata
 *
 * Returns published human-facing module discovery overrides. This is safe for
 * the public style-guide surface because it contains only nicknames, finder
 * descriptions, aliases, tags, and preview hints — never runtime truth.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  MODULE_DISCOVERY_SITE_CONTENT_KEY,
  type ModuleDiscoveryMetadataMap,
} from '@/lib/moduleDiscoveryMetadata';

interface ResponseBody {
  metadata: ModuleDiscoveryMetadataMap;
  updatedAt?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data, updated_at')
      .eq('key', MODULE_DISCOVERY_SITE_CONTENT_KEY)
      .eq('status', 'published')
      .maybeSingle();

    if (error || !data?.data) {
      return res.status(200).json({ metadata: {}, updatedAt: null });
    }

    const raw = data.data as { metadata?: ModuleDiscoveryMetadataMap } | ModuleDiscoveryMetadataMap;
    const metadata = 'metadata' in raw ? raw.metadata ?? {} : raw;

    return res.status(200).json({ metadata, updatedAt: data.updated_at ?? null });
  } catch {
    // Style guide falls back to code defaults when Supabase is unavailable.
    return res.status(200).json({ metadata: {}, updatedAt: null });
  }
}
