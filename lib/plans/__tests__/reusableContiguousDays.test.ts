import {
  assertContiguousDateKeys,
  assertContiguousPlanDays,
  CONTIGUOUS_PLAN_DAYS_ERROR,
} from '@/lib/plans/reusableContiguousDays';
import type { PlanDay } from '@/lib/plans/types';

describe('reusableContiguousDays', () => {
  test('accepts a single day', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18'])).not.toThrow();
  });

  test('accepts contiguous days', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18', '2026-07-19', '2026-07-20'])).not.toThrow();
  });

  test('rejects non-contiguous days', () => {
    expect(() => assertContiguousDateKeys(['2026-07-18', '2026-07-20'])).toThrow(
      CONTIGUOUS_PLAN_DAYS_ERROR,
    );
  });

  test('assertContiguousPlanDays sorts before validating', () => {
    const days: PlanDay[] = [
      {
        id: 'd2',
        plan_id: 'p1',
        person_id: 'person',
        date_local: '2026-07-19',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'd1',
        plan_id: 'p1',
        person_id: 'person',
        date_local: '2026-07-18',
        created_at: '',
        updated_at: '',
      },
    ];
    expect(() => assertContiguousPlanDays(days)).not.toThrow();
  });
});
