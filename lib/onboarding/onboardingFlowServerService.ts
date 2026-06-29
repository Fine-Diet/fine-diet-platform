/**
 * Onboarding authoring — server-side flow service.
 *
 * All reads/writes for `app_onboarding_flows` go through this module. Admin
 * APIs and live/preview resolution call these functions only — never Supabase
 * directly.
 *
 * Persistence: public.app_onboarding_flows (see
 * scripts/sql/createAppOnboardingFlowsTable.sql).
 *   - Two rows max per flow_key: one `draft`, one `published` (+ archived).
 *   - Publishing copies the draft row into the published row.
 *
 * Server-only by construction: every function dynamically imports the
 * service-role client, so this module is never bundled into client code.
 *
 * SAFETY: publishing never mutates `people.metadata`. The durable completion
 * flag `onboarding_completed_at` stays owned by the live onboarding route via
 * `POST /api/journal/profile`.
 */

import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_FLOW_KEY,
  DEFAULT_ONBOARDING_FLOW_TITLE,
  onboardingFlowRecordSchema,
  type OnboardingFlowConfig,
  type OnboardingFlowRecord,
  type OnboardingFlowStatus,
} from './onboardingFlowTypes';
import { validateOnboardingFlowConfig } from './onboardingFlowValidation';

const SAFE_COLUMNS =
  'flow_key, version, title, status, config, published_at, updated_at, created_at';

