/**
 * GET /api/admin/ai/transcript-provider/summary
 *
 * Plans Phase 31 — External transcript provider observability.
 *
 * Returns a small, read-only summary operators can use to judge
 * whether the Packet 27 external transcript provider path is
 * enabled, working, and worth keeping on. Derived entirely from
 * existing `ai_runs` rows + the Packet 16/27 config tables — no new
 * tables, no large analytics subsystem.
 *
 * Response shape:
 *   {
 *     config: {
 *       env_key_present: boolean,        // SUPADATA_API_KEY detected
 *       policy: { present: boolean, deterministic_fallback_available: boolean },
 *       preferred: { id, provider_key, model_key, enabled } | null,
 *       fallback:  { id, provider_key, model_key, enabled } | null,
 *       rollout_state: 'enabled' | 'disabled' | 'misconfigured',
 *       rollout_hint: string | null,
 *     },
 *     aggregates: {
 *       window_days: number,
 *       attempts: number,
 *       success: number,
 *       decline: number,
 *       fail: number,
 *       avg_latency_ms: number | null,
 *     },
 *     recent_runs: Array<{
 *       id, created_at, status, fallback_used, latency_ms,
 *       outcome: 'success' | 'decline' | 'fail' | 'unknown',
 *       provider, model, video_id, video_url,
 *       transcript_chars: number | null,
 *       language: string | null,
 *       provider_unavailable: boolean | null,
 *       provider_error: string | null,
 *       error_text: string | null,
 *     }>
 *   }
 *
 * Auth: admin or editor only.
 *
 * The "outcome" classifier is a pure view over (status,
 * response_payload_json): it's computed here so the admin page
 * doesn't have to duplicate the logic, and so we can tweak the
 * classifier later without a schema change.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { resolveTaskRoute } from '@/lib/ai/runtime/aiConfigServerService';

const TASK_TYPE = 'video_transcript_external' as const;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Outcome = 'success' | 'decline' | 'fail' | 'unknown';

interface RecentRun {
  id: string;
  created_at: string;
  status: 'succeeded' | 'failed' | 'pending' | string;
  fallback_used: boolean;
  latency_ms: number | null;
  outcome: Outcome;
  provider: string | null;
  model: string | null;
  video_id: string | null;
  video_url: string | null;
  transcript_chars: number | null;
  language: string | null;
  provider_unavailable: boolean | null;
  provider_error: string | null;
  error_text: string | null;
}

interface SummaryResponse {
  config: {
    env_key_present: boolean;
    policy: { present: boolean; deterministic_fallback_available: boolean };
    preferred:
      | { id: string; provider_key: string; model_key: string; enabled: boolean }
      | null;
    fallback:
      | { id: string; provider_key: string; model_key: string; enabled: boolean }
      | null;
    rollout_state: 'enabled' | 'disabled' | 'misconfigured';
    rollout_hint: string | null;
  };
  aggregates: {
    window_days: number;
    attempts: number;
    success: number;
    decline: number;
    fail: number;
    avg_latency_ms: number | null;
  };
  recent_runs: RecentRun[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SummaryResponse | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const windowDays = clamp(
      parseInt(String(req.query.days ?? ''), 10) || DEFAULT_WINDOW_DAYS,
      1,
      MAX_WINDOW_DAYS,
    );
    const limit = clamp(
      parseInt(String(req.query.limit ?? ''), 10) || DEFAULT_LIMIT,
      1,
      MAX_LIMIT,
    );
    const sinceIso = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // --- Config snapshot (what the runtime would route today) ---
    const route = await resolveTaskRoute(TASK_TYPE);
    const envKeyPresent =
      typeof process.env.SUPADATA_API_KEY === 'string' &&
      process.env.SUPADATA_API_KEY.trim().length > 0;

    const preferredLite = route.preferred
      ? {
          id: route.preferred.id,
          provider_key: route.preferred.provider_key,
          model_key: route.preferred.model_key,
          enabled: route.preferred.enabled,
        }
      : null;
    const fallbackLite = route.fallback
      ? {
          id: route.fallback.id,
          provider_key: route.fallback.provider_key,
          model_key: route.fallback.model_key,
          enabled: route.fallback.enabled,
        }
      : null;

    const { rolloutState, rolloutHint } = classifyRolloutState({
      envKeyPresent,
      preferred: preferredLite,
      fallback: fallbackLite,
      policyPresent: Boolean(route.policy),
      deterministicFallback:
        route.policy?.deterministic_fallback_available ?? false,
    });

    // --- Recent runs (paged, for the admin table) ---
    const { data: recentRows, error: recentErr } = await supabaseAdmin
      .from('ai_runs')
      .select(
        'id, created_at, status, fallback_used, latency_ms, provider, model, request_payload_json, response_payload_json, error_text',
      )
      .eq('run_type', TASK_TYPE)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (recentErr) {
      throw new Error(`ai_runs recent query failed: ${recentErr.message}`);
    }
    const recent = (recentRows ?? []).map(toRecentRun);

    // --- Aggregates over the same window (independent count so the
    //      admin can see volume beyond the `limit` cap). ---
    const aggregates = await computeAggregates(sinceIso, windowDays);

    const resp: SummaryResponse = {
      config: {
        env_key_present: envKeyPresent,
        policy: {
          present: Boolean(route.policy),
          deterministic_fallback_available:
            route.policy?.deterministic_fallback_available ?? false,
        },
        preferred: preferredLite,
        fallback: fallbackLite,
        rollout_state: rolloutState,
        rollout_hint: rolloutHint,
      },
      aggregates,
      recent_runs: recent,
    };
    return res.status(200).json(resp);
  } catch (err) {
    console.error('[admin/ai/transcript-provider/summary] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * Project a raw ai_runs row into a display-friendly record with an
 * explicit outcome classifier. The classifier is intentionally simple
 * so operators can reason about it from the page:
 *
 *   success  — status='succeeded' AND transcript came back with text
 *   decline  — status='succeeded' AND provider explicitly said
 *              "no transcript available" (provider_unavailable=true,
 *              or the runtime's deterministic decline)
 *   fail     — status='failed' (HTTP / parse / timeout)
 *   unknown  — anything else (defensive bucket; shouldn't normally hit)
 */
