/**
 * Onboarding authoring — validation.
 *
 * Two layers:
 *   1. Structural: `onboardingFlowConfigSchema` (zod) — types, known question
 *      ids, exactly TOTAL_STEPS steps, unknown top-level keys stripped.
 *   2. Semantic: `validateOnboardingFlowConfig` — per-question allowlists:
 *      `optionLabels` keys and `optionOrder` entries must be within the
 *      code-owned `allowedOptionValues` for that question; no duplicates; no
 *      unknown values. Returns a structured report for the admin UI.
 *
 * Publishing uses the strict path (`ok === true` required). Saving a draft
 * uses the same validator but only surfaces warnings — a malformed draft must
 * not publish.
 */

import {
  isAllowedGrouping,
  onboardingFlowConfigSchema,
  getKnownQuestion,
  type OnboardingFlowConfig,
} from './onboardingFlowTypes';

export interface ValidationIssue {
  /** `questions.<id>.<field>` or `steps.<i>` or `root`. */
  path: string;
  message: string;
}

export interface OnboardingFlowValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function ok(): OnboardingFlowValidationResult {
  return { ok: true, issues: [] };
}

function fail(issues: ValidationIssue[]): OnboardingFlowValidationResult {
  return { ok: false, issues };
}

/**
 * Strictly validate an onboarding flow config. Returns a structured report.
 * `ok === true` only when the config is structurally and semantically valid
 * and safe to publish.
 */
export function validateOnboardingFlowConfig(
  input: unknown,
): OnboardingFlowValidationResult {
  // ── Structural (zod) ────────────────────────────────────────────────────
  const parsed = onboardingFlowConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((zi) => ({
      path: zi.path.length ? zi.path.join('.') : 'root',
      message: zi.message,
    }));
    return fail(issues);
  }

  const config: OnboardingFlowConfig = parsed.data;
  const issues: ValidationIssue[] = [];

  // ── Semantic: known question ids only ────────────────────────────────────
  // zod allows any string key (see schema comment); enforce the allowlist here.
  for (const qid of Object.keys(config.questions)) {
    if (!getKnownQuestion(qid)) {
      issues.push({ path: `questions.${qid}`, message: `Unknown question id "${qid}".` });
    }
  }

  // ── Semantic: per-question option allowlists ─────────────────────────────
  for (const [qid, override] of Object.entries(config.questions)) {
    const def = getKnownQuestion(qid);
    if (!def) continue;

    const allowed = def.allowedOptionValues ?? [];
    const allowedSet = new Set(allowed);

    // optionLabels: every key must be an allowed option value.
    if (override.optionLabels) {
      for (const key of Object.keys(override.optionLabels)) {
        if (!allowedSet.has(key)) {
          issues.push({
            path: `questions.${qid}.optionLabels.${key}`,
            message: `"${key}" is not an allowed option value for question "${qid}".`,
          });
        }
      }
    }

    // optionOrder: must be a sub-permutation of allowed values — no unknowns,
    // no duplicates. Reordering or hiding options is allowed; inventing new
    // values is not.
    if (override.optionOrder) {
      const seen = new Set<string>();
      for (const val of override.optionOrder) {
        if (!allowedSet.has(val)) {
          issues.push({
            path: `questions.${qid}.optionOrder`,
            message: `"${val}" is not an allowed option value for question "${qid}".`,
          });
        } else if (seen.has(val)) {
          issues.push({
            path: `questions.${qid}.optionOrder`,
            message: `Duplicate option value "${val}" in optionOrder for question "${qid}".`,
          });
        }
        seen.add(val);
      }
    }

    // Select questions may not carry free-text-only fields meaningfully, but
    // we do not forbid prompt/hint on any type.
  }

  // ── Semantic: page sequencing (when `pages` is present) ───────────────────
  // Page ids must be unique; question ids must be known; a question id may
  // appear on at most one page; grouped (>1 question) pages must match an
  // allowlisted grouping; each visible page must have ≥1 visible question.
  if (config.pages && config.pages.length > 0) {
    const pageIds = new Set<string>();
    const seenQuestionIds = new Set<string>();
    config.pages.forEach((page, i) => {
      const ppath = `pages.${i}`;

      if (pageIds.has(page.id)) {
        issues.push({ path: 'pages', message: `Duplicate page id "${page.id}".` });
      } else {
        pageIds.add(page.id);
      }

      for (const qid of page.questionIds) {
        if (!getKnownQuestion(qid)) {
          issues.push({
            path: `${ppath}.questionIds`,
            message: `Unknown question id "${qid}" on page "${page.id}".`,
          });
        } else if (seenQuestionIds.has(qid)) {
          issues.push({
            path: `${ppath}.questionIds`,
            message: `Question id "${qid}" appears on more than one page.`,
          });
        } else {
          seenQuestionIds.add(qid);
        }
      }

      // Grouped pages must match a code-owned grouping allowlist.
      if (page.questionIds.length > 1 && !isAllowedGrouping(page.questionIds, page.groupingReason)) {
        issues.push({
          path: `${ppath}.questionIds`,
          message: `Grouped page "${page.id}" (${page.questionIds.join(', ')}) is not an allowlisted grouping. Provide a valid groupingReason matching an allowed grouping.`,
        });
      }

      // Each visible page must render at least one visible known question.
      const pageVisible = page.visible ?? true;
      if (pageVisible) {
        const anyVisibleQuestion = page.questionIds.some((qid) => {
          const qOverride = config.questions[qid as keyof typeof config.questions];
          return !(qOverride?.visible === false);
        });
        if (!anyVisibleQuestion) {
          issues.push({
            path: `${ppath}.visible`,
            message: `Visible page "${page.id}" has no visible questions.`,
          });
        }
      }
    });
  }

  return issues.length ? fail(issues) : ok();
}

/** Convenience: true when `input` is a valid, publishable config. */
export function isValidOnboardingFlowConfig(input: unknown): boolean {
  return validateOnboardingFlowConfig(input).ok;
}

/**
 * Validate a full record (config + envelope). Used by the server service
 * before persisting. Envelope fields (flowKey/title/status) are checked here;
 * the config is delegated to `validateOnboardingFlowConfig`.
 */
export interface OnboardingFlowRecordValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  record?: OnboardingFlowConfig;
}

export function validateOnboardingFlowRecord(
  input: unknown,
): OnboardingFlowRecordValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, issues: [{ path: 'root', message: 'Record must be an object.' }] };
  }
  const obj = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  if (typeof obj.flowKey !== 'string' || !obj.flowKey.trim()) {
    issues.push({ path: 'flowKey', message: 'flowKey is required.' });
  }
  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    issues.push({ path: 'title', message: 'title is required.' });
  }

  const configResult = validateOnboardingFlowConfig(obj.config);
  if (!configResult.ok) {
    issues.push(...configResult.issues);
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, issues: [], record: obj.config as OnboardingFlowConfig };
}
