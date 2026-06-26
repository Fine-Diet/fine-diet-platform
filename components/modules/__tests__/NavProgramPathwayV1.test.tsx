/**
 * Unit tests for the nav.program-pathway.v1 module: schema validation, schema-map
 * + descriptor wiring, and resolver-driven rendering across the first / last /
 * single-program / unknown-slug edge cases.
 *
 * The module is resolver-driven from collectionSlug + programSlug — the
 * breadcrumb, step position, and prev/next links all come from the catalogue.
 */
import React from 'react';

// Mock the catalogue with a writable copy of the real implementation so the
// single-program edge case can be exercised via jest.spyOn (no synthetic
// catalogue needed — real data drives the first/last/null cases).
jest.mock('@/lib/programs/programSeriesCatalogue', () => ({
  __esModule: true,
  ...jest.requireActual('@/lib/programs/programSeriesCatalogue'),
}));

import { NavProgramPathwayV1 } from '@/components/modules/NavProgramPathwayV1';
import {
  navProgramPathwayV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import * as catalogue from '@/lib/programs/programSeriesCatalogue';

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

// Sibling JSX expressions (e.g. "Step {n} of {m}") are joined with spaces by the
// walker; the real DOM concatenates them without the extra space, so collapse
// whitespace before substring assertions.
function renderText(node: any): string {
  return collectText(node).replace(/\s+/g, ' ');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const collection = catalogue.getProgramSeriesBySlug('nutrition')!;
const firstSlug = collection.programs[0].slug;
const lastSlug = collection.programs[collection.programs.length - 1].slug;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('nav.program-pathway.v1 schema', () => {
  it('requires both slugs', () => {
    expect(
      navProgramPathwayV1Schema.safeParse({
        collectionSlug: 'nutrition',
        programSlug: 'baseline',
      }).success,
    ).toBe(true);
    expect(
      navProgramPathwayV1Schema.safeParse({ collectionSlug: 'nutrition' }).success,
    ).toBe(false);
    expect(
      navProgramPathwayV1Schema.safeParse({ programSlug: 'baseline' }).success,
    ).toBe(false);
  });

  it('exposes no sequence / link / title fields for authors', () => {
    const parsed = navProgramPathwayV1Schema.parse({
      collectionSlug: 'nutrition',
      programSlug: 'baseline',
    }) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['collectionSlug', 'programSlug']);
  });
});

describe('nav.program-pathway.v1 wiring', () => {
  it('is registered in the schema map and field descriptors', () => {
    expect(MODULE_CONTENT_SCHEMAS['nav.program-pathway.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['nav.program-pathway.v1']).toBeDefined();
  });
});

describe('nav.program-pathway.v1 render — resolver-driven edge cases', () => {
  it('renders breadcrumb + step context from the catalogue', () => {
    const tree = NavProgramPathwayV1({
      content: { collectionSlug: 'nutrition', programSlug: firstSlug },
    });
    const hrefs = collectHrefs(tree);
    const text = renderText(tree);

    expect(hrefs).toContain('/programs');
    expect(hrefs).toContain('/programs/nutrition');
    expect(text).toContain(collection.title);
    expect(text).toContain(`Step 1 of ${collection.programs.length}`);
  });

  it('first program: no previous link, links the next program', () => {
    const tree = NavProgramPathwayV1({
      content: { collectionSlug: 'nutrition', programSlug: firstSlug },
    });
    const hrefs = collectHrefs(tree);
    const text = renderText(tree);
    const next = collection.programs[1];

    expect(text).toContain('This is the first step.');
    expect(hrefs).not.toContain(`/programs/nutrition/${firstSlug}`);
    expect(hrefs).toContain(`/programs/nutrition/${next.slug}`);
    expect(text).toContain(next.title);
  });

  it('last program: no next link, links the previous program', () => {
    const tree = NavProgramPathwayV1({
      content: { collectionSlug: 'nutrition', programSlug: lastSlug },
    });
    const hrefs = collectHrefs(tree);
    const text = renderText(tree);
    const prev = collection.programs[collection.programs.length - 2];

    expect(text).toContain('This is the final listed step.');
    expect(hrefs).not.toContain(`/programs/nutrition/${lastSlug}`);
    expect(hrefs).toContain(`/programs/nutrition/${prev.slug}`);
    expect(text).toContain(prev.title);
    expect(text).toContain(
      `Step ${collection.programs.length} of ${collection.programs.length}`,
    );
  });

  it('single-program collection: both placeholders, Step 1 of 1', () => {
    const single = { ...collection, programs: [collection.programs[0]] };
    jest
      .spyOn(catalogue, 'getProgramSeriesProgramBySlugs')
      .mockReturnValueOnce({
        series: single,
        program: single.programs[0],
        index: 0,
        previousProgram: null,
        nextProgram: null,
      });

    const tree = NavProgramPathwayV1({
      content: { collectionSlug: 'nutrition', programSlug: firstSlug },
    });
    const text = renderText(tree);
    const hrefs = collectHrefs(tree);

    expect(text).toContain('Step 1 of 1');
    expect(text).toContain('This is the first step.');
    expect(text).toContain('This is the final listed step.');
    // No program links when the collection has a single program.
    expect(hrefs).not.toContain(`/programs/nutrition/${single.programs[0].slug}`);
  });

  it('returns null for an unknown collection or program', () => {
    expect(
      NavProgramPathwayV1({
        content: { collectionSlug: 'nope', programSlug: 'baseline' },
      }),
    ).toBeNull();
    expect(
      NavProgramPathwayV1({
        content: { collectionSlug: 'nutrition', programSlug: 'nope' },
      }),
    ).toBeNull();
  });
});
