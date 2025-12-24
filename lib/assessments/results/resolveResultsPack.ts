/**
 * Results Pack Resolver
 * 
 * CMS-first resolution with file fallback.
 * Supports preview mode for editors/admins and pinning for reproducibility.
 */

import { loadResultsPack, type ResultsPack } from './loadResultsPack';

export interface ResultsPackRef {
  source: 'cms' | 'file';
  packId?: string;
  publishedRevisionId?: string;
  previewRevisionId?: string;
  contentHash?: string;
  resolvedAt: string;
}

export interface ResolveResultsPackOptions {
  assessmentType: string;
  resultsVersion: string;
  levelId: string;
  preview?: boolean;
  userRole?: 'user' | 'editor' | 'admin';
  resultsPackRef?: ResultsPackRef | null;
}

export interface ResolveResultsPackResult {
  pack: ResultsPack;
  source: 'cms' | 'file';
  contentHash?: string;
  schemaVersion?: string;
  publishedAt?: string;
  resultsPackRef?: ResultsPackRef;
}

/**
 * Resolve results pack from CMS or file system
 * 
 * Priority:
 * 1. If resultsPackRef exists and source is 'cms', fetch exact revision
 * 2. If preview=true and user is editor/admin, use preview_revision_id
 * 3. Try CMS published revision
 * 4. Fallback to file loader
 */
export async function resolveResultsPack(
  options: ResolveResultsPackOptions
): Promise<ResolveResultsPackResult> {
  const { assessmentType, resultsVersion, levelId, preview, userRole, resultsPackRef } = options;

  // Step 1: If pinned reference exists (CMS), try to fetch exact revision
  if (resultsPackRef && resultsPackRef.source === 'cms' && resultsPackRef.publishedRevisionId) {
    try {
      const { data: rev, error } = await supabaseAdmin
        .from('results_pack_revisions')
        .select('content_json, content_hash, schema_version, created_at')
        .eq('id', resultsPackRef.publishedRevisionId)
        .single();

      if (!error && rev) {
        // Validate it's the same pack (optional check)
        const pack = rev.content_json as ResultsPack;
        if (pack && pack.label) {
          // Log for debugging
          if (process.env.NODE_ENV === 'development') {
            console.log('[resolveResultsPack] Using pinned revision:', resultsPackRef.publishedRevisionId);
          }
          return {
            pack,
            source: 'cms',
            contentHash: rev.content_hash,
            schemaVersion: rev.schema_version,
            publishedAt: rev.created_at,
            resultsPackRef, // Return existing ref (no update needed)
          };
        }
      }
      // If exact revision not found, fall through to published pointer
    } catch (error) {
      console.warn('[resolveResultsPack] Error fetching pinned revision, falling back:', error);
      // Fall through to published pointer
    }
  }

  // Step 2: Try CMS (published or preview)
  const allowPreview = preview && (userRole === 'editor' || userRole === 'admin');
  
  if (allowPreview) {
    // Preview mode: try preview_revision_id first
    try {
      const packRef = await fetchPackFromCMS(assessmentType, resultsVersion, levelId, true);
      if (packRef) {
        // Create/update resultsPackRef for preview
        const newRef: ResultsPackRef = {
          source: 'cms',
          packId: packRef.packId,
          previewRevisionId: packRef.revisionId,
          contentHash: packRef.contentHash,
          resolvedAt: new Date().toISOString(),
        };
        return {
          pack: packRef.pack,
          source: 'cms',
          contentHash: packRef.contentHash,
          schemaVersion: packRef.schemaVersion,
          publishedAt: packRef.publishedAt,
          resultsPackRef: newRef,
        };
      }
    } catch (error) {
      console.warn('[resolveResultsPack] Preview fetch failed, trying published:', error);
      // Fall through to published
    }
  }

  // Step 3: Try CMS published revision
  try {
    const packRef = await fetchPackFromCMS(assessmentType, resultsVersion, levelId, false);
    if (packRef) {
      // Create resultsPackRef for pinning
      const newRef: ResultsPackRef = {
        source: 'cms',
        packId: packRef.packId,
        publishedRevisionId: packRef.revisionId,
        contentHash: packRef.contentHash,
        resolvedAt: new Date().toISOString(),
      };
      return {
        pack: packRef.pack,
        source: 'cms',
        contentHash: packRef.contentHash,
        schemaVersion: packRef.schemaVersion,
        publishedAt: packRef.publishedAt,
        resultsPackRef: newRef,
      };
    }
  } catch (error) {
    console.warn('[resolveResultsPack] CMS fetch failed, falling back to file:', error);
  }

  // Step 4: Fallback to file loader
  const filePack = loadResultsPack({ assessmentType, resultsVersion, levelId });
  if (!filePack) {
    throw new Error(`Failed to load results pack from file: ${assessmentType}/${resultsVersion}/${levelId}`);
  }

  // Create resultsPackRef for file source
  const newRef: ResultsPackRef = {
    source: 'file',
    resolvedAt: new Date().toISOString(),
  };

  return {
    pack: filePack,
    source: 'file',
    resultsPackRef: newRef,
  };
}

/**
 * Internal helper: Fetch pack from CMS
 */
async function fetchPackFromCMS(
  assessmentType: string,
  resultsVersion: string,
  levelId: string,
  usePreview: boolean
): Promise<{
  pack: ResultsPack;
  packId: string;
  revisionId: string;
  contentHash: string;
  schemaVersion: string;
  publishedAt: string;
} | null> {
  // Dynamic import to avoid build-time env var checks
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  
  // Find pack identity
  const { data: pack, error: packError } = await supabaseAdmin
    .from('results_packs')
    .select('id')
    .eq('assessment_type', assessmentType)
    .eq('results_version', resultsVersion)
    .eq('level_id', levelId)
    .maybeSingle();

  if (packError || !pack) {
    return null; // Pack not found in CMS
  }

  // Get pointer (preview or published)
  const { data: ptr, error: ptrError } = await supabaseAdmin
    .from('results_pack_pointers')
    .select(usePreview ? 'preview_revision_id' : 'published_revision_id')
    .eq('pack_id', pack.id)
    .maybeSingle();

  if (ptrError || !ptr) {
    return null; // Pointer not found
  }

  const revisionId = usePreview ? ptr.preview_revision_id : ptr.published_revision_id;
  if (!revisionId) {
    return null; // No revision pointer set
  }

  // Fetch revision content
  const { data: rev, error: revError } = await supabaseAdmin
    .from('results_pack_revisions')
    .select('content_json, content_hash, schema_version, created_at')
    .eq('id', revisionId)
    .single();

  if (revError || !rev) {
    return null; // Revision not found
  }

  const packData = rev.content_json as ResultsPack;
  if (!packData || !packData.label) {
    return null; // Invalid pack structure
  }

  return {
    pack: packData,
    packId: pack.id,
    revisionId,
    contentHash: rev.content_hash,
    schemaVersion: rev.schema_version,
    publishedAt: rev.created_at,
  };
}

