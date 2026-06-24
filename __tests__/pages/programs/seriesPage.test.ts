import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';

jest.mock('@/lib/programs/programSeriesDeliveryServerService', () => {
  const catalogue = jest.requireActual<typeof import('@/lib/programs/programSeriesCatalogue')>(
    '@/lib/programs/programSeriesCatalogue',
  );
  return {
    getProgramSeriesStaticPathsForPublic:
      catalogue.getProgramSeriesStaticPaths,
    getProgramSeriesBySlugForPublic: catalogue.getProgramSeriesBySlug,
  };
});

import ProgramSeriesPage, { getStaticPaths, getStaticProps } from '@/pages/programs/[series]';

(globalThis as any).React = React;

// The page delegates rendering to function components (ProgramCategoryView →
// ProgramCardGrid → ProgramCard). These walkers invoke plain function
// components so we can traverse the fully composed tree without a DOM renderer.
function isFunctionComponent(type: any): boolean {
  return typeof type === 'function' && !type.prototype?.isReactComponent;
}

// Invoke a plain function component, falling back to its children if the
// component relies on React hooks/context (e.g. next/head's <Head>).
function invoke(node: any): any {
  try {
    return node.type(node.props ?? {});
  } catch {
    return node.props?.children ?? null;
  }
}

function collectHrefs(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(collectHrefs);

  if (isFunctionComponent(node.type)) {
    return collectHrefs(invoke(node));
  }

  const href = typeof node.props?.href === 'string' ? [node.props.href] : [];
  const childHrefs = collectHrefs(node.props?.children);

  return [...href, ...childHrefs];
}

function collectText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object') {
    if (isFunctionComponent(node.type)) {
      return collectText(invoke(node));
    }
    return collectText(node.props?.children);
  }
  return '';
}

describe('/programs/[series]', () => {
  test('builds static paths for published program series', async () => {
    await expect(getStaticPaths({})).resolves.toEqual({
      paths: [
        { params: { series: 'nutrition' } },
        { params: { series: 'lifestyle' } },
        { params: { series: 'advanced' } },
      ],
      fallback: false,
    });
  });

  test('returns props for a published series', async () => {
    const result = await getStaticProps({
      params: { series: 'nutrition' },
    });

    expect(result).toMatchObject({
      props: {
        series: {
          slug: 'nutrition',
          title: 'Nutrition Foundations',
        },
      },
    });
  });

  test('returns notFound for unknown series', async () => {
    await expect(
      getStaticProps({ params: { series: 'unknown-series' } }),
    ).resolves.toEqual({ notFound: true });
  });

  test('links listed programs to individual public program pages', async () => {
    const result = (await getStaticProps({
      params: { series: 'nutrition' },
    })) as any;

    const tree = ProgramSeriesPage(result.props);
    const hrefs = collectHrefs(tree);

    expect(hrefs).toContain('/programs/nutrition/baseline');
    expect(hrefs).toContain(
      '/programs/nutrition/digestive-foundations',
    );
  });

  test('uses resolved CTA behavior for listed programs', async () => {
    const result = (await getStaticProps({
      params: { series: 'nutrition' },
    })) as any;

    const tree = ProgramSeriesPage(result.props);
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).toContain(
      '/buy/journal-annual?placement=program-nutrition-baseline&source=program_marketing',
    );
    expect(text).toContain('Get Baseline access');
    expect(text).toContain('Coming soon');
  });

  test('does not require auth for the public series page', async () => {
    const result = await getStaticProps({
      params: { series: 'nutrition' },
    });

    expect(result).not.toHaveProperty('redirect');
    expect(result).toHaveProperty('props');
  });
});
