/**
 * Plans Phase 10 — User-facing Program Runtime Summary (server-only)
 *
 * Derived read model on top of the Packet 8 inheritance resolver. Produces
 * a compact, user-safe summary of which program is currently influencing
 * a person's Plans experience. Explicitly NOT a second mutable store:
 * every field is recomputed from `program_assignments` + the resolved
 * guidance set at read time.
 *
 * Scope notes:
 *   - Never exposes raw admin JSON, internal priorities, or provenance
 *     fields that are admin-only.
 *   - Never invents labels: the user-facing program name is derived from
 *     the slug via `slugToTitle` (no separate programs catalogue today;
 *     see Packet 10 §10 risks).
 *   - Scheduled assignments are surfaced separately from the active ones
 *     so the UI can distinguish the two states cleanly.
 */

import type { ProgramAssignment, ProgramPlanGuidance } from './types';
import {
  listAssignments,
  resolveInheritedGuidanceForPerson,
} from './programAssignmentServerService';

// ============================================================================
// Public shapes (safe to return to the client)
// ============================================================================

export type UserFacingAssignmentStatus =
  | 'active'
  | 'scheduled'
  | 'inactive'
  | 'completed'
  | 'cancelled';

export interface UserProgramAssignmentView {
  id: string;
  program_slug: string;
  program_title: string;
  status: UserFacingAssignmentStatus;
  active_from: string | null;
  active_to: string | null;
  /**
   * `active` = status is active AND (now ∈ [active_from, active_to]).
   * `scheduled` = status is active but active_from is in the future.
   * Anything else is echoed from the underlying status.
   */
  runtime_state: 'active_now' | 'scheduled' | 'inactive';
}

export type GuidanceImpactKind =
  | 'schedule_require'
  | 'schedule_disallow'
  | 'schedule_time_window'
  | 'schedule_spacing'
  | 'emphasize'
  | 'avoid'
  | 'macro_targets'
  | 'nds_targets'
  | 'notes';

export interface GuidanceImpactBullet {
  kind: GuidanceImpactKind;
  /** Plain-language one-liner, user-safe. */
  text: string;
}

export interface ProgramRuntimeSummary {
  person_id: string;
  /** True when no active OR scheduled assignments exist. */
  empty: boolean;
  /** Currently running: status=active AND in-window. */
  active: UserProgramAssignmentView[];
  /** Status=active but active_from is still in the future. */
  scheduled: UserProgramAssignmentView[];
  /**
   * Plain-language summary of the guidance currently affecting Plans.
   * Derived from the Packet 8 resolver's `resolved` set. Empty list
   * when there is no active guidance.
   */
  impact_bullets: GuidanceImpactBullet[];
  /** The concrete slugs currently being resolved (after inheritance). */
  resolved_program_slugs: string[];
  /** Server timestamp of the read. */
  resolved_at: string;
}

// ============================================================================
// Slug → title
// ============================================================================

/**
 * Pretty-print a program slug for user-facing copy. The repo has no
 * central programs catalogue yet (see Phase 10 §10 risks); this keeps
 * the UX adaptable and stable until one exists.
 *
 * Examples:
 *   gut-check            → "Gut Check"
 *   gut-check-reset      → "Gut Check Reset"
 *   21-day-intensive     → "21 Day Intensive"
 */