function toRecentRun(row: Record<string, unknown>): RecentRun {
  const request = (row.request_payload_json ?? {}) as {
    video_url?: unknown;
    video_id?: unknown;
  };
  const responseRaw = (row.response_payload_json ?? null) as {
    kind?: unknown;
    value?: {
      transcript?: unknown;
      language?: unknown;
      provider_unavailable?: unknown;
      provider_error?: unknown;
    } | null;
  } | null;
  const value = responseRaw && responseRaw.value ? responseRaw.value : null;

  const transcript =
    value && typeof value.transcript === 'string' ? (value.transcript as string) : null;
  const transcript_chars = transcript ? transcript.trim().length : null;
  const language =
    value && typeof value.language === 'string' ? (value.language as string) : null;
  const provider_unavailable =
    value && typeof value.provider_unavailable === 'boolean'
      ? (value.provider_unavailable as boolean)
      : null;
  const provider_error =
    value && typeof value.provider_error === 'string'
      ? (value.provider_error as string)
      : null;

  const status = String(row.status ?? 'unknown');
  let outcome: Outcome = 'unknown';
  if (status === 'failed') {
    outcome = 'fail';
  } else if (status === 'succeeded') {
    if (transcript && transcript.trim().length > 0) {
      outcome = 'success';
    } else if (provider_unavailable === true || provider_error) {
      outcome = 'decline';
    } else {
      // Succeeded with a null transcript and no explicit provider flag —
      // treat as decline for operator reporting (the runtime chain
      // didn't produce recipe text).
      outcome = 'decline';
    }
  }

  return {
    id: String(row.id),
    created_at: String(row.created_at),
    status,
    fallback_used: Boolean(row.fallback_used),
    latency_ms:
      typeof row.latency_ms === 'number' ? (row.latency_ms as number) : null,
    outcome,
    provider: typeof row.provider === 'string' ? (row.provider as string) : null,
    model: typeof row.model === 'string' ? (row.model as string) : null,
    video_id:
      typeof request.video_id === 'string' ? (request.video_id as string) : null,
    video_url:
      typeof request.video_url === 'string' ? (request.video_url as string) : null,
    transcript_chars,
    language,
    provider_unavailable,
    provider_error: provider_error ? provider_error.slice(0, 280) : null,
    error_text:
      typeof row.error_text === 'string'
        ? (row.error_text as string).slice(0, 280)
        : null,
  };
}

