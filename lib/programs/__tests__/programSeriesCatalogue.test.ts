import { describe, expect, test } from '@jest/globals';
import {
  getProgramBySlugWithinSeries,
  getProgramSeriesProgramBySlugs,
  getProgramSeriesProgramStaticPaths,
  getProgramSeriesByCategory,
  getProgramSeriesBySlug,
  getProgramSeriesStaticPaths,
  getPublishedProgramSeries,
  PROGRAM_SERIES_CATALOGUE,
  resolveProgramMarketingCta,
} from '../programSeriesCatalogue';

describe('program series catalogue', () => {
  test('returns published series in display order', () => {
    expect(getPublishedProgramSeries().map((series) => series.slug)).toEqual([
      'fine-diet-method',
      'lifestyle',
      'advanced',
    ]);
  });

  test('finds a published series by slug', () => {
    const series = getProgramSeriesBySlug('fine-diet-method');

    expect(series?.title).toBe('The Fine Diet Method');
    expect(series?.programSlugs).toContain('baseline');
  });

  test('returns null for unknown series', () => {
    expect(getProgramSeriesBySlug('unknown-series')).toBeNull();
  });

  test('finds a program by slug within a series', () => {
    const series = getProgramSeriesBySlug('fine-diet-method');
    expect(series).not.toBeNull();

    const program = getProgramBySlugWithinSeries(series!, 'baseline');

    expect(program?.title).toBe('Baseline');
    expect(program?.objective).toContain('starting rhythm');
  });

  test('resolves a program with previous and next pathway context', () => {
    const resolution = getProgramSeriesProgramBySlugs(
      'fine-diet-method',
      'digestive-foundations',
    );

    expect(resolution).toMatchObject({
      series: { slug: 'fine-diet-method' },
      program: { slug: 'digestive-foundations' },
      index: 1,
      previousProgram: { slug: 'baseline' },
      nextProgram: { slug: 'protein-sufficiency' },
    });
  });

  test('returns null for unknown program within a known series', () => {
    expect(
      getProgramSeriesProgramBySlugs('fine-diet-method', 'unknown-program'),
    ).toBeNull();
  });

  test('static paths include all published series', () => {
    expect(getProgramSeriesStaticPaths()).toEqual([
      'fine-diet-method',
      'lifestyle',
      'advanced',
    ]);
  });

  test('groups published series by category', () => {
    expect(
      getProgramSeriesByCategory('lifestyle').map((series) => series.slug),
    ).toEqual(['lifestyle']);
  });

  test('all catalogue entries are code-owned for now', () => {
    expect(
      PROGRAM_SERIES_CATALOGUE.every(
        (series) => series.metadata.ownership === 'code_owned',
      ),
    ).toBe(true);
  });

  test('program static paths include published series programs', () => {
    expect(getProgramSeriesProgramStaticPaths()).toContainEqual({
      series: 'fine-diet-method',
      program: 'baseline',
    });
    expect(getProgramSeriesProgramStaticPaths()).toContainEqual({
      series: 'fine-diet-method',
      program: 'inflammation-regulation',
    });
  });

  test('resolves Baseline CTA to the existing checkout offer path', () => {
    const resolution = getProgramSeriesProgramBySlugs(
      'fine-diet-method',
      'baseline',
    );
    expect(resolution).not.toBeNull();

    const cta = resolveProgramMarketingCta(resolution!);

    expect(cta).toMatchObject({
      kind: 'checkout_link',
      label: 'Get Baseline access',
      href: '/buy/journal-annual?placement=program-fine-diet-method-baseline&source=program_marketing',
      offerKey: 'journal-annual',
      disabled: false,
      secondaryHref: '/app/programs',
    });
  });

  test('resolves coming-soon program CTA as disabled', () => {
    const resolution = getProgramSeriesProgramBySlugs(
      'fine-diet-method',
      'digestive-foundations',
    );
    expect(resolution).not.toBeNull();

    const cta = resolveProgramMarketingCta(resolution!);

    expect(cta).toMatchObject({
      kind: 'disabled',
      label: 'Coming soon',
      href: null,
      offerKey: null,
      disabled: true,
      secondaryHref: '/app/programs',
    });
  });
});