export function slugToTitle(slug: string): string {
  if (!slug) return '';
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (/^[0-9]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

// ============================================================================
// Assignment → user view
// ============================================================================

function toAssignmentView(
  a: ProgramAssignment,
  now: Date,
): UserProgramAssignmentView {
  const activeFrom = a.active_from ? new Date(a.active_from) : null;
  const activeTo = a.active_to ? new Date(a.active_to) : null;

  let runtime: UserProgramAssignmentView['runtime_state'] = 'inactive';
  if (a.status === 'active') {
    const afterStart = !activeFrom || activeFrom <= now;
    const beforeEnd = !activeTo || activeTo > now;
    if (afterStart && beforeEnd) {
      runtime = 'active_now';
    } else if (!afterStart) {
      runtime = 'scheduled';
    }
  }

  return {
    id: a.id,
    program_slug: a.program_slug,
    program_title: slugToTitle(a.program_slug),
    status: a.status as UserFacingAssignmentStatus,
    active_from: a.active_from,
    active_to: a.active_to,
    runtime_state: runtime,
  };
}

// ============================================================================
// Guidance → impact bullets
// ============================================================================

const SLOT_LABEL_BY_KEY: Record<string, string> = {
  breakfast: 'breakfast',
  morning_snack: 'a morning snack',
  lunch: 'lunch',
  afternoon_snack: 'an afternoon snack',
  dinner: 'dinner',
  evening_snack: 'an evening snack',
};

function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function slotPhrase(keys: string[]): string {
  const labels = keys.map((k) => SLOT_LABEL_BY_KEY[k] ?? k.replace(/_/g, ' '));
  return joinWithAnd(labels);
}

/**
 * Derive plain-language bullets from the user's active guidance set.
 * Dedupes across overlapping guidance rows so the UI never says the
 * same thing twice.
 */
export function deriveImpactBullets(
  guidanceRows: ProgramPlanGuidance[],
): GuidanceImpactBullet[] {
  const out: GuidanceImpactBullet[] = [];
  const seen = new Set<string>();

  const push = (bullet: GuidanceImpactBullet) => {
    const k = `${bullet.kind}::${bullet.text}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(bullet);
  };

  const requireSlots = new Set<string>();
  const disallowSlots = new Set<string>();
  const emphasize = new Set<string>();
  const avoid = new Set<string>();
  let earliestTime: string | null = null;
  let latestTime: string | null = null;
  let minGap: number | null = null;
  let maxWindow: number | null = null;
  let hasMacroTargets = false;
  let hasNdsTargets = false;

  for (const g of guidanceRows) {
    const p = g.guidance_payload_json ?? null;
    if (!p) continue;

    const schedule = p.schedule_override ?? null;
    if (schedule) {
      for (const k of schedule.require_slots ?? []) requireSlots.add(k);
      for (const k of schedule.disallow_slots ?? []) disallowSlots.add(k);
      if (schedule.constraints) {
        if (schedule.constraints.no_earlier_than) {
          earliestTime = schedule.constraints.no_earlier_than;
        }
        if (schedule.constraints.no_later_than) {
          latestTime = schedule.constraints.no_later_than;
        }
        if (typeof schedule.constraints.min_gap_minutes === 'number') {
          minGap = schedule.constraints.min_gap_minutes;
        }
        if (
          typeof schedule.constraints.max_eating_window_minutes === 'number'
        ) {
          maxWindow = schedule.constraints.max_eating_window_minutes;
        }
      }
    }

    for (const item of p.emphasize ?? []) {
      const s = String(item).trim();
      if (s) emphasize.add(s);
    }
    for (const item of p.avoid ?? []) {
      const s = String(item).trim();
      if (s) avoid.add(s);
    }

    if (p.macro_targets) hasMacroTargets = true;
    if (p.nds_targets) hasNdsTargets = true;
  }

  if (requireSlots.size > 0) {
    push({
      kind: 'schedule_require',
      text: `Adds ${slotPhrase(Array.from(requireSlots))} to your day.`,
    });
  }
  if (disallowSlots.size > 0) {
    push({
      kind: 'schedule_disallow',
      text: `Removes ${slotPhrase(Array.from(disallowSlots))} from your day.`,
    });
  }
  if (earliestTime || latestTime) {
    if (earliestTime && latestTime) {
      push({
        kind: 'schedule_time_window',
        text: `Keeps meals between ${earliestTime} and ${latestTime}.`,
      });
    } else if (earliestTime) {
      push({
        kind: 'schedule_time_window',
        text: `Holds your first meal to ${earliestTime} or later.`,
      });
    } else if (latestTime) {
      push({
        kind: 'schedule_time_window',
        text: `Keeps your last meal by ${latestTime}.`,
      });
    }
  }
  if (minGap && minGap > 0) {
    const hours = minGap >= 60 ? Math.round(minGap / 60) : null;
    push({
      kind: 'schedule_spacing',
      text: hours
        ? `Leaves roughly ${hours} hour${hours === 1 ? '' : 's'} between meals.`
        : `Leaves ${minGap} minutes between meals.`,
    });
  }
  if (maxWindow && maxWindow > 0) {
    const hours = Math.round(maxWindow / 60);
    push({
      kind: 'schedule_spacing',
      text: `Keeps your eating window to about ${hours} hour${hours === 1 ? '' : 's'}.`,
    });
  }
  if (emphasize.size > 0) {
    push({
      kind: 'emphasize',
      text: `Emphasizes ${joinWithAnd(Array.from(emphasize).slice(0, 3))}.`,
    });
  }
  if (avoid.size > 0) {
    push({
      kind: 'avoid',
      text: `Avoids ${joinWithAnd(Array.from(avoid).slice(0, 3))}.`,
    });
  }
  if (hasMacroTargets) {
    push({
      kind: 'macro_targets',
      text: 'Sets custom macro targets for your plan.',
    });
  }
  if (hasNdsTargets) {
    push({
      kind: 'nds_targets',
      text: 'Sets nutrient density (NDS) targets for your plan.',
    });
  }

  return out;
}

// ============================================================================
// Top-level read
// ============================================================================

/**
 * Build the full user-facing runtime summary for a person. Safe to call
 * from any authenticated user surface — returns redacted/compact data
 * only.
 */
export async function buildProgramRuntimeSummary(
  personId: string,
): Promise<ProgramRuntimeSummary> {
  const now = new Date();

  // The resolver returns *currently-active-in-window* assignments + the
  // full resolved guidance set. For the "scheduled" bucket we need to
  // inspect assignments with status=active whose active_from is in the
  // future, which requires a second lookup.
  const resolution = await resolveInheritedGuidanceForPerson(personId);

  const scheduledLookup = await listAssignments({
    personId,
    status: 'active',
    limit: 50,
  });

  const activeIds = new Set(resolution.active_assignments.map((a) => a.id));
  const scheduled = scheduledLookup.rows.filter((a) => {
    if (activeIds.has(a.id)) return false;
    if (!a.active_from) return false;
    return new Date(a.active_from) > now;
  });

  const active = resolution.active_assignments.map((a) =>
    toAssignmentView(a, now),
  );
  const scheduledViews = scheduled.map((a) => toAssignmentView(a, now));

  const resolvedGuidance = resolution.resolved.map((r) => r.guidance);
  const impactBullets = deriveImpactBullets(resolvedGuidance);

  const resolvedSlugs = Array.from(
    new Set(resolution.resolved.map((r) => r.guidance.program_slug)),
  );

  return {
    person_id: personId,
    empty: active.length === 0 && scheduledViews.length === 0,
    active,
    scheduled: scheduledViews,
    impact_bullets: impactBullets,
    resolved_program_slugs: resolvedSlugs,
    resolved_at: resolution.resolved_at,
  };
}
