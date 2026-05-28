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

function collectHrefs(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(collectHrefs);

  const href = typeof node.props?.href === 'string' ? [node.props.href] : [];
  const childHrefs = collectHrefs(node.props?.children);

  return [...href, ...childHrefs];
}

function collectText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object') return collectText(node.props?.children);
  return '';
}

describe('/programs/[series]', () => {
  test('builds static paths for published program series', async () => {
    await expect(getStaticPaths({})).resolves.toEqual({
      paths: [
        { params: { series: 'fine-diet-method' } },
        { params: { series: 'lifestyle' } },
        { params: { series: 'advanced' } },
      ],
      fallback: false,
    });
  });

  test('returns props for a published series', async () => {
    const result = await getStaticProps({
      params: { series: 'fine-diet-method' },
    });

    expect(result).toMatchObject({
      props: {
        series: {
          slug: 'fine-diet-method',
          title: 'The Fine Diet Method',
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
      params: { series: 'fine-diet-method' },
    })) as any;

    const tree = ProgramSeriesPage(result.props);
    const hrefs = collectHrefs(tree);

    expect(hrefs).toContain('/programs/fine-diet-method/baseline');
    expect(hrefs).toContain(
      '/programs/fine-diet-method/digestive-foundations',
    );
  });

  test('uses resolved CTA behavior for listed programs', async () => {
    const result = (await getStaticProps({
      params: { series: 'fine-diet-method' },
    })) as any;

    const tree = ProgramSeriesPage(result.props);
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).toContain(
      '/buy/journal-annual?placement=program-fine-diet-method-baseline&source=program_marketing',
    );
    expect(text).toContain('Get Baseline access');
    expect(text).toContain('Coming soon');
  });

  test('does not require auth for the public series page', async () => {
    const result = await getStaticProps({
      params: { series: 'fine-diet-method' },
    });

    expect(result).not.toHaveProperty('redirect');
    expect(result).toHaveProperty('props');
  });
});
