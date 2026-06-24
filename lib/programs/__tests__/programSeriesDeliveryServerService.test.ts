import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockFrom!: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return {
    supabaseAdmin: {
      from: mockFrom,
    },
  };
});

import {
  getProgramSeriesBySlugForPublic,
  getProgramSeriesProgramBySlugsForPublic,
  getProgramSeriesProgramStaticPathsForPublic,
  getProgramSeriesStaticPathsForPublic,
  getPublishedProgramSeriesWithFallback,
  mapDbSeriesToDefinition,
} from '../programSeriesDeliveryServerService';
import type {
  ProgramSeriesItemRow,
  ProgramSeriesRow,
} from '../programSeriesAdminServerService';

function query(result: { data?: unknown; error?: unknown }) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.then = jest.fn(
    (
      resolve: (value: unknown) => unknown,
      reject: ((reason: unknown) => unknown) | null | undefined,
    ) =>
      Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      }).then(resolve, reject),
  );
  return q;
}

function seriesRow(
  overrides: Partial<ProgramSeriesRow> = {},
): ProgramSeriesRow {
  return {
    id: 'series-1',
    slug: 'db-method',
    title: 'DB Method',
    subtitle: 'Admin-authored series',
    description: 'Published from DB.',
    category: 'dietary',
    hero_image_url: null,
    status: 'published',
    display_order: 1,
    primary_cta_label: 'Start DB Method',
    primary_cta_href: '/programs/db-method/baseline',
    secondary_cta_label: 'Manage programs',
    secondary_cta_href: '/app/programs',
    metadata: {
      whoFor: ['People testing DB series.'],
      whatYouWillDo: ['Review an admin-authored sequence.'],
    },
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
    ...overrides,
  };
}

function itemRow(
  overrides: Partial<ProgramSeriesItemRow> = {},
): ProgramSeriesItemRow {
  return {
    id: 'item-1',
    series_id: 'series-1',
    program_slug: 'baseline',
    title_override: 'DB Baseline',
    description_override: 'DB Baseline description.',
    display_order: 0,
    status: 'published',
    metadata: {},
    created_at: '2026-05-27T00:00:00.000Z',
    updated_at: '2026-05-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('program series DB mapper', () => {
  test('maps published DB series and enriches known program slugs', () => {
    const mapped = mapDbSeriesToDefinition({
      series: seriesRow(),
      items: [itemRow()],
    });

    expect(mapped).toMatchObject({
      slug: 'db-method',
      title: 'DB Method',
      subtitle: 'Admin-authored series',
      category: 'dietary',
      cta: {
        label: 'Start DB Method',
        href: '/programs/db-method/baseline',
      },
      metadata: {
        ownership: 'admin_managed',
      },
    });
    expect(mapped.programs[0]).toMatchObject({
      slug: 'baseline',
      title: 'DB Baseline',
      status: 'available',
      description: 'DB Baseline description.',
    });
    expect(mapped.programs[0].cta?.offerKey).toBe('journal-annual');
  });
});

describe('program series public fallback', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  test('falls back to code-owned catalogue when DB has no published series', async () => {
    mockFrom.mockImplementation(() => query({ data: [] }));

    const result = await getPublishedProgramSeriesWithFallback();

    expect(result.source).toBe('code');
    expect(result.series.map((series) => series.slug)).toEqual([
      'nutrition',
      'lifestyle',
      'advanced',
    ]);
  });

  test('falls back to code-owned catalogue when DB table is absent', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFrom.mockImplementation(() =>
      query({ error: { message: 'relation "program_series" does not exist' } }),
    );

    const result = await getPublishedProgramSeriesWithFallback();

    expect(result.source).toBe('code');
    expect(result.series[0].slug).toBe('nutrition');
    expect(warnSpy).toHaveBeenCalledWith(
      '[program-series] published series error:',
      'relation "program_series" does not exist',
    );
    warnSpy.mockRestore();
  });

  test('prefers published DB series when present', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_series') return query({ data: [seriesRow()] });
      if (table === 'program_series_items') return query({ data: [itemRow()] });
      return query({ data: [] });
    });

    const result = await getPublishedProgramSeriesWithFallback();

    expect(result.source).toBe('admin');
    expect(result.series.map((series) => series.slug)).toEqual(['db-method']);
  });

  test('resolves DB series and unknown program as not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_series') return query({ data: [seriesRow()] });
      if (table === 'program_series_items') return query({ data: [itemRow()] });
      return query({ data: [] });
    });

    await expect(getProgramSeriesBySlugForPublic('db-method')).resolves.toMatchObject({
      slug: 'db-method',
    });
    await expect(
      getProgramSeriesProgramBySlugsForPublic('db-method', 'missing'),
    ).resolves.toBeNull();
  });

  test('generates public paths from DB when DB series are published', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'program_series') return query({ data: [seriesRow()] });
      if (table === 'program_series_items') return query({ data: [itemRow()] });
      return query({ data: [] });
    });

    await expect(getProgramSeriesStaticPathsForPublic()).resolves.toEqual([
      'db-method',
    ]);
    await expect(getProgramSeriesProgramStaticPathsForPublic()).resolves.toEqual([
      { series: 'db-method', program: 'baseline' },
    ]);
  });
});
