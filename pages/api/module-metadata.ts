/**
 * API Route: Public Module Discovery Metadata
 *
 * Returns published human-facing module discovery overrides. This is safe for
 * the public style-guide surface because it contains only nicknames, finder
 * descriptions, aliases, tags, and preview hints — never runtime truth.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import {
  MODULE_DISCOVERY_SITE_CONTENT_KEY,
  type ModuleDiscoveryMetadata,
  type ModuleDiscoveryMetadataMap,
} from '@/lib/moduleDiscoveryMetadata';

const previewModeSchema = z.enum(['abstract', 'fixture', 'live']);

const metadataEntrySchema: z.ZodType<ModuleDiscoveryMetadata> = z
  .object({
    humanNickname: z.string().trim().max(120).optional(),
    finderDescription: z.string().trim().max(800).optional(),
    searchAliases: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
    previewMode: previewModeSchema.optional(),
    runtimeKey: z.string().trim().max(120).optional(),
  })
  .strip();

const metadataMapSchema = z.record(z.string().min(1), metadataEntrySchema);

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

    return res.status(200).json({
      metadata: unpackMetadata(data.data),
      updatedAt: data.updated_at ?? null,
    });
  } catch {
    // Style guide falls back to code defaults when Supabase is unavailable.
    return res.status(200).json({ metadata: {}, updatedAt: null });
  }
}

function unpackMetadata(data: unknown): ModuleDiscoveryMetadataMap {
  const candidate = getMetadataCandidate(data);
  const validation = metadataMapSchema.safeParse(candidate ?? {});
  return validation.success ? validation.data : {};
}

function getMetadataCandidate(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  if (Object.prototype.hasOwnProperty.call(data, 'metadata')) {
    return (data as { metadata?: unknown }).metadata ?? {};
  }

  return data;
}
