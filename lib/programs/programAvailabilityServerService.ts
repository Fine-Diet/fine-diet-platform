/**
 * Programs P3 — Availability / dependency service (read-only)
 *
 * Computes per-program availability for a person from three truth sources,
 * each kept in its existing home:
 *
 *   1. Entitlement / access truth  → existing access service (`hasEntitlement`
 *      over `person_entitlements`). We do NOT invent a parallel access system.
 *   2. Runtime / dependency truth  → `program_enrollments` via the runtime
 *      summary list (duration-aware `resolved_status` from P2). Enrollments are
 *      the single source of truth for in_progress / completed / restart.
 *   3. Dependency rules            → `appProgramsMvp` catalogue, used ONLY as a
 *      temporary dependency-rule input. It is not UI truth for lock/CTA state.
 *
 * This module never writes. Restart is implicit: a terminal (cancelled or
 * completed) enrollment leaves the slug with no *open* enrollment, so when
 * entitlement and dependencies are satisfied the program resolves back to
 * `available` — there is no separate restart action.
 */

import { hasEntitlement } from '@/lib/access/accessService';
import { PROGRAMS_MVP_CATEGORIES } from './appProgramsMvp';
import { isProgramRuntimeEnabled } from './programRuntimeRegistry';
import { listProgramRuntimeSummariesForPerson } from './programRuntimeServerService';
import type { ProgramEnrollmentStatus } from './runtimeTypes';

// ============================================================================
// Public shapes
// ============================================================================

export type ProgramAvailabilityState =
  | 'not_entitled'
  | 'dependency_locked'
  | 'available'
  | 'in_progress'
  | 'completed';

/**
 * Machine-readable reason, kept DISTINCT from `state` so the UI can tell apart
 * "you need access" (`entitlement_required`) from "finish a prerequisite first"
 * (`prerequisite_incomplete`) even though both can surface as a locked card.
 */
export type ProgramAvailabilityReason =
  | 'entitlement_required'
  | 'prerequisite_incomplete'
  | 'runtime_not_ready'
  | 'eligible_to_start'
  | 'enrollment_open'
  | 'enrollment_completed';

export interface ProgramAvailabilityDependency {
  /** Slug of the program that must be completed first. */
  required_program_slug: string;
  required_state: 'completed';
  satisfied: boolean;
}

export interface ProgramAvailabilityEntry {
  slug: string;
  state: ProgramAvailabilityState;
  reason: ProgramAvailabilityReason;
  is_entitled: boolean;
  has_open_enrollment: boolean;
  is_completed: boolean;
  /** True when a runtime version is wired up for this slug. */
  runtime_ready: boolean;
  /** Dependency rule applied (if any), with its satisfaction result. */
  dependency: ProgramAvailabilityDependency | null;
  /**
   * Additive UI signal: may the person create a *fresh* enrollment right now?
   * True when entitled, runtime-ready, dependency satisfied, and there is no
   * open enrollment. This is true for `available` AND for `completed` programs
   * that are eligible to restart — restart stays implicit via a new enrollment
   * row (no restart lifecycle action). `state`/`reason` are unchanged.
   */
  can_start: boolean;
}

export interface ProgramAvailabilityMap {
  person_id: string;
  entries: ProgramAvailabilityEntry[];
  resolved_at: string;
}

// ============================================================================
// Catalogue-derived dependency rules (appProgramsMvp = temporary input only)
// ============================================================================

/** Enrollment statuses that count as an *open* (re-enroll-blocking) program. */
const OPEN_ENROLLMENT_STATUSES: ReadonlySet<ProgramEnrollmentStatus> =
  new Set<ProgramEnrollmentStatus>(['pre_start', 'active', 'paused']);

/** Catalogue statuses that represent a real, evaluable program (not a stub). */
const REAL_PROGRAM_MVP_STATUSES = new Set(['available', 'available_soon', 'dependency_blocked']);

export interface ProgramDependencyRule {
  slug: string;
  /** Slug of a program that must be completed before this one unlocks. */
  requiresCompletedSlug: string | null;
}

/**
 * Extract the evaluable program slugs and their prerequisite rules from the
 * catalogue. Placeholder/`tba` cards are skipped. This is the only place that
 * reads dependency intent out of `appProgramsMvp`.
 */
export function extractProgramDependencyRules(): ProgramDependencyRule[] {
  const rules: ProgramDependencyRule[] = [];
  const seen = new Set<string>();
  for (const category of PROGRAMS_MVP_CATEGORIES) {
    for (const series of category.series) {
      for (const program of series.programs) {
        if (!REAL_PROGRAM_MVP_STATUSES.has(program.status)) continue;
        const slug = program.slug.toLowerCase();
        if (seen.has(slug)) continue;
        seen.add(slug);
        const requires =
          program.dependency?.type === 'previous_program_completion' &&
          program.dependency.programId
            ? program.dependency.programId.toLowerCase()
            : null;
        rules.push({ slug, requiresCompletedSlug: requires });
      }
    }
  }
  return rules;
}

// ============================================================================
// Pure availability derivation (no IO — unit-testable)
// ============================================================================

export interface ProgramAvailabilityInputs {
  rules: ProgramDependencyRule[];
  entitledSlugs: ReadonlySet<string>;
  openEnrollmentSlugs: ReadonlySet<string>;
  completedSlugs: ReadonlySet<string>;
  runtimeReadySlugs: ReadonlySet<string>;
}

