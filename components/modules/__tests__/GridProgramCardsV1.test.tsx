/**
 * Unit tests for the grid.program-cards.v1 module: schema validation, schema-map
 * + descriptor wiring, and resolver-driven rendering.
 *
 * The defining property of this module is that authored content owns ONLY the
 * collection slug + presentational copy — the program list, sequence, links, and
 * card detail all come from the code catalogue. These tests verify that a slug
 * alone produces the full catalogue-owned grid.
 */
import React from 'react';
import { GridProgramCardsV1 } from '@/components/modules/GridProgramCardsV1';
import {
  gridProgramCardsV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import { getProgramSeriesBySlug } from '@/lib/programs/programSeriesCatalogue';
import type { GridProgramCardsV1Content } from '@/lib/modules/types';

// Classic JSX transform (tsconfig jsx: 'react') needs React on the global.
(globalThis as { React?: typeof React }).React = React;

/* eslint-disable @typescript-eslint/no-explicit-any */
function isFunctionComponent(type: any): boolean {
  return typeof type === 'function' && !type.prototype?.isReactComponent;
}

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
  if (isFunctionComponent(node.type)) return collectHrefs(invoke(node));
  const href = typeof node.props?.href === 'string' ? [node.props.href] : [];
  return [...href, ...collectHrefs(node.props?.children)];
}

function collectText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object') {
    if (isFunctionComponent(node.type)) return collectText(invoke(node));
    return collectText(node.props?.children);
  }
  return '';
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const VALID: GridProgramCardsV1Content = {
  collectionSlug: 'nutrition',
  heading: 'The Nutrition Foundations sequence',
  subhead: 'Delivery happens in the signed-in app.',
};

describe('grid.program-cards.v1 schema', () => {
  it('accepts content with only a collection slug', () => {
    expect(
      gridProgramCardsV1Schema.safeParse({ collectionSlug: 'nutrition' }).success,
    ).toBe(true);
  });

  it('accepts optional heading + subhead', () => {
    expect(gridProgramCardsV1Schema.safeParse(VALID).success).toBe(true);
  });

  it('rejects content missing the collection slug', () => {
    expect(
      gridProgramCardsV1Schema.safeParse({ heading: 'x' }).success,
    ).toBe(false);
  });

  it('does not define any program-list / link / status fields', () => {
    // Resolver-driven boundary: there is nowhere for authors to inject the list.
    const parsed = gridProgramCardsV1Schema.parse(VALID) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      'collectionSlug',
      'heading',
      'subhead',
    ]);
  });
});

describe('grid.program-cards.v1 wiring', () => {
  it('is registered in the schema map and field descriptors', () => {
    expect(MODULE_CONTENT_SCHEMAS['grid.program-cards.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['grid.program-cards.v1']).toBeDefined();
  });
});

describe('grid.program-cards.v1 render (resolver-driven)', () => {
  it('renders the full catalogue program sequence (links + titles) from the slug', () => {
    const tree = GridProgramCardsV1({ content: VALID });
    const hrefs = collectHrefs(tree);
    const text = collectText(tree);
    const collection = getProgramSeriesBySlug('nutrition')!;

    expect(collection.programs.length).toBeGreaterThan(1);
    for (const program of collection.programs) {
      expect(hrefs).toContain(`/programs/nutrition/${program.slug}`);
      expect(text).toContain(program.title);
    }
  });

  it('renders the authored heading + subhead', () => {
    const text = collectText(GridProgramCardsV1({ content: VALID }));
    expect(text).toContain('The Nutrition Foundations sequence');
    expect(text).toContain('Delivery happens in the signed-in app.');
  });

  it('returns null for an unknown collection slug', () => {
    expect(
      GridProgramCardsV1({ content: { collectionSlug: 'does-not-exist' } }),
    ).toBeNull();
  });
});
