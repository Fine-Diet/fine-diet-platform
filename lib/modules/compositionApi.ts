/**
 * Module System v1 — Composition API
 *
 * Loads a PageComposition by its page key.
 *
 * Phase 1 (current): JSON files only.
 *   File path: data/compositions/{pageKey}.json
 *   Example:   data/compositions/integrative-care-preview.json
 *              loaded via pageKey "integrative-care-preview"
 *
 * Phase 2 (future CMS hook):
 *   1. Try site_content table with key = composition.key (status = 'published')
 *   2. Fall back to JSON file
 *   The TODO below marks the insertion point.
 *
 * Validation policy:
 *   - Top-level composition structure failure → return null
 *   - Per-module content validation failure → skip that module, log warning
 */

import path from 'path';
import fs from 'fs';

import { pageCompositionSchema, MODULE_CONTENT_SCHEMAS } from './schema';
import type { PageComposition, ModuleInstance, ModuleTypeKey } from './types';

/**
 * Load and validate a page composition by its URL-safe page key.
 *
 * @param pageKey - The URL slug used in /p/[pageKey] (e.g. "integrative-care-preview")
 * @returns Validated PageComposition or null if not found / invalid
 */
export async function getComposition(pageKey: string): Promise<PageComposition | null> {
  // ── Phase 2 CMS hook point ────────────────────────────────────────────────
  // TODO(phase-2): Uncomment when site_content CMS storage is wired:
  //
  // try {
  //   const { supabaseAdmin } = await import('../supabaseServerClient');
  //   const { data } = await supabaseAdmin
  //     .from('site_content')
  //     .select('data')
  //     .eq('key', `page:site:${pageKey}`)
  //     .eq('status', 'published')
  //     .maybeSingle();
  //   if (data?.data) {
  //     return validateComposition(data.data);
  //   }
  // } catch {
  //   // Fall through to JSON
  // }
  // ─────────────────────────────────────────────────────────────────────────

  return loadFromJson(pageKey);
}

// ============================================================================
// Internal helpers
// ============================================================================

function loadFromJson(pageKey: string): PageComposition | null {
  // Guard against path traversal
  const safe = pageKey.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== pageKey) {
    return null;
  }

  const filePath = path.join(process.cwd(), 'data', 'compositions', `${safe}.json`);

  let raw: unknown;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch {
    return null;
  }

  return validateComposition(raw);
}

function validateComposition(raw: unknown): PageComposition | null {
  const topLevel = pageCompositionSchema.safeParse(raw);
  if (!topLevel.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[compositionApi] Top-level composition validation failed:', topLevel.error.flatten());
    }
    return null;
  }

  const { key, version, modules: looseModules } = topLevel.data;

  // Validate each module's content individually — skip invalid ones
  const validatedModules: ModuleInstance[] = [];

  for (const mod of looseModules) {
    const contentSchema = MODULE_CONTENT_SCHEMAS[mod.type as ModuleTypeKey];
    if (!contentSchema) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[compositionApi] No schema for module type "${mod.type}" (id: ${mod.id}) — skipping`);
      }
      continue;
    }

    const contentResult = contentSchema.safeParse(mod.content);
    if (!contentResult.success) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[compositionApi] Module content validation failed for "${mod.type}" (id: ${mod.id}):`,
          contentResult.error.flatten(),
        );
      }
      continue;
    }

    validatedModules.push({
      id: mod.id,
      type: mod.type as ModuleTypeKey,
      content: contentResult.data,
      ...(mod.chrome ? { chrome: mod.chrome } : {}),
    } as ModuleInstance);
  }

  return { key, version, modules: validatedModules };
}
