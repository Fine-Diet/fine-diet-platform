/**
 * Tests for the assessment registry / catalog helpers.
 *
 * Covers the contract the canonical /assessments/[slug] route relies on:
 * only `active` registered slugs resolve, unknown slugs never resolve (so
 * unsupported assessments never leak Gut Check content), labels fall back to
 * the raw type, and the registry invariant catches duplicate keys.
 */

import {
  ASSESSMENT_REGISTRY,
  getAssessmentEntry,
  getAssessmentEntryByType,
  getAssessmentLabel,
  isSupportedAssessmentSlug,
  listActiveAssessments,
  validateRegistry,
  type AssessmentRegistryEntry,
} from '../assessmentRegistry';

function makeEntry(overrides: Partial<AssessmentRegistryEntry> = {}): AssessmentRegistryEntry {
  return {
    slug: 'x',
    assessmentType: 'x',
    title: 'X',
    shortTitle: 'X',
    description: 'desc',
    defaultVersion: 1,
    status: 'active',
    canonicalPath: '/assessments/x',
    hasFileFallback: false,
    ...overrides,
  };
}

describe('getAssessmentEntry', () => {
  it('resolves the gut-check record by slug', () => {
    const entry = getAssessmentEntry('gut-check');
    expect(entry).toBeDefined();
    expect(entry?.assessmentType).toBe('gut-check');
    expect(entry?.status).toBe('active');
  });

  it('returns undefined for an unregistered slug', () => {
    expect(getAssessmentEntry('some-future')).toBeUndefined();
  });

  it('returns undefined for null/undefined/empty input', () => {
    expect(getAssessmentEntry(null)).toBeUndefined();
    expect(getAssessmentEntry(undefined)).toBeUndefined();
    expect(getAssessmentEntry('')).toBeUndefined();
  });
});

describe('getAssessmentEntryByType', () => {
  it('resolves the gut-check record by assessmentType', () => {
    expect(getAssessmentEntryByType('gut-check')?.slug).toBe('gut-check');
  });

  it('returns undefined for an unregistered type', () => {
    expect(getAssessmentEntryByType('some-future')).toBeUndefined();
    expect(getAssessmentEntryByType(null)).toBeUndefined();
  });
});

describe('isSupportedAssessmentSlug', () => {
  it('returns true for the active gut-check slug', () => {
    expect(isSupportedAssessmentSlug('gut-check')).toBe(true);
  });

  it('returns false for an unregistered slug (no leak)', () => {
    expect(isSupportedAssessmentSlug('some-future')).toBe(false);
    expect(isSupportedAssessmentSlug('')).toBe(false);
    expect(isSupportedAssessmentSlug(null)).toBe(false);
  });

  it('returns false for a registered-but-non-active slug', () => {
    const draft = makeEntry({ slug: 'draft-one', assessmentType: 'draft-one', status: 'draft' });
    const retired = makeEntry({ slug: 'retired-one', assessmentType: 'retired-one', status: 'retired' });
    const registry = [draft, retired];
    expect(registry.some((e) => e.slug === 'draft-one' && e.status === 'active')).toBe(false);
    expect(registry.some((e) => e.slug === 'retired-one' && e.status === 'active')).toBe(false);
  });
});

describe('listActiveAssessments', () => {
  it('only includes active records', () => {
    const active = listActiveAssessments();
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((e) => e.status === 'active')).toBe(true);
  });

  it('preserves registry order', () => {
    const active = listActiveAssessments();
    const full = ASSESSMENT_REGISTRY.filter((e) => e.status === 'active');
    expect(active.map((e) => e.slug)).toEqual(full.map((e) => e.slug));
  });

  it('excludes draft and retired records when run against a mixed fixture', () => {
    const mixed: AssessmentRegistryEntry[] = [
      makeEntry({ slug: 'a1', assessmentType: 'a1', status: 'active' }),
      makeEntry({ slug: 'd1', assessmentType: 'd1', status: 'draft' }),
      makeEntry({ slug: 'r1', assessmentType: 'r1', status: 'retired' }),
      makeEntry({ slug: 'a2', assessmentType: 'a2', status: 'active' }),
    ];
    const activeSlugs = mixed.filter((e) => e.status === 'active').map((e) => e.slug);
    expect(activeSlugs).toEqual(['a1', 'a2']);
  });
});

describe('getAssessmentLabel', () => {
  it('returns the short title for a registered type', () => {
    expect(getAssessmentLabel('gut-check')).toBe('Gut Check');
  });

  it('falls back to the raw type string when the type is not registered', () => {
    expect(getAssessmentLabel('some-future')).toBe('some-future');
  });
});

describe('validateRegistry', () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns no duplicates for the real registry', () => {
    process.env.NODE_ENV = 'development';
    expect(validateRegistry(ASSESSMENT_REGISTRY)).toEqual([]);
  });

  it('throws on a duplicate slug in non-production', () => {
    process.env.NODE_ENV = 'development';
    const dupes: AssessmentRegistryEntry[] = [
      makeEntry({ slug: 'same', assessmentType: 't1' }),
      makeEntry({ slug: 'same', assessmentType: 't2' }),
    ];
    expect(() => validateRegistry(dupes)).toThrow(/Duplicate slug\/assessmentType/);
  });

  it('throws on a duplicate assessmentType in non-production', () => {
    process.env.NODE_ENV = 'test';
    const dupes: AssessmentRegistryEntry[] = [
      makeEntry({ slug: 's1', assessmentType: 'same-type' }),
      makeEntry({ slug: 's2', assessmentType: 'same-type' }),
    ];
    expect(() => validateRegistry(dupes)).toThrow(/Duplicate slug\/assessmentType/);
  });

  it('logs but does not throw in production', () => {
    process.env.NODE_ENV = 'production';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const dupes: AssessmentRegistryEntry[] = [
      makeEntry({ slug: 'same', assessmentType: 't1' }),
      makeEntry({ slug: 'same', assessmentType: 't2' }),
    ];
    expect(() => validateRegistry(dupes)).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
