/**
 * Onboarding — page-sequence resolution (SSR/client-safe).
 *
 * Single source of truth for turning an `OnboardingFlowConfig` into the ordered
 * list of pages the live view and admin preview render. Pure: no React, no
 * network. Kept separate from the view so it is unit-testable and so the admin
 * authoring UI can preview the effective page structure without the view.
 *
 * Resolution rules:
 *   - When `config.pages` is present and non-empty, use it (the validator has
 *     already guaranteed known question ids, unique page ids, no duplicate
 *     question ids, and allowlisted groupings).
 *   - Otherwise derive Initial Setup v2 pages via `deriveDefaultOnboardingPages`.
 *   - In both cases, drop pages that would render nothing — a page whose
 *     `visible` is false, or whose every question is hidden via a per-question
 *     `visible: false` override. This keeps navigation and progress accurate.
 *   - Customer-facing live resolution then applies the Initial Setup v2
 *     boundary so admin/config cannot silently re-expand the initial gate.
 *   - If filtering leaves no pages at all, fall back to the derived default so
 *     the flow never renders a blank shell.
 */

import {
  deriveDefaultOnboardingPages,
  INITIAL_SETUP_MAX_PAGES,
  INITIAL_SETUP_QUESTION_IDS,
  type OnboardingFlowConfig,
  type OnboardingPageConfig,
} from './onboardingFlowTypes';

const INITIAL_SETUP_QUESTION_SET = new Set<string>(INITIAL_SETUP_QUESTION_IDS);

function questionIsVisible(config: OnboardingFlowConfig, qid: string): boolean {
  const override = config.questions[qid as keyof typeof config.questions];
  return !(override?.visible === false);
}

function pageHasVisibleQuestion(config: OnboardingFlowConfig, page: OnboardingPageConfig): boolean {
  if (page.visible === false) return false;
  return page.questionIds.some((qid) => questionIsVisible(config, qid));
}

/**
 * Code-owned Initial Setup v2 boundary: keep only allowlisted questions, max
 * two pages. Presentation overlays (prompts/labels/order/required) still apply
 * via config.questions; displaced catalog questions cannot re-enter the gate.
 */
export function applyInitialSetupBoundary(
  pages: readonly OnboardingPageConfig[],
): OnboardingPageConfig[] {
  const bounded: OnboardingPageConfig[] = [];
  for (const page of pages) {
    const questionIds = page.questionIds.filter((qid) => INITIAL_SETUP_QUESTION_SET.has(qid));
    if (questionIds.length === 0) continue;
    bounded.push({ ...page, questionIds });
    if (bounded.length >= INITIAL_SETUP_MAX_PAGES) break;
  }
  return bounded.length > 0 ? bounded : deriveDefaultOnboardingPages();
}

/**
 * Resolve the ordered, renderable page sequence for a config. Never returns an
 * empty array — falls back to the derived default when filtering removes every
 * page. Customer-facing callers should leave `enforceInitialSetupBoundary`
 * enabled (default) so published admin configs cannot expand the gate.
 */
export function resolveOnboardingPages(
  config: OnboardingFlowConfig | null | undefined,
  opts?: { enforceInitialSetupBoundary?: boolean },
): OnboardingPageConfig[] {
  const enforceBoundary = opts?.enforceInitialSetupBoundary !== false;
  const base: OnboardingPageConfig[] =
    config?.pages && config.pages.length > 0 ? config.pages : deriveDefaultOnboardingPages();

  const filtered = base.filter((page) =>
    pageHasVisibleQuestion(config ?? { version: 1, questions: {} }, page),
  );
  const resolved = filtered.length > 0 ? filtered : deriveDefaultOnboardingPages();
  return enforceBoundary ? applyInitialSetupBoundary(resolved) : resolved;
}

/** Flat, de-duplicated, ordered list of question ids rendered across `pages`. */
export function pageQuestionIds(pages: readonly OnboardingPageConfig[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    for (const qid of page.questionIds) {
      if (!seen.has(qid)) {
        seen.add(qid);
        out.push(qid);
      }
    }
  }
  return out;
}
