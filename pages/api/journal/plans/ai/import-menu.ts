/**
 * POST /api/journal/plans/ai/import-menu
 *
 * Packet 5: captures a pasted menu or menu URL, runs it through the
 * deterministic menu importer (with JSON-LD + microdata URL fetch
 * fallback), persists an `imported_menus` draft with parse_status, and
 * stamps an `ai_runs` audit row.
 *
 * Request body (ImportMenuRequestSchema):
 *   {
 *     restaurant_name?: string,
 *     text?: string | null,
 *     url?: string | null,
 *   }
 *
 * At least one of `text` or `url` must be provided.
 *
 * Response:
 *   { imported_menu: ImportedMenu, ai_run_id: string }
 *
 * Auth: self-only write. Journal access + caller access enforced.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { ImportMenuRequestSchema } from '@/lib/plans/validators';
import { isLikelyVideoUrl, runMenuImport } from '@/lib/plans/menuImporter';
import {
  fetchMenuFromUrl,
  renderFetchedMenuAsText,
} from '@/lib/plans/menuUrlFetcher';
import { createImportedMenu } from '@/lib/plans/eatOutServerService';
import { normalizeMenuText } from '@/lib/ai/normalization/normalizationService';

function deriveRestaurantNameFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const base = host.split('.')[0];
    if (!base) return null;
    return base
      .split(/[-_]+/)
      .map((s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s))
      .join(' ');
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const parsed = ImportMenuRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const hasText = typeof body.text === 'string' && body.text.trim().length > 0;
    const bodyUrl = typeof body.url === 'string' ? body.url.trim() : '';

    const startedAt = Date.now();

    const { data: runRow, error: runErr } = await supabaseAdmin
      .from('ai_runs')
      .insert({
        person_id: personId,
        run_type: 'menu_parse',
        provider: process.env.PLANS_AI_PROVIDER ?? 'stub',
        request_payload_json: {
          restaurant_name: body.restaurant_name ?? null,
          text: body.text ?? null,
          url: body.url ?? null,
        },
        status: 'pending',
        nds_version: NDS_VERSION,
        classifier_version: CLASSIFIER_VERSION,
      })
      .select('id')
      .single();
    if (runErr) throw new Error(`Failed to create ai_run: ${runErr.message}`);
    const aiRunId = (runRow as { id: string }).id;

    try {
      // URL path: fetch structured menu content first, then hand the
      // normalized text to the deterministic parser. Video/social URLs
      // land in manual_review with raw URL preserved (not in scope
      // per §5a).
      let effectiveText: string | null = body.text ?? null;
      let restaurantNameFromFetch: string | null = null;
      if (!hasText && bodyUrl.length > 0 && !isLikelyVideoUrl(bodyUrl)) {
        try {
          const fetched = await fetchMenuFromUrl(bodyUrl);
          if (fetched) {
            effectiveText = renderFetchedMenuAsText(fetched);
            restaurantNameFromFetch = fetched.restaurant_name;
          }
        } catch (fetchErr) {
          console.warn(
            '[API /journal/plans/ai/import-menu] URL fetch failed:',
            fetchErr instanceof Error ? fetchErr.message : fetchErr,
          );
        }
      }

      const restaurant_name =
        (body.restaurant_name && body.restaurant_name.trim().length > 0
          ? body.restaurant_name.trim()
          : null) ??
        restaurantNameFromFetch ??
        deriveRestaurantNameFromUrl(bodyUrl || null) ??
        'Untitled Restaurant';

      // If there is no text body to parse, land in manual_review with
      // raw input preserved (§5b + §9 AC3).
      if (!effectiveText || effectiveText.trim().length === 0) {
        const imported = await createImportedMenu({
          personId,
          restaurant_name,
          source_type: bodyUrl.length > 0 ? 'url' : 'manual_paste',
          source_url: bodyUrl.length > 0 ? bodyUrl : null,
          parse_status: 'manual_review',
          raw_input_text: hasText ? body.text! : null,
          parsed_payload_json: { sections: [] },
        });
        await supabaseAdmin
          .from('ai_runs')
          .update({
            status: 'succeeded',
            response_payload_json: {
              imported_menu_id: imported.id,
              parse_status: imported.parse_status,
              restaurant_name: imported.restaurant_name,
              note: 'manual_review: no menu body could be parsed.',
            },
            latency_ms: Date.now() - startedAt,
          })
          .eq('id', aiRunId);
        return res.status(201).json({ imported_menu: imported, ai_run_id: aiRunId });
      }

      // Packet 17: route the effective menu text through the AI
      // menu_normalize task before the deterministic parser. The stub
      // provider returns the input unchanged in V1; the runtime still
      // records an ai_runs row with provider/model/fallback_used so
      // the activated path is auditable.
      const normalizationOutcome = await normalizeMenuText(
        { personId },
        {
          text: effectiveText,
          restaurant_name,
          source_url: bodyUrl.length > 0 ? bodyUrl : null,
        },
      );
      effectiveText = normalizationOutcome.effective_text;

      const result = runMenuImport({
        text: effectiveText,
        url: bodyUrl.length > 0 ? bodyUrl : null,
        restaurant_name,
      });

      const imported = await createImportedMenu({
        personId,
        restaurant_name,
        source_type: bodyUrl.length > 0 ? 'url' : 'manual_paste',
        source_url: bodyUrl.length > 0 ? bodyUrl : null,
        parse_status: result.parse_status,
        raw_input_text: hasText ? body.text! : effectiveText,
        parsed_payload_json: result.payload,
      });

      await supabaseAdmin
        .from('ai_runs')
        .update({
          status: 'succeeded',
          response_payload_json: {
            imported_menu_id: imported.id,
            parse_status: imported.parse_status,
            restaurant_name: imported.restaurant_name,
            section_count: result.payload.sections.length,
            normalization: {
              provider: normalizationOutcome.route.provider_key,
              model: normalizationOutcome.route.model_key,
              source: normalizationOutcome.route.source,
              fallback_used: normalizationOutcome.fallback_used,
              validation_failed: normalizationOutcome.validation_failed,
            },
          },
          latency_ms: Date.now() - startedAt,
        })
        .eq('id', aiRunId);

      return res.status(201).json({ imported_menu: imported, ai_run_id: aiRunId });
    } catch (parseErr) {
      await supabaseAdmin
        .from('ai_runs')
        .update({
          status: 'failed',
          error_text:
            parseErr instanceof Error ? parseErr.message : 'Unknown parse failure.',
          latency_ms: Date.now() - startedAt,
        })
        .eq('id', aiRunId);
      throw parseErr;
    }
  } catch (err) {
    console.error('[API /journal/plans/ai/import-menu POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
