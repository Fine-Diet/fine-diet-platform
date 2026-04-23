/**
 * POST /api/journal/plans/ai/import-recipe
 *
 * Phase 4: captures a pasted recipe or recipe URL, runs it through the
 * deterministic stub importer, persists an imported_meals draft with
 * meal-level NDS + parse status, and stamps an ai_runs audit row with
 * the request/response payloads.
 *
 * Request body (Zod-validated via ImportRecipeRequestSchema):
 *   {
 *     text?: string | null,
 *     url?: string | null,
 *     source_platform?: string | null,
 *     user_hint?: string | null,
 *   }
 *
 * At least one of `text` or `url` is required; otherwise 400.
 *
 * Response:
 *   { imported_meal: ImportedMeal, ai_run_id: string }
 *
 * Auth: self-only write. Journal access + caller access are enforced.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { ImportRecipeRequestSchema } from '@/lib/plans/validators';
import {
  isLikelyVideoUrl,
  rebuildDerivedFromIngredientsGrounded,
  runRecipeImport,
} from '@/lib/plans/recipeImporter';
import { createDefaultIngredientLookup } from '@/lib/plans/ingredientMatcher';
import {
  fetchRecipeFromUrl,
  renderFetchedRecipeAsText,
} from '@/lib/plans/recipeUrlFetcher';
import { createImportedMeal } from '@/lib/plans/importsServerService';
import {
  missingItemInputsFromIngredientMatches,
  recordMissingIngredientBatch,
} from '@/lib/missingItems/missingItemRequestServerService';
import { normalizeRecipeText } from '@/lib/ai/normalization/normalizationService';
import {
  acquireVideoTranscript,
  buildUserAssistedOutcome,
  classifyVideoUrl,
} from '@/lib/plans/videoTranscript/videoTranscriptService';
import type { TranscriptAcquisitionMode } from '@/lib/plans/videoTranscript/types';
import {
  acquireOnscreenText,
  mergeOnscreenIntoBase,
} from '@/lib/plans/onscreenText/onscreenTextService';

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

    const parsed = ImportRecipeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const hasText = typeof body.text === 'string' && body.text.trim().length > 0;
    const hasUrl = typeof body.url === 'string' && body.url.trim().length > 0;
    const hasAssistedText =
      typeof body.assisted_text === 'string' && body.assisted_text.trim().length > 0;
    const hasOnscreenText =
      typeof body.onscreen_text === 'string' && body.onscreen_text.trim().length > 0;
    if (!hasText && !hasUrl && !hasAssistedText && !hasOnscreenText) {
      return res.status(400).json({
        error:
          'Provide at least one of: `text` (recipe paste), `url` (recipe link), `assisted_text` (caption for a social/video URL), or `onscreen_text` (visible on-screen instructions).',
      });
    }

    const startedAt = Date.now();

    // Audit row — pending. We update to succeeded/failed after persist.
    const { data: runRow, error: runErr } = await supabaseAdmin
      .from('ai_runs')
      .insert({
        person_id: personId,
        run_type: 'recipe_parse',
        provider: process.env.PLANS_AI_PROVIDER ?? 'stub',
        request_payload_json: {
          text: body.text ?? null,
          url: body.url ?? null,
          source_platform: body.source_platform ?? null,
          user_hint: body.user_hint ?? null,
          assisted_text_chars:
            typeof body.assisted_text === 'string'
              ? body.assisted_text.trim().length
              : 0,
          onscreen_text_chars:
            typeof body.onscreen_text === 'string'
              ? body.onscreen_text.trim().length
              : 0,
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
      // URL path: when the user gave us a recipe URL (and no paste), try
      // to fetch the page server-side and extract schema.org Recipe
      // JSON-LD before handing off to the deterministic parser. This
      // closes Packet 4 AC #2 ("pasting a recipe URL creates a draft").
      // Video / social URLs are still routed through the stub so they
      // land in `manual_review` with the raw URL preserved (the
      // accepted V1 behavior for those platforms).
      let effectiveText: string | null = body.text ?? null;
      const hasPastedText =
        typeof effectiveText === 'string' && effectiveText.trim().length > 0;
      const bodyUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!hasPastedText && bodyUrl.length > 0 && !isLikelyVideoUrl(bodyUrl)) {
        try {
          const fetched = await fetchRecipeFromUrl(bodyUrl);
          if (fetched) effectiveText = renderFetchedRecipeAsText(fetched);
        } catch (fetchErr) {
          // Swallow fetch errors — runRecipeImport will land in
          // manual_review with the URL preserved. We log so we can
          // spot systemic fetch problems without failing the user.
          console.warn(
            '[API /journal/plans/ai/import-recipe] URL fetch failed:',
            fetchErr instanceof Error ? fetchErr.message : fetchErr,
          );
        }
      }

      // Packet 19 + 21: video recipe ingestion.
      //
      // When the caller pasted a video/social URL, resolve the
      // effective text in this priority order:
      //   1. If `assisted_text` is present, use it as a user-assisted
      //      acquisition (Packet 21). We do NOT fetch a transcript
      //      in this case — the user explicitly supplied the text.
      //      The outcome is audited with `status='user_assisted'` and
      //      `source='user_assisted_caption'` so admin tooling can
      //      tell automatic vs user-assisted paths apart.
      //   2. Otherwise attempt automatic transcript acquisition via
      //      the registered platform adapters (Packet 19/20).
      //   3. If automatic acquisition fails AND an `assisted_text`
      //      arrived, use it as a user-assisted fallback and record
      //      a second audit row. This path doesn't exist in the
      //      current UI (which submits assisted_text preemptively)
      //      but we keep the branch so API clients can do both.
      //
      // Every outcome writes exactly one `video_transcript_fetch`
      // audit row per attempt, and every failure path degrades to
      // `manual_review` with the URL preserved — the existing
      // deterministic safety net.
      let videoTranscriptOutcome: Awaited<
        ReturnType<typeof acquireVideoTranscript>
      > | null = null;
      let acquisitionMode: TranscriptAcquisitionMode = 'none';
      const assistedText =
        typeof body.assisted_text === 'string' ? body.assisted_text.trim() : '';

      if (!hasPastedText && bodyUrl.length > 0 && isLikelyVideoUrl(bodyUrl)) {
        if (assistedText.length > 0) {
          // Path 1 — user-assisted caption, no fetch.
          const classification = classifyVideoUrl(bodyUrl);
          videoTranscriptOutcome = buildUserAssistedOutcome({
            classification,
            assistedText,
          });
          acquisitionMode = 'user_assisted';
        } else {
          // Path 2 — automatic acquisition via adapters. Packet 26
          // §3d: pass the person context so the service can translate
          // non-English caption tracks to English before the existing
          // normalization pipeline runs. Translation falls back to
          // the original text when the AI runtime is not routable, so
          // the import never blocks on this path. Packet 27: the
          // same ctx also drives the external transcript-provider
          // fallback for blocked Shorts — triggered only when the
          // first-party ladder returned unavailable/fetch_failed/
          // title-only/empty, and a no-op when no provider is
          // routable.
          videoTranscriptOutcome = await acquireVideoTranscript(bodyUrl, {
            translationCtx: { personId },
            externalProviderCtx: { personId },
          });
          acquisitionMode =
            videoTranscriptOutcome.status === 'acquired' ? 'automatic' : 'none';
        }

        await writeTranscriptAuditRow({
          personId,
          url: bodyUrl,
          outcome: videoTranscriptOutcome,
          acquisitionMode,
        });

        if (
          (videoTranscriptOutcome.status === 'acquired' ||
            videoTranscriptOutcome.status === 'user_assisted') &&
          typeof videoTranscriptOutcome.transcript === 'string' &&
          videoTranscriptOutcome.transcript.trim().length > 0
        ) {
          effectiveText = videoTranscriptOutcome.transcript;
        }
      } else if (!hasPastedText && assistedText.length > 0) {
        // No URL (or non-video URL) but assisted_text supplied —
        // treat it as regular recipe text. No transcript audit row
        // because there's no acquisition to audit.
        effectiveText = assistedText;
      }

      // Packet 22: on-screen instruction extraction assist (secondary
      // acquisition layer). Runs after transcript/caption acquisition
      // and supplements (not replaces) the already-acquired text.
      // V1 production source is user_supplied via the optional
      // `onscreen_text` body field; the extractor registry also
      // exists so future OCR/vision providers can register without
      // touching feature code.
      //
      // On-screen text is NEVER authoritative: it cannot create
      // trusted food objects by itself and is explicitly tagged on
      // the draft + audit trail. If extraction is empty, insufficient
      // or fails, we keep whatever transcript/assisted text we already
      // have and continue.
      const userSuppliedOnscreen =
        typeof body.onscreen_text === 'string' ? body.onscreen_text : null;
      const onscreenRelevant =
        (bodyUrl.length > 0 && isLikelyVideoUrl(bodyUrl)) ||
        (typeof userSuppliedOnscreen === 'string' &&
          userSuppliedOnscreen.trim().length > 0);
      let onscreenOutcome: Awaited<ReturnType<typeof acquireOnscreenText>> | null =
        null;
      if (onscreenRelevant) {
        onscreenOutcome = await acquireOnscreenText({
          rawUrl: bodyUrl.length > 0 ? bodyUrl : null,
          userSupplied: userSuppliedOnscreen,
        });
        await writeOnscreenAuditRow({
          personId,
          url: bodyUrl || null,
          outcome: onscreenOutcome,
        });
        if (
          onscreenOutcome.status === 'acquired' &&
          typeof onscreenOutcome.text === 'string' &&
          onscreenOutcome.text.trim().length > 0
        ) {
          effectiveText = mergeOnscreenIntoBase({
            base: effectiveText,
            onscreen: onscreenOutcome.text,
          });
        }
      }

      // Packet 17: route the effective text through the AI
      // normalization task before the deterministic parser. This is
      // the first production AI-activated task; in V1 the stub
      // provider returns the input unchanged, but the runtime still
      // records an ai_runs row with provider/model/fallback_used so
      // the audit trail reflects the activated path. A real provider
      // can swap in later without any change here.
      let normalizationOutcome: Awaited<
        ReturnType<typeof normalizeRecipeText>
      > | null = null;
      if (typeof effectiveText === 'string' && effectiveText.trim().length > 0) {
        normalizationOutcome = await normalizeRecipeText(
          { personId },
          {
            text: effectiveText,
            source_platform: body.source_platform ?? null,
            source_url: body.url ?? null,
            user_hint: body.user_hint ?? null,
          },
        );
        effectiveText = normalizationOutcome.effective_text;
      }

      const result = runRecipeImport({
        text: effectiveText,
        url: body.url ?? null,
        source_platform: body.source_platform ?? null,
        user_hint: body.user_hint ?? null,
      });

      // Packet 21/22: preserve primary acquisition mode AND on-screen
      // assist provenance on the draft payload so the per-draft view
      // can distinguish automatic vs user-assisted origin, and whether
      // the secondary on-screen layer contributed, without joining
      // against ai_runs.
      //
      // Packet 32 — Truthful provenance pill accuracy:
      //   Only mark on-screen assist as "used" when the layer
      //   meaningfully contributed to the final draft. That is:
      //     - user explicitly supplied on-screen text (always a real
      //       assist — they pasted the overlays they saw), OR
      //     - the extractor produced text AND the primary transcript
      //       path was weak/missing/title-only (so the extractor
      //       actually filled a gap rather than adding noise on top
      //       of a strong transcript).
      //   Extractor runs whose text was merged on top of a healthy
      //   transcript no longer stamp `used: true`, because the final
      //   draft doesn't meaningfully depend on them. The extractor's
      //   full run is still recorded on the ai_runs audit row below
      //   (§6b — admin sees richer history than the user-facing pill).
      const onscreenAcquired =
        onscreenOutcome?.status === 'acquired' &&
        typeof onscreenOutcome.text === 'string' &&
        onscreenOutcome.text.trim().length > 0;
      const baseTranscriptWeak = wasBaseTranscriptWeak(videoTranscriptOutcome);
      const onscreenContributed =
        onscreenAcquired &&
        (onscreenOutcome!.source === 'user_supplied' || baseTranscriptWeak);
      if (result.parsed_payload_json) {
        result.parsed_payload_json = {
          ...result.parsed_payload_json,
          acquisition_mode: acquisitionMode,
          onscreen_assist: onscreenContributed
            ? {
                used: true,
                source:
                  onscreenOutcome!.source === 'user_supplied'
                    ? 'user_supplied'
                    : onscreenOutcome!.source === 'extractor'
                      ? 'extractor'
                      : null,
                chars: onscreenOutcome!.chars,
              }
            : { used: false, source: null, chars: 0 },
          // Packet 26 §3d — stamp the original source language on
          // the draft when the transcript was translated to English
          // before normalization. Null for English-native or
          // user-assisted paths.
          translated_from_language:
            videoTranscriptOutcome?.translated_from_language ?? null,
          // Packet 27 — stamp the acquisition source so the UI can
          // distinguish "we got the whole recipe from the caption"
          // from "we only got the video title; user must paste the
          // body" without needing to join against ai_runs.
          transcript_source: videoTranscriptOutcome?.source ?? null,
        };
      }

      // Packet 6: lift the initial heuristic-only match by running the
      // trusted food-object lookup against each parsed ingredient. The
      // grounded rebuild is pure (no DB writes); we just swap the
      // derived fields before persisting. If anything fails we fall
      // back to the synchronous parse output — the imported draft must
      // always land, even when the matcher is degraded.
      let grounded = null as Awaited<
        ReturnType<typeof rebuildDerivedFromIngredientsGrounded>
      > | null;
      const parsedIngredients = result.parsed_payload_json?.ingredients ?? [];
      if (parsedIngredients.length > 0) {
        try {
          grounded = await rebuildDerivedFromIngredientsGrounded({
            title: result.title,
            ingredients: parsedIngredients,
            servings: result.parsed_payload_json?.servings ?? null,
            lookup: createDefaultIngredientLookup(),
          });
        } catch (matchErr) {
          console.warn(
            '[API /journal/plans/ai/import-recipe] grounded match failed, using heuristic result:',
            matchErr instanceof Error ? matchErr.message : matchErr,
          );
          grounded = null;
        }
      }

      const imported = await createImportedMeal({
        personId,
        title: result.title,
        source_type: result.source_type,
        source_url: result.source_url,
        import_type: result.import_type,
        source_platform: result.source_platform,
        raw_input_text: result.raw_input_text,
        parse_status: grounded?.parse_status ?? result.parse_status,
        parsed_payload_json: result.parsed_payload_json,
        nutrition_estimate_json:
          grounded?.nutrition_estimate ?? result.nutrition_estimate_json,
        ingredient_match_json:
          grounded?.ingredient_match ?? result.ingredient_match_json,
        payload: grounded?.payload ?? result.payload,
        protein_score_10:
          grounded?.nds.protein_score_10 ?? result.nds.protein_score_10,
        is_main_meal: grounded?.nds.is_main_meal ?? result.nds.is_main_meal,
        psq_multiplier: grounded?.nds.psq_multiplier ?? result.nds.psq_multiplier,
        meal_derived_data:
          grounded?.nds.meal_derived_data ?? result.nds.meal_derived_data,
        nds_confidence:
          grounded?.nds.nds_confidence ?? result.nds.nds_confidence,
      });

      await supabaseAdmin
        .from('ai_runs')
        .update({
          status: 'succeeded',
          response_payload_json: {
            imported_meal_id: imported.id,
            parse_status: imported.parse_status,
            title: imported.title,
            normalization: normalizationOutcome
              ? {
                  provider: normalizationOutcome.route.provider_key,
                  model: normalizationOutcome.route.model_key,
                  source: normalizationOutcome.route.source,
                  fallback_used: normalizationOutcome.fallback_used,
                  validation_failed: normalizationOutcome.validation_failed,
                }
              : null,
            video_transcript: videoTranscriptOutcome
              ? {
                  status: videoTranscriptOutcome.status,
                  platform: videoTranscriptOutcome.platform,
                  video_id: videoTranscriptOutcome.video_id,
                  source: videoTranscriptOutcome.source,
                  transcript_chars: videoTranscriptOutcome.transcript_chars,
                  language: videoTranscriptOutcome.language,
                  acquisition_mode: acquisitionMode,
                }
              : null,
            onscreen_assist: onscreenOutcome
              ? {
                  status: onscreenOutcome.status,
                  source: onscreenOutcome.source,
                  extractor_key: onscreenOutcome.extractor_key,
                  chars: onscreenOutcome.chars,
                  used: onscreenContributed,
                }
              : null,
            assists_used: [
              ...(onscreenContributed ? ['onscreen_text'] : []),
            ],
          },
          latency_ms: Date.now() - startedAt,
        })
        .eq('id', aiRunId);

      // Packet 14: enqueue missing-item requests for any unresolved
      // (guessed / none) ingredients. Fire-and-forget — the import has
      // already been persisted with its conservative estimate.
      const matchesForBacklog =
        grounded?.ingredient_match ?? imported.ingredient_match_json ?? [];
      if (Array.isArray(matchesForBacklog) && matchesForBacklog.length > 0) {
        const inputs = missingItemInputsFromIngredientMatches({
          personId,
          sourceRef: imported.id,
          matches: matchesForBacklog,
        });
        if (inputs.length > 0) {
          recordMissingIngredientBatch(inputs).catch(() => {
            /* non-fatal */
          });
        }
      }

      return res.status(201).json({ imported_meal: imported, ai_run_id: aiRunId });
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
    console.error('[API /journal/plans/ai/import-recipe POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Packet 32 — Classify whether the primary video-transcript path
 * produced usable content, so the on-screen assist layer can tell
 * whether it was actually needed. Returns true when the base
 * transcript was not available or not meaningful:
 *   - no outcome at all (caller not on a video URL path)
 *   - outcome status != acquired/user_assisted (unavailable, fetch_failed, etc)
 *   - source is `youtube_title_only` (Packet 27: we only got the title)
 *   - transcript text is empty/whitespace after trimming
 *
 * A "not weak" (strong) base means the final draft was authored from
 * the primary transcript, so an on-screen extractor that also
 * returned text is supplementary noise from a provenance perspective
 * and must not stamp a user-facing "On-screen assist" pill.
 */
function wasBaseTranscriptWeak(
  outcome: Awaited<ReturnType<typeof acquireVideoTranscript>> | null,
): boolean {
  if (!outcome) return true;
  if (outcome.status !== 'acquired' && outcome.status !== 'user_assisted') {
    return true;
  }
  if (outcome.source === 'youtube_title_only') return true;
  const text = typeof outcome.transcript === 'string' ? outcome.transcript.trim() : '';
  if (text.length === 0) return true;
  return false;
}

/**
 * Packet 19/21 — Write a `video_transcript_fetch` audit row for a
 * single acquisition attempt. Never throws; audit is fire-and-forget
 * so an audit failure never breaks the user's import flow.
 *
 * The row shape lets admin tooling distinguish:
 *   - automatic acquisitions (`status='succeeded'`, `source` = adapter id, `acquisition_mode='automatic'`)
 *   - user-assisted imports (`status='succeeded'`, `source='user_assisted_caption'`, `acquisition_mode='user_assisted'`)
 *   - unavailable / unsupported / failed attempts (via `response_payload_json.status`)
 */
async function writeTranscriptAuditRow(args: {
  personId: string;
  url: string;
  outcome: Awaited<ReturnType<typeof acquireVideoTranscript>>;
  acquisitionMode: TranscriptAcquisitionMode;
}): Promise<void> {
  const { personId, url, outcome, acquisitionMode } = args;
  const rowStatus =
    outcome.status === 'acquired' || outcome.status === 'user_assisted'
      ? 'succeeded'
      : outcome.status === 'fetch_failed'
        ? 'failed'
        : 'succeeded';
  const fallbackUsed =
    outcome.status !== 'acquired' && outcome.status !== 'user_assisted';

  const { error } = await supabaseAdmin.from('ai_runs').insert({
    person_id: personId,
    run_type: 'video_transcript_fetch',
    provider: 'deterministic',
    model: outcome.source,
    fallback_used: fallbackUsed,
    request_payload_json: {
      url,
      platform: outcome.platform,
      video_id: outcome.video_id,
      acquisition_mode: acquisitionMode,
    },
    response_payload_json: {
      status: outcome.status,
      transcript_chars: outcome.transcript_chars,
      language: outcome.language,
      source: outcome.source,
      acquisition_mode: acquisitionMode,
      // Packet 26 §3d — audit which language-aware path succeeded
      // (e.g. a Spanish track translated to English). The AI runtime
      // writes its own `caption_translate` ai_runs row in addition;
      // this field preserves provenance on the transcript audit row
      // so a single row can answer "was this translated?" at a glance.
      translated_from_language: outcome.translated_from_language ?? null,
    },
    status: rowStatus,
    error_text: outcome.error_text,
    latency_ms: outcome.latency_ms,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  });
  if (error) {
    console.warn(
      '[API /journal/plans/ai/import-recipe] ai_runs transcript audit failed (non-fatal):',
      error.message,
    );
  }
}

/**
 * Packet 22 — Write an `onscreen_text_extract` audit row for a
 * single on-screen acquisition attempt. Never throws; audit is
 * fire-and-forget so an audit failure never breaks the user's
 * import flow.
 *
 * The row shape lets admin tooling distinguish on-screen assist
 * from transcript and user-assisted acquisitions:
 *   - `source = 'user_supplied'` for user-pasted on-screen text
 *   - `source = 'extractor'` when a registered extractor produced text
 *   - `source = 'none'` for unavailable / no-contribution runs
 */
async function writeOnscreenAuditRow(args: {
  personId: string;
  url: string | null;
  outcome: Awaited<ReturnType<typeof acquireOnscreenText>>;
}): Promise<void> {
  const { personId, url, outcome } = args;
  const rowStatus =
    outcome.status === 'acquired'
      ? 'succeeded'
      : outcome.status === 'fetch_failed'
        ? 'failed'
        : 'succeeded';
  const fallbackUsed = outcome.status !== 'acquired';

  // Packet 23: when an AI-backed extractor (e.g. openai_vision)
  // produced the outcome, record the provider/model/cost on the
  // audit row. For user-supplied or noop paths these fields are
  // null and the row stays `provider='deterministic'`.
  const aiBacked =
    typeof outcome.provider_key === 'string' && outcome.provider_key.length > 0;
  const { error } = await supabaseAdmin.from('ai_runs').insert({
    person_id: personId,
    run_type: 'onscreen_text_extract',
    provider: aiBacked ? outcome.provider_key! : 'deterministic',
    model: aiBacked
      ? (outcome.model_key ?? outcome.extractor_key ?? outcome.source)
      : (outcome.extractor_key ?? outcome.source),
    fallback_used: fallbackUsed,
    cost_cents: outcome.cost_cents_estimate ?? null,
    request_payload_json: {
      url,
      source: outcome.source,
      extractor_key: outcome.extractor_key,
      provider_key: outcome.provider_key ?? null,
      model_key: outcome.model_key ?? null,
    },
    response_payload_json: {
      status: outcome.status,
      chars: outcome.chars,
      source: outcome.source,
      extractor_key: outcome.extractor_key,
      provider_key: outcome.provider_key ?? null,
      model_key: outcome.model_key ?? null,
      cost_cents_estimate: outcome.cost_cents_estimate ?? null,
    },
    status: rowStatus,
    error_text: outcome.error_text,
    latency_ms: outcome.latency_ms,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  });
  if (error) {
    console.warn(
      '[API /journal/plans/ai/import-recipe] ai_runs onscreen audit failed (non-fatal):',
      error.message,
    );
  }
}
