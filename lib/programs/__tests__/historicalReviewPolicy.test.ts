import type { ProgramDeliveryModuleDefinition } from '../deliveryModuleTypes';
import {
  filterMemberDeliveryModules,
  rejectDeliveryVersion,
  selectHistoricalReviewModules,
} from '../historicalReviewPolicy';
import {
  declaredPrerequisiteSlug,
  isValidationOnlyMetadata,
  isVerifiedAdminGrant,
} from '../enrollmentAuthorization';

const week: ProgramDeliveryModuleDefinition = {
  id: 'week-1',
  programSlug: 'digestive-foundations',
  moduleType: 'week',
  title: 'Week 1',
  body: 'Informational week',
  dayStart: 1,
  dayEnd: 7,
  statusVisibility: ['active'],
  cta: { label: 'Open check-in', href: '/check-in' },
  showWhen: 'checkin_due',
};

describe('historical review policy', () => {
  test('returns reached informational modules without calls to action', () => {
    const visible = selectHistoricalReviewModules(
      [
        week,
        { ...week, id: 'day-3-checkin', moduleType: 'checkin_prompt', dayStart: 3, dayEnd: 3 },
        { ...week, id: 'future', dayStart: 8, dayEnd: 14 },
        { ...week, id: 'unbounded', dayStart: undefined, dayEnd: undefined },
      ],
      3,
    );
    expect(visible.map((module) => module.id)).toEqual(['week-1']);
    expect(visible[0].cta).toBeUndefined();
    expect(visible[0].showWhen).toBeUndefined();
  });

  test('fail-closes historical review beyond Day 0 when the reached day is unknown', () => {
    const dayZero: ProgramDeliveryModuleDefinition = {
      ...week,
      id: 'day-0',
      moduleType: 'prep',
      dayStart: 0,
      dayEnd: 0,
    };
    const visible = selectHistoricalReviewModules([dayZero, week], 0);
    expect(visible.map((module) => module.id)).toEqual(['day-0']);
    expect(filterMemberDeliveryModules([dayZero, week], 'paused', 0).map((module) => module.id)).toEqual(['day-0']);
    expect(filterMemberDeliveryModules([dayZero, week], 'paused', 3).map((module) => module.id)).toEqual([
      'day-0',
      'week-1',
    ]);
  });

  test('preserves active and pre-start filtering', () => {
    expect(filterMemberDeliveryModules([week], 'active', 3).map((module) => module.id)).toEqual(['week-1']);
    expect(filterMemberDeliveryModules([week], 'pre_start', 0)).toEqual([]);
    const dayZero: ProgramDeliveryModuleDefinition = {
      ...week,
      id: 'day-0',
      moduleType: 'prep',
      dayStart: 0,
      dayEnd: 0,
      statusVisibility: ['pre_start', 'active'],
    };
    expect(filterMemberDeliveryModules([dayZero], 'pre_start', 0).map((module) => module.id)).toEqual(['day-0']);
    expect(filterMemberDeliveryModules([dayZero], 'active', 0).map((module) => module.id)).toEqual(['day-0']);
  });

  test('rejects foreign, draft, and stale delivery versions', () => {
    expect(rejectDeliveryVersion({
      requestedVersionId: 'other',
      enrolledVersionId: 'enrolled',
      versionStatus: 'published',
    })).toBe('foreign-version');
    expect(rejectDeliveryVersion({
      enrolledVersionId: 'enrolled',
      versionStatus: 'draft',
    })).toBe('draft-content');
    expect(rejectDeliveryVersion({
      enrolledVersionId: 'enrolled',
      versionStatus: 'published',
      responseVersionId: 'stale',
    })).toBe('stale-response');
  });
});

describe('enrollment authorization policy', () => {
  test('reads catalogue prerequisites without using availability.can_start', () => {
    expect(declaredPrerequisiteSlug('digestive-foundations')).toBe('baseline');
    expect(declaredPrerequisiteSlug('baseline')).toBeNull();
    expect(isValidationOnlyMetadata({ content_status: 'validation_only' })).toBe(true);
    expect(isValidationOnlyMetadata({ content_status: 'published' })).toBe(false);
    expect(isVerifiedAdminGrant('verified_admin_grant')).toBe(true);
    expect(isVerifiedAdminGrant('member')).toBe(false);
    expect(isVerifiedAdminGrant(undefined)).toBe(false);
  });
});
