import { describe, expect, test } from '@jest/globals';
import React from 'react';
import { getProgramSeriesBySlug } from '@/lib/programs/programSeriesCatalogue';
import ProgramCardGrid from '@/components/programs/ProgramCardGrid';

(globalThis as any).React = React;

function isFunctionComponent(type: any): boolean {
  return typeof type === 'function' && !type.prototype?.isReactComponent;
}

function collectHrefs(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(collectHrefs);
  if (isFunctionComponent(node.type)) return collectHrefs(node.type(node.props ?? {}));
  const href = typeof node.props?.href === 'string' ? [node.props.href] : [];
  return [...href, ...collectHrefs(node.props?.children)];
}

function collectText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object') {
    if (isFunctionComponent(node.type)) return collectText(node.type(node.props ?? {}));
    return collectText(node.props?.children);
  }
  return '';
}

describe('ProgramCardGrid', () => {
  const series = getProgramSeriesBySlug('nutrition')!;

  test('nutrition series resolves with Baseline first', () => {
    expect(series).not.toBeNull();
    expect(series.programs[0].slug).toBe('baseline');
    expect(series.programs[0].title).toBe('Baseline');
  });

  test('renders the input-defined sequence as program detail links', () => {
    const tree = ProgramCardGrid({ series });
    const hrefs = collectHrefs(tree);

    expect(hrefs).toContain('/programs/nutrition/baseline');
    expect(hrefs).toContain('/programs/nutrition/digestive-foundations');
    expect(hrefs).toContain('/programs/nutrition/sugar-stability');
    expect(hrefs).toContain('/programs/nutrition/dairy-response');
  });

  test('uses target launch display names', () => {
    const tree = ProgramCardGrid({ series });
    const text = collectText(tree);

    for (const name of [
      'Baseline',
      'Digestive Reset',
      'Protein Optimization',
      'Sugar Stability',
      'Inflammation Control',
      'Gluten Response',
      'Dairy Response',
    ]) {
      expect(text).toContain(name);
    }
  });

  test('centralizes CTA behavior (Baseline checkout, others coming soon)', () => {
    const tree = ProgramCardGrid({ series });
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);

    expect(hrefs).toContain(
      '/buy/journal-annual?placement=program-nutrition-baseline&source=program_marketing',
    );
    expect(text).toContain('Get Baseline access');
    expect(text).toContain('Coming soon');
  });

  test('respects an explicit programs input override', () => {
    const tree = ProgramCardGrid({
      series,
      programs: series.programs.slice(0, 1),
    });
    const hrefs = collectHrefs(tree);

    expect(hrefs).toContain('/programs/nutrition/baseline');
    expect(hrefs).not.toContain('/programs/nutrition/dairy-response');
  });
});