interface OnboardingFlowRow {
  flow_key: string;
  version: number;
  title: string;
  status: string;
  config: unknown;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

function rowToRecord(row: OnboardingFlowRow): OnboardingFlowRecord | null {
  const parsed = onboardingFlowRecordSchema.safeParse({
    flowKey: row.flow_key,
    version: row.version,
    title: row.title,
    status: row.status,
    config: row.config ?? {},
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

function isSafeFlowKey(key: string): boolean {
  return /^[a-z0-9-]+$/.test(key);
}

/** Load one flow record by key + status. */
export async function getOnboardingFlowByKey(
  flowKey: string,
  status: OnboardingFlowStatus,
): Promise<OnboardingFlowRecord | null> {
  if (!isSafeFlowKey(flowKey)) return null;
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('app_onboarding_flows')
      .select(SAFE_COLUMNS)
      .eq('flow_key', flowKey)
      .eq('status', status)
      .maybeSingle();

    if (error || !data) return null;
    return rowToRecord(data as OnboardingFlowRow);
  } catch {
    return null;
  }
}

/** Load the published flow for `flowKey` (default 'default'). */
export function getPublishedFlow(
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
): Promise<OnboardingFlowRecord | null> {
  return getOnboardingFlowByKey(flowKey, 'published');
}

/** Load the draft flow for `flowKey` (default 'default'). */
export function getDraftFlow(
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
): Promise<OnboardingFlowRecord | null> {
  return getOnboardingFlowByKey(flowKey, 'draft');
}

export interface OnboardingFlowSummary {
  flowKey: string;
  status: OnboardingFlowStatus;
  title: string;
  version: number;
  hasPublished: boolean;
  hasDraft: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

/** List flows for the admin UI, collapsed per flow_key. */
export async function listOnboardingFlows(): Promise<OnboardingFlowSummary[]> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('app_onboarding_flows')
      .select(SAFE_COLUMNS)
      .order('flow_key', { ascending: true });

    if (error || !data) return [];

    const byKey = new Map<string, OnboardingFlowRow[]>();
    for (const raw of data as OnboardingFlowRow[]) {
      const entry = byKey.get(raw.flow_key) ?? [];
      entry.push(raw);
      byKey.set(raw.flow_key, entry);
    }

    const statusRank: Record<string, number> = { draft: 0, published: 1, archived: 2 };
    const summaries: OnboardingFlowSummary[] = [];

    byKey.forEach((rows, flowKey) => {
      const sorted = [...rows].sort(
        (a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9),
      );
      const primary = sorted[0];
      summaries.push({
        flowKey,
        status: primary.status as OnboardingFlowStatus,
        title: primary.title,
        version: primary.version,
        hasPublished: rows.some((r) => r.status === 'published'),
        hasDraft: rows.some((r) => r.status === 'draft'),
        publishedAt: rows.find((r) => r.status === 'published')?.published_at ?? null,
        updatedAt: primary.updated_at,
      });
    });

    return summaries.sort((a, b) => a.flowKey.localeCompare(b.flowKey));
  } catch {
    return [];
  }
}

export type SaveOutcome =
  | { success: true; record: OnboardingFlowRecord }
  | { success: false; error: string };

/**
 * Create or update the DRAFT row for `flowKey`. Validates strictly enough to
 * prevent malformed drafts from being persisted (structural + semantic). The
 * admin UI may still surface validation warnings separately.
 */
export async function saveDraftFlow(
  flowKey: string,
  title: string,
  config: unknown,
  actorUserId?: string | null,
): Promise<SaveOutcome> {
  if (!isSafeFlowKey(flowKey)) {
    return { success: false, error: 'Invalid flow_key' };
  }
  const validation = validateOnboardingFlowConfig(config);
  if (!validation.ok) {
    return {
      success: false,
      error: `Validation failed: ${validation.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    };
  }

  const validatedConfig = config as OnboardingFlowConfig;
  const record: OnboardingFlowRecord = {
    flowKey,
    version: 1,
    title: title.trim() || DEFAULT_ONBOARDING_FLOW_TITLE,
    status: 'draft',
    config: validatedConfig,
    publishedAt: null,
  };

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('app_onboarding_flows')
      .upsert(
        {
          flow_key: record.flowKey,
          version: record.version,
          title: record.title,
          status: 'draft',
          config: record.config,
          updated_at: new Date().toISOString(),
          updated_by: actorUserId ?? null,
        },
        { onConflict: 'flow_key,status' },
      );

    if (error) return { success: false, error: error.message };
    return { success: true, record };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

export type PublishOutcome =
  | { success: true; record: OnboardingFlowRecord }
  | { success: false; error: string };

/**
 * Publish the current draft for `flowKey`: strictly validate, then upsert the
 * draft's content into the `published` row and stamp `published_at`. Never
 * touches `people.metadata`.
 */
export async function publishDraftFlow(
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
  actorUserId?: string | null,
): Promise<PublishOutcome> {
  const draft = await getDraftFlow(flowKey);
  if (!draft) {
    return { success: false, error: 'No draft to publish.' };
  }

  const validation = validateOnboardingFlowConfig(draft.config);
  if (!validation.ok) {
    return {
      success: false,
      error: `Cannot publish — resolve validation issues: ${validation.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    };
  }

  const now = new Date().toISOString();
  const published: OnboardingFlowRecord = { ...draft, status: 'published', publishedAt: now };

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('app_onboarding_flows')
      .upsert(
        {
          flow_key: published.flowKey,
          version: published.version,
          title: published.title,
          status: 'published',
          config: published.config,
          published_at: now,
          updated_at: now,
          updated_by: actorUserId ?? null,
        },
        { onConflict: 'flow_key,status' },
      );

    if (error) return { success: false, error: error.message };
    return { success: true, record: published };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

/** Remove the published row for `flowKey`; live onboarding falls back to default. */
export async function unpublishFlow(
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
): Promise<{ success: boolean; error?: string }> {
  if (!isSafeFlowKey(flowKey)) return { success: false, error: 'Invalid flow_key' };
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { error } = await supabaseAdmin
      .from('app_onboarding_flows')
      .delete()
      .eq('flow_key', flowKey)
      .eq('status', 'published');
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Supabase unavailable',
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Live / preview resolution                                           */
/* ------------------------------------------------------------------ */

export type OnboardingFlowSource = 'published' | 'draft' | 'default';

export interface ResolvedOnboardingFlow {
  source: OnboardingFlowSource;
  flowKey: string;
  title: string;
  config: OnboardingFlowConfig;
}

/**
 * Resolve the flow for the LIVE onboarding route. Returns the published row
 * when one exists, otherwise the code-owned default config. Never throws —
 * any DB error falls back to the default so onboarding always renders.
 */
export async function resolveLiveOnboardingFlow(
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
): Promise<ResolvedOnboardingFlow> {
  const published = await getPublishedFlow(flowKey);
  if (published) {
    return { source: 'published', flowKey: published.flowKey, title: published.title, config: published.config };
  }
  return {
    source: 'default',
    flowKey,
    title: DEFAULT_ONBOARDING_FLOW_TITLE,
    config: DEFAULT_ONBOARDING_FLOW_CONFIG,
  };
}

/**
 * Resolve a flow for the admin PREVIEW by source. `draft` falls back to
 * `published` falls back to `default`, so the preview always has something to
 * render. Never throws and never calls `/api/journal/profile`.
 */
export async function resolveOnboardingFlowForPreview(
  source: OnboardingFlowSource,
  flowKey: string = DEFAULT_ONBOARDING_FLOW_KEY,
): Promise<ResolvedOnboardingFlow> {
  if (source === 'draft') {
    const draft = await getDraftFlow(flowKey);
    if (draft) {
      return { source: 'draft', flowKey: draft.flowKey, title: draft.title, config: draft.config };
    }
    // No draft → show published if present, else default (report the actual source).
    const published = await getPublishedFlow(flowKey);
    if (published) {
      return { source: 'published', flowKey: published.flowKey, title: published.title, config: published.config };
    }
    return defaultResolution(flowKey);
  }

  if (source === 'published') {
    const published = await getPublishedFlow(flowKey);
    if (published) {
      return { source: 'published', flowKey: published.flowKey, title: published.title, config: published.config };
    }
    return defaultResolution(flowKey);
  }

  return defaultResolution(flowKey);
}

function defaultResolution(flowKey: string): ResolvedOnboardingFlow {
  return {
    source: 'default',
    flowKey,
    title: DEFAULT_ONBOARDING_FLOW_TITLE,
    config: DEFAULT_ONBOARDING_FLOW_CONFIG,
  };
}
