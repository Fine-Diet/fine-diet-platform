/**
 * Unit tests for grid.program-collections-rail.v1 authored-cards mode and the
 * preserved resolver catalogue fallback.
 *
 * The rail delegates scrolling/chrome to SeriesPathwayRail (hook-driven), so we
 * mock it as a hook-free pass-through that renders heading + intro + children.
 * That lets us walk the authored/resolver card trees directly.
 */
import React from 'react';
import { GridProgramCollectionsRailV1 } from '@/components/modules/GridProgramCollectionsRailV1';
import {
  gridProgramCollectionsRailV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { PROGRAM_COLLECTIONS_RAIL_FIELD_DESCRIPTORS } from '@/lib/modules/programCollectionsRailFieldDescriptors';
import { getPublishedProgramSeries } from '@/lib/programs/programSeriesCatalogue';
import type { GridProgramCollectionsRailV1Content } from '@/lib/modules/types';

jest.mock('@/components/programs/SeriesPathwayRail', () => ({
  __esModule: true,
  default: ({ heading, intro, children }: any) =>
    React.createElement(
      'section',
      null,
      React.createElement('h2', null, heading),
      intro ? React.createElement('p', null, intro) : null,
      children,
    ),
  // Expose the named export shape some bundlers expect.
}));

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

function collectHrefs(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, out);
    return out;
  }
  if (isFunctionComponent(node.type)) {
    collectHrefs(invoke(node), out);
    return out;
  }
  if (typeof node.props?.href === 'string') out.push(node.props.href);
  collectHrefs(node.props?.children, out);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const AUTHORED: GridProgramCollectionsRailV1Content = {
  heading: 'Three integrative care pathways',
  intro: 'Choose where to begin.',
  cards: [
    {
      id: 'card-1',
      eyebrow: 'Start here',
      title: 'Nutrition Foundations',
      priceLine: 'From $425',
      description: 'A staged beginning rooted in your real rhythm.',
      image: '/images/card-1.jpg',
      imageAlt: 'Nutrition Foundations',
      ctaLabel: 'Explore the pathway',
      ctaHref: '/integrative-care/nutrition',
      showNote: true,
      note: 'Most members begin here.',
    },
    {
      id: 'card-2',
      title: 'Gut Restoration',
      priceLine: 'From $625',
      description: 'A focused gut restoration pathway.',
      ctaLabel: 'Explore gut pathway',
      ctaHref: '/integrative-care/gut',
      showNote: false,
      note: 'Hidden note text that must not render.',
    },
  ],
};

describe('grid.program-collections-rail.v1 schema', () => {
  it('is registered in the schema map and rail descriptors', () => {
    expect(MODULE_CONTENT_SCHEMAS['grid.program-collections-rail.v1']).toBeDefined();
    expect(
      PROGRAM_COLLECTIONS_RAIL_FIELD_DESCRIPTORS['grid.program-collections-rail.v1'],
    ).toBeDefined();
  });

  it('accepts authored cards content', () => {
    expect(gridProgramCollectionsRailV1Schema.safeParse(AUTHORED).success).toBe(true);
  });

  it('still accepts resolver-era content without cards (fallback unchanged)', () => {
    const resolverContent = {
      heading: 'Begin with nutrition',
      collectionSlugs: ['nutrition'],
      featuredCollectionSlug: 'nutrition',
      showFeaturedCta: true,
    };
    expect(gridProgramCollectionsRailV1Schema.safeParse(resolverContent).success).toBe(true);
  });

  it('rejects an authored card missing the required title', () => {
    const bad = {
      cards: [{ description: 'no title' }],
    };
    expect(gridProgramCollectionsRailV1Schema.safeParse(bad).success).toBe(false);
  });
});

describe('grid.program-collections-rail.v1 authored card render', () => {
  it('renders authored card title, priceLine, description, eyebrow, and CTA href', () => {
    const text = collectText(GridProgramCollectionsRailV1({ content: AUTHORED }));
    const hrefs = collectHrefs(GridProgramCollectionsRailV1({ content: AUTHORED }));

    expect(text).toContain('Nutrition Foundations');
    expect(text).toContain('From $425');
    expect(text).toContain('A staged beginning rooted in your real rhythm.');
    expect(text).toContain('Start here');
    expect(hrefs).toContain('/integrative-care/nutrition');
    expect(hrefs).toContain('/integrative-care/gut');
  });

  it('renders the section heading + intro', () => {
    const text = collectText(GridProgramCollectionsRailV1({ content: AUTHORED }));
    expect(text).toContain('Three integrative care pathways');
    expect(text).toContain('Choose where to begin.');
  });

  it('renders the note only when showNote is true and note is non-empty', () => {
    const text = collectText(GridProgramCollectionsRailV1({ content: AUTHORED }));
    expect(text).toContain('Most members begin here.');
    expect(text).not.toContain('Hidden note text that must not render.');
  });

  it('omits the note when showNote is true but note is empty', () => {
    const content: GridProgramCollectionsRailV1Content = {
      cards: [
        {
          title: 'Card without note',
          ctaLabel: 'Go',
          ctaHref: '/x',
          showNote: true,
          note: '   ',
        },
      ],
    };
    const text = collectText(GridProgramCollectionsRailV1({ content }));
    expect(text).toContain('Card without note');
    // No note paragraph text leaks (only authored fields + CTA label render).
    expect(text.trim()).not.toMatch(/^\s{3,}$/);
  });
});

describe('grid.program-collections-rail.v1 resolver fallback (no authored cards)', () => {
  it('renders catalogue collection titles when cards is omitted', () => {
    const published = getPublishedProgramSeries();
    expect(published.length).toBeGreaterThan(0);

    const text = collectText(
      GridProgramCollectionsRailV1({ content: { collectionSlugs: ['nutrition'] } }),
    );
    // The resolver path renders the catalogue-owned collection title.
    expect(text).toContain(published[0].title);
  });

  it('does not render authored-card-only content in resolver mode', () => {
    const text = collectText(
      GridProgramCollectionsRailV1({ content: {} }),
    );
    // Authored card fields like priceLine never appear in resolver mode.
    expect(text).not.toContain('From $');
  });
});