/**
 * Resolve a single program's availability. Precedence:
 *   1. open enrollment      → in_progress     (runtime truth wins)
 *   2. completed enrollment → completed
 *   3. not entitled         → not_entitled
 *   4. prerequisite unmet   → dependency_locked (prerequisite_incomplete)
 *   5. runtime not ready    → dependency_locked (runtime_not_ready)
 *   6. otherwise            → available
 *
 * `not_entitled` and `dependency_locked` are deliberately never collapsed.
 */
export function deriveProgramAvailabilityEntry(
  rule: ProgramDependencyRule,
  inputs: Omit<ProgramAvailabilityInputs, 'rules'>,
): ProgramAvailabilityEntry {
  const slug = rule.slug.toLowerCase();
  const isEntitled = inputs.entitledSlugs.has(slug);
  const hasOpen = inputs.openEnrollmentSlugs.has(slug);
  const isCompleted = inputs.completedSlugs.has(slug);
  const runtimeReady = inputs.runtimeReadySlugs.has(slug);

  const dependency: ProgramAvailabilityDependency | null = rule.requiresCompletedSlug
    ? {
        required_program_slug: rule.requiresCompletedSlug,
        required_state: 'completed',
        satisfied: inputs.completedSlugs.has(rule.requiresCompletedSlug),
      }
    : null;

  const dependencySatisfied = !dependency || dependency.satisfied;

  let state: ProgramAvailabilityState;
  let reason: ProgramAvailabilityReason;

  if (hasOpen) {
    state = 'in_progress';
    reason = 'enrollment_open';
  } else if (isCompleted) {
    state = 'completed';
    reason = 'enrollment_completed';
  } else if (!isEntitled) {
    state = 'not_entitled';
    reason = 'entitlement_required';
  } else if (dependency && !dependency.satisfied) {
    state = 'dependency_locked';
    reason = 'prerequisite_incomplete';
  } else if (!runtimeReady) {
    state = 'dependency_locked';
    reason = 'runtime_not_ready';
  } else {
    state = 'available';
    reason = 'eligible_to_start';
  }

  // Fresh enrollment is permitted whenever access + dependency + runtime are
  // satisfied and nothing is open — this covers both `available` and an
  // eligible `completed` (restart) without a separate restart action.
  const canStart =
    isEntitled && !hasOpen && runtimeReady && dependencySatisfied;

  return {
    slug,
    state,
    reason,
    is_entitled: isEntitled,
    has_open_enrollment: hasOpen,
    is_completed: isCompleted,
    runtime_ready: runtimeReady,
    dependency,
    can_start: canStart,
  };
}

export function deriveProgramAvailability(
  inputs: ProgramAvailabilityInputs,
): ProgramAvailabilityEntry[] {
  const { rules, ...rest } = inputs;
  return rules.map((rule) => deriveProgramAvailabilityEntry(rule, rest));
}

// ============================================================================
// IO wrapper
// ============================================================================

/**
 * Compute availability for a person across the evaluable catalogue programs
 * (or an explicit slug list). Reads entitlement via the access service and
 * runtime/dependency state via `program_enrollments` summaries.
 */
export async function computeProgramAvailabilityForPerson(
  personId: string,
  slugs?: string[],
): Promise<ProgramAvailabilityMap> {
  const rules = slugs
    ? slugs.map((s) => {
        const found = extractProgramDependencyRules().find(
          (r) => r.slug === s.toLowerCase(),
        );
        return found ?? { slug: s.toLowerCase(), requiresCompletedSlug: null };
      })
    : extractProgramDependencyRules();

  if (!personId || rules.length === 0) {
    return { person_id: personId, entries: [], resolved_at: new Date().toISOString() };
  }

  // Slugs we need completion truth for: the evaluated programs plus any
  // prerequisite they reference.
  const slugsForEntitlement = new Set<string>();
  for (const rule of rules) slugsForEntitlement.add(rule.slug);

  const [summaryList, entitlementResults] = await Promise.all([
    listProgramRuntimeSummariesForPerson(personId),
    Promise.all(
      Array.from(slugsForEntitlement).map(async (slug) => ({
        slug,
        entitled: await hasEntitlement(personId, `program:${slug}`),
      })),
    ),
  ]);

  const entitledSlugs = new Set<string>();
  for (const r of entitlementResults) if (r.entitled) entitledSlugs.add(r.slug);

  const openEnrollmentSlugs = new Set<string>();
  const completedSlugs = new Set<string>();
  for (const summary of summaryList.summaries) {
    const slug = summary.program.slug.toLowerCase();
    if (OPEN_ENROLLMENT_STATUSES.has(summary.resolved_status)) {
      openEnrollmentSlugs.add(slug);
    }
    if (summary.resolved_status === 'completed') completedSlugs.add(slug);
  }

  const runtimeReadySlugs = new Set<string>();
  for (const rule of rules) {
    if (isProgramRuntimeEnabled(rule.slug)) runtimeReadySlugs.add(rule.slug);
  }

  const entries = deriveProgramAvailability({
    rules,
    entitledSlugs,
    openEnrollmentSlugs,
    completedSlugs,
    runtimeReadySlugs,
  });

  return {
    person_id: personId,
    entries,
    resolved_at: new Date().toISOString(),
  };
}
