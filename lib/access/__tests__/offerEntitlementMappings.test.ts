import { describe, expect, test } from '@jest/globals';
import {
  getCodeOwnedOfferEntitlementMappings,
  resolveEffectiveOfferEntitlementMappings,
} from '../offerEntitlementMappings';

describe('offer entitlement mappings', () => {
  test('journal-annual includes existing journal access entitlement', () => {
    expect(getCodeOwnedOfferEntitlementMappings('journal-annual')).toContainEqual({
      entitlement_key: 'journal',
      duration_days: null,
    });
  });

  test('journal-annual includes Baseline program access entitlement', () => {
    expect(getCodeOwnedOfferEntitlementMappings('journal-annual')).toContainEqual({
      entitlement_key: 'program:baseline',
      duration_days: null,
    });
  });

  test('merges database mappings with code-owned journal-annual mappings', () => {
    expect(
      resolveEffectiveOfferEntitlementMappings('journal-annual', [
        {
          entitlement_key: 'feature:plans-ai-generate',
          duration_days: 365,
          is_active: true,
        },
      ]),
    ).toEqual([
      {
        entitlement_key: 'feature:plans-ai-generate',
        duration_days: 365,
      },
      {
        entitlement_key: 'journal',
        duration_days: null,
      },
      {
        entitlement_key: 'program:baseline',
        duration_days: null,
      },
    ]);
  });

  test('supports bundle-style offers with multiple entitlement mappings', () => {
    expect(
      resolveEffectiveOfferEntitlementMappings('future-fine-diet-method-bundle', [
        {
          entitlement_key: 'program:baseline',
          duration_days: null,
          is_active: true,
        },
        {
          entitlement_key: 'program:digestive-foundations',
          duration_days: null,
          is_active: true,
        },
        {
          entitlement_key: 'program:protein-sufficiency',
          duration_days: null,
          is_active: true,
        },
      ]),
    ).toEqual([
      {
        entitlement_key: 'program:baseline',
        duration_days: null,
      },
      {
        entitlement_key: 'program:digestive-foundations',
        duration_days: null,
      },
      {
        entitlement_key: 'program:protein-sufficiency',
        duration_days: null,
      },
    ]);
  });

  test('keeps database duration when a required mapping already exists', () => {
    expect(
      resolveEffectiveOfferEntitlementMappings('journal-annual', [
        {
          entitlement_key: 'journal',
          duration_days: 365,
          is_active: true,
        },
      ]),
    ).toContainEqual({
      entitlement_key: 'journal',
      duration_days: 365,
    });
  });

  test('dedupes repeated mappings for idempotent grant input', () => {
    const mappings = resolveEffectiveOfferEntitlementMappings('journal-annual', [
      {
        entitlement_key: 'program:baseline',
        duration_days: null,
        is_active: true,
      },
      {
        entitlement_key: 'PROGRAM:BASELINE',
        duration_days: null,
        is_active: true,
      },
    ]);

    expect(
      mappings.filter((mapping) => mapping.entitlement_key === 'program:baseline'),
    ).toHaveLength(1);
  });

  test('does not include runtime enrollment side effects', () => {
    const mapping = getCodeOwnedOfferEntitlementMappings('journal-annual')[0];

    expect(mapping).not.toHaveProperty('program_enrollment');
    expect(mapping).not.toHaveProperty('selected_start_date');
  });
});
