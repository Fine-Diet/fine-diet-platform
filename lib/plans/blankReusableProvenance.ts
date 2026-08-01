/**
 * Plan-less blank reusable provenance.
 *
 * Day templates persist `source_date_local` into a DATE NOT NULL column, so
 * blank templates must store a deterministic ISO calendar date. Identity of
 * blank provenance is the stable non-FK `source_plan_id` sentinel — never the
 * date alone.
 */

import { isRealCalendarDateKey } from './planDateRange';

export const BLANK_REUSABLE_SOURCE_PLAN_ID =
  '00000000-0000-4000-8000-0000000000b1';

/** Sentinel calendar date for plan-less blank day templates (DATE NOT NULL). */
export const BLANK_DAY_TEMPLATE_SOURCE_DATE_LOCAL = '1970-01-01';

export function isBlankReusableSourcePlanId(sourcePlanId: string | null | undefined): boolean {
  return sourcePlanId === BLANK_REUSABLE_SOURCE_PLAN_ID;
}

/** Assert a day-template persistence payload satisfies the live DATE contract. */
export function assertDayTemplateSourceDateContract(sourceDateLocal: string): void {
  if (!isRealCalendarDateKey(sourceDateLocal)) {
    throw new Error(
      `source_date_local must be a real YYYY-MM-DD calendar date (got ${JSON.stringify(sourceDateLocal)}).`,
    );
  }
}

/**
 * UI label for day-template provenance. Blank templates never expose the
 * sentinel date as an authored source date.
 */
export function formatDayTemplateSourceLabel(args: {
  source_plan_id: string;
  source_date_local: string;
}): string {
  if (isBlankReusableSourcePlanId(args.source_plan_id)) {
    return 'blank template';
  }
  return args.source_date_local;
}
