import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';

jest.mock('@/lib/programs/programSeriesDeliveryServerService', () => {
  const catalogue = jest.requireActual<
    typeof import('@/lib/programs/programSeriesCatalogue')
  >('@/lib/programs/programSeriesCatalogue');
  return {
    getPublishedProgramSeriesForPublic: async () =>
      catalogue.getPublishedProgramSeries(),
  };
});

import ProgramsIndexPage, { getStaticProps } from '@/pages/programs';

(globalThis as any).React = React;

// The page composes function components (SeriesPathwayRail, ProgramSequenceMatrix,
// the shared category sections). These walkers invoke plain function components
// so we can traverse the fully composed tree without a DOM renderer.
function isFunctionComponent(type: any): boolean {
  return typeof type === 'function' && !type.prototype?.isReactComponent;
}

// Invoke a plain function component, falling back to its children if the
// component relies on React hooks/context (e.g. the auto-scroll rail).
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

describe('/programs', () => {
  test('returns published series as props without auth', async () => {
    const result = (await getStaticProps({} as any)) as any;

    expect(result).not.toHaveProperty('redirect');
    expect(result.props.programSeries.map((s: any) => s.slug)).toEqual([
      'nutrition',
      'lifestyle',
      'advanced',
    ]);
  });

  test('links each published series to its public category route', async () => {
    const result = (await getStaticProps({} as any)) as any;

    const tree = ProgramsIndexPage(result.props);
    const hrefs = collectHrefs(tree);

    expect(hrefs).toContain('/programs/nutrition');
    expect(hrefs).toContain('/programs/lifestyle');
    expect(hrefs).toContain('/programs/advanced');
  });

  test('leads with Baseline as the entry point', async () => {
    const result = (await getStaticProps({} as any)) as any;

    const tree = ProgramsIndexPage(result.props);
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).toContain('/programs/nutrition/baseline');
    expect(text).toContain('Nutrition Foundations');
  });
});
