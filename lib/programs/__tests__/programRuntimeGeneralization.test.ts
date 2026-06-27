let mockFrom!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

import { createOrUpdateBaselineRecommendationForEnrollment } from '../programRuntimeServerService';
import type {
  ProgramEnrollment,
  ProgramRuntimeSummary,
} from '../runtimeTypes';
import { isCheckinDue } from '../runtimeUi';

function summary(options: {
  status?: ProgramRuntimeSummary['resolved_status'];
  currentDay: number;
  templateDay?: number | null;
  latestResponseDay?: number | null;
  slug?: string;
}): ProgramRuntimeSummary {
  return {
    enrollment: {} as ProgramRuntimeSummary['enrollment'],
    version: {} as ProgramRuntimeSummary['version'],
    program: {
      id: 'program-x',
      slug: options.slug ?? 'digestive-foundations',
      title: 'Digestive Foundations',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: options.status ?? 'active',
    current_day: options.currentDay,
    timezone: 'UTC',
    next_checkin_template:
      options.templateDay == null
        ? null
        : ({
            id: `template-${options.templateDay}`,
            checkin_day: options.templateDay,
          } as ProgramRuntimeSummary['next_checkin_template']),
    latest_checkin_response:
      options.latestResponseDay == null
        ? null
        : ({
            id: `response-${options.latestResponseDay}`,
            checkin_day: options.latestResponseDay,
            response_status: 'completed',
          } as ProgramRuntimeSummary['latest_checkin_response']),
    latest_recommendation: null,
    resolved_at: '2026-06-26T00:00:00.000Z',
  };
}

describe('isCheckinDue is template-driven (not tied to 7/14/21)', () => {
  test('due on an arbitrary cadence day when a template lands on it', () => {
    expect(
      isCheckinDue(
        summary({ currentDay: 10, templateDay: 10, latestResponseDay: 3 }),
      ),
    ).toBe(true);
  });

  test('not due when the template day does not match the current day', () => {
    expect(
      isCheckinDue(summary({ currentDay: 10, templateDay: 14 })),
    ).toBe(false);
  });

  test('not due once the current-day check-in has been answered', () => {
    expect(
      isCheckinDue(
        summary({ currentDay: 10, templateDay: 10, latestResponseDay: 10 }),
      ),
    ).toBe(false);
  });

  test('not due outside active runtime', () => {
    expect(
      isCheckinDue(summary({ status: 'paused', currentDay: 10, templateDay: 10 })),
    ).toBe(false);
  });
});

describe('Baseline recommendation engine ignores non-Baseline programs', () => {
  beforeEach(() => mockFrom.mockReset());

  test('returns null and never touches the DB for a non-Baseline enrollment', async () => {
    const enrollment = {
      id: 'enrollment-1',
      program_slug: 'digestive-foundations',
    } as unknown as ProgramEnrollment;

    const result =
      await createOrUpdateBaselineRecommendationForEnrollment(enrollment);

    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
