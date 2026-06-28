/**
 * API Route: Admin Module Discovery Metadata
 *
 * Protected editor/admin endpoint for editing human-facing module discovery
 * overrides. Saves to site_content under MODULE_DISCOVERY_SITE_CONTENT_KEY.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { requireRoleFromApi } from '@/lib/authServer';
import { MODULE_STYLE_CATALOG } from '@/lib/moduleRegistry';
import {
  MODULE_DISCOVERY_SITE_CONTENT_KEY,
  getModuleDiscoveryMetadata,
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

interface AdminResponseBody {
  success: boolean;
  error?: string;
  metadata?: ModuleDiscoveryMetadataMap;
  modules?: Array<{
    slug: string;
    name: string;
    category: string;
    lifecycle: string;
    defaultMetadata: ModuleDiscoveryMetadata;
    overrideMetadata: ModuleDiscoveryMetadata;
  }>;
  updatedAt?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminResponseBody>,
) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method === 'GET') {
    return handleGet(res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(res: NextApiResponse<AdminResponseBody>) {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data, updated_at')
      .eq('key', MODULE_DISCOVERY_SITE_CONTENT_KEY)
      .eq('status', 'published')
      .maybeSingle();

    const metadata = !error && data?.data ? unpackMetadata(data.data) : {};

    return res.status(200).json({
      success: true,
      metadata,
      modules: MODULE_STYLE_CATALOG.map((mod) => ({
        slug: mod.slug,
        name: mod.name,
        category: mod.category,
        lifecycle: mod.lifecycle ?? 'approved',
        defaultMetadata: getModuleDiscoveryMetadata(mod),
        overrideMetadata: metadata[mod.slug] ?? {},
      })),
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to load module metadata',
    });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse<AdminResponseBody>) {
  const validation = metadataMapSchema.safeParse(req.body?.metadata ?? {});
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: `Validation failed: ${validation.error.message}`,
    });
  }

  const metadata = pruneEmptyEntries(validation.data);

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: MODULE_DISCOVERY_SITE_CONTENT_KEY,
          status: 'published',
          data: { metadata },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,status' },
      );

    if (error) {
      return res.status(500).json({ success: false, error: `Database error: ${error.message}` });
    }

    return res.status(200).json({ success: true, metadata });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to save module metadata',
    });
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

function pruneEmptyEntries(metadata: ModuleDiscoveryMetadataMap): ModuleDiscoveryMetadataMap {
  const pruned: ModuleDiscoveryMetadataMap = {};

  for (const [slug, entry] of Object.entries(metadata)) {
    const next: ModuleDiscoveryMetadata = {};
    if (entry.humanNickname?.trim()) next.humanNickname = entry.humanNickname.trim();
    if (entry.finderDescription?.trim()) next.finderDescription = entry.finderDescription.trim();
    if (entry.runtimeKey?.trim()) next.runtimeKey = entry.runtimeKey.trim();
    if (entry.previewMode) next.previewMode = entry.previewMode;
    if (entry.searchAliases?.length) next.searchAliases = entry.searchAliases.filter(Boolean);
    if (entry.tags?.length) next.tags = entry.tags.filter(Boolean);

    if (Object.keys(next).length > 0) pruned[slug] = next;
  }

  return pruned;
}