async function computeAggregates(
  sinceIso: string,
  windowDays: number,
): Promise<SummaryResponse['aggregates']> {
  const { data, error } = await supabaseAdmin
    .from('ai_runs')
    .select('status, latency_ms, response_payload_json')
    .eq('run_type', TASK_TYPE)
    .gte('created_at', sinceIso)
    .limit(2000);
  if (error) {
    throw new Error(`ai_runs aggregate query failed: ${error.message}`);
  }
  const rows = data ?? [];
  let attempts = 0;
  let success = 0;
  let decline = 0;
  let fail = 0;
  let latencySum = 0;
  let latencyN = 0;
  for (const row of rows) {
    attempts += 1;
    const outcome = toRecentRun(row as Record<string, unknown>).outcome;
    if (outcome === 'success') success += 1;
    else if (outcome === 'decline') decline += 1;
    else if (outcome === 'fail') fail += 1;
    const lat = (row as { latency_ms?: unknown }).latency_ms;
    if (typeof lat === 'number' && Number.isFinite(lat)) {
      latencySum += lat;
      latencyN += 1;
    }
  }
  return {
    window_days: windowDays,
    attempts,
    success,
    decline,
    fail,
    avg_latency_ms: latencyN > 0 ? Math.round(latencySum / latencyN) : null,
  };
}

function classifyRolloutState(args: {
  envKeyPresent: boolean;
  preferred: SummaryResponse['config']['preferred'];
  fallback: SummaryResponse['config']['fallback'];
  policyPresent: boolean;
  deterministicFallback: boolean;
}): { rolloutState: 'enabled' | 'disabled' | 'misconfigured'; rolloutHint: string | null } {
  const { envKeyPresent, preferred, fallback, policyPresent, deterministicFallback } = args;

  if (!policyPresent) {
    return {
      rolloutState: 'misconfigured',
      rolloutHint:
        'Task policy for `video_transcript_external` is missing. Re-run `scripts/addPlansPhase27ExternalTranscriptTask.sql`.',
    };
  }

  const preferredEnabled = Boolean(preferred && preferred.enabled);
  const fallbackEnabled = Boolean(fallback && fallback.enabled);

  if (!preferredEnabled && !fallbackEnabled && !deterministicFallback) {
    return {
      rolloutState: 'misconfigured',
      rolloutHint:
        'No routable config: preferred + fallback both disabled and deterministic fallback unavailable.',
    };
  }

  if (!preferredEnabled) {
    return {
      rolloutState: 'disabled',
      rolloutHint: envKeyPresent
        ? 'Preferred provider is disabled. Enable it at /admin/ai to route live traffic.'
        : 'Preferred provider is disabled and SUPADATA_API_KEY is missing. Provision the key, then enable the provider at /admin/ai.',
    };
  }

  if (!envKeyPresent) {
    return {
      rolloutState: 'misconfigured',
      rolloutHint:
        'Preferred provider is enabled but SUPADATA_API_KEY is missing. The adapter will soft-decline and no live recovery will happen until the key is provisioned.',
    };
  }

  return { rolloutState: 'enabled', rolloutHint: null };
}
