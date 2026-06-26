import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';

jest.mock('@/lib/programs/programSeriesDeliveryServerService', () => {
  const catalogue = jest.requireActual<typeof import('@/lib/programs/programSeriesCatalogue')>(
    '@/lib/programs/programSeriesCatalogue',
  );
  return {
    getProgramSeriesProgramStaticPathsForPublic:
      catalogue.getProgramSeriesProgramStaticPaths,
    getProgramSeriesProgramBySlugsForPublic:
      catalogue.getProgramSeriesProgramBySlugs,
  };
});

// Stub the composition renderer so this suite does not pull the full module
// registry (and its ESM-only deps like Swiper) into the import graph. These
// tests exercise the code-catalogue fallback path, where composition is null
// and ModuleRenderer is never rendered.
jest.mock('@/components/modules/ModuleRenderer', () => ({
  ModuleRenderer: () => null,
}));

import ProgramMarketingPage, {
  getStaticPaths,
  getStaticProps,
} from '@/pages/programs/[series]/[program]';

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

describe('/programs/[series]/[program]', () => {
  test('builds static paths for published series programs', async () => {
    const result = await getStaticPaths({});

    expect(result).toMatchObject({
      fallback: false,
    });
    expect((result as any).paths).toContainEqual({
      params: { series: 'nutrition', program: 'baseline' },
    });
    expect((result as any).paths).toContainEqual({
      params: {
        series: 'nutrition',
        program: 'inflammation-regulation',
      },
    });
  });

  test('returns props for a known public program page', async () => {
    const result = await getStaticProps({
      params: { series: 'nutrition', program: 'baseline' },
    });

    expect(result).toMatchObject({
      props: {
        resolution: {
          series: {
            slug: 'nutrition',
            title: 'Nutrition Foundations',
          },
          program: {
            slug: 'baseline',
            title: 'Baseline',
          },
          index: 0,
          previousProgram: null,
          nextProgram: {
            slug: 'digestive-foundations',
          },
        },
      },
    });
  });

  test('returns notFound for an unknown program', async () => {
    await expect(
      getStaticProps({
        params: { series: 'nutrition', program: 'unknown-program' },
      }),
    ).resolves.toEqual({ notFound: true });
  });

  test('does not require auth for the public program page', async () => {
    const result = await getStaticProps({
      params: { series: 'nutrition', program: 'baseline' },
    });

    expect(result).not.toHaveProperty('redirect');
    expect(result).toHaveProperty('props');
  });

  test('uses resolved Baseline CTA on the individual program page', async () => {
    const result = (await getStaticProps({
      params: { series: 'nutrition', program: 'baseline' },
    })) as any;

    const tree = ProgramMarketingPage(result.props);
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).toContain(
      '/buy/journal-annual?placement=program-nutrition-baseline&source=program_marketing',
    );
    expect(text).toContain('Get Baseline access');
    expect(hrefs).toContain('/app/programs');
  });

  test('uses disabled coming-soon CTA on future program pages', async () => {
    const result = (await getStaticProps({
      params: {
        series: 'nutrition',
        program: 'digestive-foundations',
      },
    })) as any;

    const tree = ProgramMarketingPage(result.props);
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).not.toContain(
      '/buy/journal-annual?placement=program-nutrition-digestive-foundations&source=program_marketing',
    );
    expect(text).toContain('Coming soon');
    expect(hrefs).toContain('/app/programs');
  });
});
