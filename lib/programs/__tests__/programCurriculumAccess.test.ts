import type {
  CurriculumAssignmentRef,
  CurriculumEntitlementRef,
} from '../programCurriculumAccess';

const NOW = new Date('2026-11-09T18:00:00.000Z');

function entitlement(
  overrides: Partial<CurriculumEntitlementRef> = {},
): CurriculumEntitlementRef {
  return {
    entitlement_key: 'program:guided',
    source: 'stripe',
    source_ref: 'sub_guided',
    is_active: true,
    starts_at: '2026-11-08T18:00:00.000Z',
    ends_at: null,
    ...overrides,
  };
}

function assignment(
  overrides: Partial<CurriculumAssignmentRef> = {},
): CurriculumAssignmentRef {
  return {
    program_slug: 'guided',
    acquisition_source: 'purchase',
    status: 'active',
    active_from: '2026-11-08T18:00:00.000Z',
    active_to: null,
    source_ref: 'sub_guided',
    ...overrides,
  };
}

let mockFrom: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: (...args: unknown[]) => mockFrom(...args),
    },
  };
});

import {
  assignmentIndependentlyAuthorizesCurriculum,
  hasCurrentProgramCurriculumAccess,
  personHasCurrentProgramCurriculumAccess,
  purchaseAssignmentCorrelatesWithStripeEntitlement,
} from '../programCurriculumAccess';

function query(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'lte', 'or', 'in', 'order', 'limit']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.then = jest.fn((resolve, reject) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
    }).then(resolve, reject),
  );
  return chain;
}

describe('program curriculum access', () => {
  describe('purchase source_ref correlation', () => {
    const purchase = assignment();

    it('matches the exact Stripe source_ref for the same program', () => {
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement()],
          'guided',
          NOW,
        ),
      ).toBe(true);
    });

    it('fails closed for a missing, blank, or different source_ref', () => {
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ source_ref: null }),
          [entitlement({ source_ref: null })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ source_ref: '   ' }),
          [entitlement({ source_ref: '   ' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ source_ref: 'sub_other' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ source_ref: 'sub_guided ' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
    });

    it('does not treat a session id as a subscription id', () => {
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ source_ref: 'cs_test_session' }),
          [entitlement({ source_ref: 'sub_guided' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
    });

    it('rejects revoked, expired, future, non-stripe, and wrong-program rows', () => {
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ is_active: false })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ ends_at: '2026-11-09T17:59:59.000Z' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ starts_at: '2026-11-10T18:00:00.000Z' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ source: 'manual' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          purchase,
          [entitlement({ entitlement_key: 'program:other' })],
          'guided',
          NOW,
        ),
      ).toBe(false);
    });

    it('rejects cancelled, future, and expired purchase assignments', () => {
      const current = [entitlement()];
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ status: 'cancelled' }),
          current,
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ active_from: '2026-11-10T18:00:00.000Z' }),
          current,
          'guided',
          NOW,
        ),
      ).toBe(false);
      expect(
        purchaseAssignmentCorrelatesWithStripeEntitlement(
          assignment({ active_to: '2026-11-09T17:00:00.000Z' }),
          current,
          'guided',
          NOW,
        ),
      ).toBe(false);
    });
  });

  describe('combined current access', () => {
    it('denies an active purchase assignment after the Stripe entitlement ends', () => {
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [entitlement({ is_active: false })],
          assignments: [assignment()],
          now: NOW,
        }),
      ).toBe(false);
    });

    it('allows a current program entitlement even when the purchase source_ref differs', () => {
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [entitlement({ source_ref: 'sub_other' })],
          assignments: [assignment()],
          now: NOW,
        }),
      ).toBe(true);
    });

    it.each(['admin_grant', 'offer', 'bundle', 'other'] as const)(
      'allows an active in-window %s grant beside a stale purchase',
      (acquisitionSource) => {
        expect(
          hasCurrentProgramCurriculumAccess({
            programSlug: 'guided',
            entitlements: [entitlement({ is_active: false })],
            assignments: [
              assignment(),
              assignment({
                acquisition_source: acquisitionSource,
                source_ref: `${acquisitionSource}:guided`,
              }),
            ],
            now: NOW,
          }),
        ).toBe(true);
      },
    );

    it('does not let a stale purchase masquerade as an independent grant', () => {
      expect(
        assignmentIndependentlyAuthorizesCurriculum(assignment(), 'guided', NOW),
      ).toBe(false);
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [],
          assignments: [assignment({ acquisition_source: 'purchase' })],
          now: NOW,
        }),
      ).toBe(false);
    });

    it('denies cancelled, future, and expired independent grants', () => {
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [],
          assignments: [
            assignment({ acquisition_source: 'admin_grant', status: 'cancelled' }),
          ],
          now: NOW,
        }),
      ).toBe(false);
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [],
          assignments: [
            assignment({
              acquisition_source: 'offer',
              active_from: '2026-11-10T18:00:00.000Z',
            }),
          ],
          now: NOW,
        }),
      ).toBe(false);
      expect(
        hasCurrentProgramCurriculumAccess({
          programSlug: 'guided',
          entitlements: [],
          assignments: [
            assignment({
              acquisition_source: 'bundle',
              active_to: '2026-11-09T17:00:00.000Z',
            }),
          ],
          now: NOW,
        }),
      ).toBe(false);
    });
  });

  describe('person loader', () => {
    beforeEach(() => {
      mockFrom.mockReset();
    });

    it('queries only the requested person and fails closed on a lookup error', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'person_entitlements') {
          return query({ data: [], error: { message: 'entitlement down' } });
        }
        return query({
          data: [assignment({ acquisition_source: 'admin_grant' })],
        });
      });

      await expect(
        personHasCurrentProgramCurriculumAccess('person-b', 'guided', NOW),
      ).resolves.toBe(false);
      expect(mockFrom).toHaveBeenCalledWith('person_entitlements');
      expect(mockFrom).toHaveBeenCalledWith('program_assignments');
      const entitlementQuery = mockFrom.mock.results.find(
        (_result, index) => mockFrom.mock.calls[index][0] === 'person_entitlements',
      )?.value;
      expect(entitlementQuery.eq).toHaveBeenCalledWith('person_id', 'person-b');
      expect(entitlementQuery.eq).toHaveBeenCalledWith(
        'entitlement_key',
        'program:guided',
      );
    });

    it('allows a correlated Stripe row returned for that person', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'person_entitlements') return query({ data: [entitlement()] });
        return query({ data: [assignment()] });
      });

      await expect(
        personHasCurrentProgramCurriculumAccess('person-b', 'guided', NOW),
      ).resolves.toBe(true);
    });

    it('denies a stale purchase when the person lookup returns no current entitlement', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'person_entitlements') return query({ data: [] });
        return query({ data: [assignment()] });
      });

      await expect(
        personHasCurrentProgramCurriculumAccess('person-b', 'guided', NOW),
      ).resolves.toBe(false);
    });
  });
});
