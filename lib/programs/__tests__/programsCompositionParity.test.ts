/**
 * Stage B parity checks for the seeded Programs marketing compositions.
 *
 * These assert that the in-repo JSON compositions:
 *   1. Load + validate through the read-only programsMarketingApi (JSON fallback).
 *   2. Surface offer/entitlement-TRUE CTAs via cta.program-offer.v1 (the CTA is
 *      resolved centrally, never hardcoded into composition content).
 *   3. Preserve the indexable content the existing module registry CAN express
 *      (hero copy, how-it-works steps, the full program link set, app-integration
 *      reasons, FAQ Q&A, final CTA).
 *
 * They also DOCUMENT the known parity gaps the existing registry cannot express
 * (comparison table, icon differentiators, program status badges, breadcrumb +
 * prev/next pathway nav, "step N of M" context). Those are asserted ABSENT so the
 * limitation is tracked: closing a gap should intentionally update this test.
 */

jest.mock('../../supabaseServerClient', () => ({
  supabaseAdmin: {
    from: () => {
      throw new Error('supabase disabled in test');
    },
  },
}));

import React from 'react';
import { getProgramsMarketingComposition } from '../programsMarketingApi';
import { resolveProgramOfferModuleCta } from '../programOfferModuleCta';
import {
  getProgramSeriesBySlug,
} from '../programSeriesCatalogue';
import { resolveProgramCategoryContent } from '../programCategoryContent';
import { GridProgramCardsV1 } from '../../../components/modules/GridProgramCardsV1';
import { NavProgramPathwayV1 } from '../../../components/modules/NavProgramPathwayV1';
import type { PageComposition } from '../../modules/types';

// Classic JSX transform (tsconfig jsx: 'react') needs React on the global so the
// resolver-driven module can be rendered for output-level parity checks.
(globalThis as { React?: typeof React }).React = React;

/** Collect every string value found anywhere in a composition's module content. */
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

function allText(composition: PageComposition): string {
  return collectStrings(composition.modules).join('\n');
}

// The resolver-driven module delegates to function components (GridProgramCardsV1
// → ProgramCardGrid → ProgramCard). These walkers invoke plain function
// components so we can traverse the composed tree without a DOM renderer,
// mirroring the proven pattern in __tests__/pages/programs/seriesPage.test.ts.
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

function collectRenderedText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectRenderedText).join(' ');
  if (typeof node === 'object') {
    if (isFunctionComponent(node.type)) return collectRenderedText(invoke(node));
    return collectRenderedText(node.props?.children);
  }
  return '';
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('programs composition parity — nutrition collection', () => {
  let composition: PageComposition | null;

  beforeAll(async () => {
    composition = await getProgramsMarketingComposition('nutrition', 'published');
  });

  it('loads and validates from the JSON fallback', () => {
    expect(composition).not.toBeNull();
    expect(composition!.key).toBe('composition:programs:nutrition');
    expect(composition!.modules.length).toBeGreaterThan(0);
  });

  it('uses the expected ordered module set from the existing registry', () => {
    expect(composition!.modules.map((m) => m.type)).toEqual([
      'hero.standard.v1',
      'cta.program-offer.v1',
      'process.slide-stack.v1',
      'grid.program-cards.v1',
      'feature.reasons-split.v1',
      'ambient.marquee-strip.v1',
      'feature.icon-tiles.v1',
      'comparison.table.v1',
      'faq.accordion.v2',
      'cta.program-offer.v1',
    ]);
  });

  it('surfaces the offer-true collection CTA via cta.program-offer.v1', () => {
    const ctaModule = composition!.modules.find(
      (m) => m.type === 'cta.program-offer.v1',
    )!;
    const content = ctaModule.content as { collectionSlug: string; programSlug?: string };
    const resolved = resolveProgramOfferModuleCta(content);
    expect(resolved).not.toBeNull();
    // Mirrors the code-catalogue collection CTA exactly (centralized resolver).
    expect(resolved!.cta.kind).toBe('internal_link');
    expect(resolved!.cta.href).toBe('/programs/nutrition/baseline');
    expect(resolved!.cta.label).toBe('Start with Baseline');
  });

  it('preserves the indexable copy the registry can express', () => {
    const text = allText(composition!);
    const content = resolveProgramCategoryContent(getProgramSeriesBySlug('nutrition')!);

    expect(text).toContain(content.heroHeadline);
    expect(text).toContain(content.introHeading);
    expect(text).toContain(content.finalCtaHeadline);

    for (const step of content.process) {
      expect(text).toContain(step.title);
    }
    for (const item of content.faq) {
      expect(text).toContain(item.question);
      expect(text).toContain(item.answer);
    }
    for (const reason of content.appIntegration.reasons) {
      expect(text).toContain(reason.sentence);
    }
  });

  it('renders the program grid from the catalogue, not authored content (resolver-driven)', () => {
    const gridModule = composition!.modules.find(
      (m) => m.type === 'grid.program-cards.v1',
    )!;
    const content = gridModule.content as Record<string, unknown>;

    // The authored content owns ONLY the slug + presentational copy — never the
    // program list, links, status, sequence, or CTA labels.
    expect(Object.keys(content).sort()).toEqual(['collectionSlug', 'heading', 'subhead']);
    expect(content.collectionSlug).toBe('nutrition');

    // Rendered output draws the full sequence (links, titles, length labels, and
    // expandable detail) from the catalogue.
    const tree = GridProgramCardsV1({ content: gridModule.content as never });
    const hrefs = collectHrefs(tree);
    const text = collectRenderedText(tree);
    const collection = getProgramSeriesBySlug('nutrition')!;
    for (const program of collection.programs) {
      expect(hrefs).toContain(`/programs/nutrition/${program.slug}`);
      expect(text).toContain(program.title);
    }
  });

  it('preserves the rich program-card detail (grid.program-cards.v1)', () => {
    const gridModule = composition!.modules.find(
      (m) => m.type === 'grid.program-cards.v1',
    )!;
    const rendered = collectRenderedText(GridProgramCardsV1({ content: gridModule.content as never }));
    const baseline = getProgramSeriesBySlug('nutrition')!.programs.find(
      (p) => p.slug === 'baseline',
    )!;
    // Expandable per-card detail now comes through (was the prior gap).
    expect(rendered).toContain(baseline.whoFor![0]);
    expect(rendered).toContain(baseline.whatYouWillDo![0]);
  });

  it('preserves the comparison table (comparison.table.v1)', () => {
    const text = allText(composition!);
    const content = resolveProgramCategoryContent(getProgramSeriesBySlug('nutrition')!);
    expect(text).toContain(content.comparisonHeading);
    for (const row of content.comparison) {
      expect(text).toContain(row.fineDiet);
      expect(text).toContain(row.typical);
    }
  });

  it('preserves the differentiator tiles (feature.icon-tiles.v1)', () => {
    const text = allText(composition!);
    // Mirrors the live CategoryDifferentiators section (whose copy is hardcoded
    // in the component, not in ProgramCategoryContent).
    expect(text).toContain('What makes Nutrition Foundations different');
    expect(text).toContain('Stabilize first');
    expect(text).toContain('Follow the signal');
    expect(text).toContain('Built into your journal');
  });

});

describe('programs composition parity — baseline program', () => {
  let composition: PageComposition | null;

  beforeAll(async () => {
    composition = await getProgramsMarketingComposition(
      'nutrition--baseline',
      'published',
    );
  });

  it('loads and validates from the JSON fallback', () => {
    expect(composition).not.toBeNull();
    expect(composition!.key).toBe('composition:programs:nutrition--baseline');
  });

  it('surfaces the offer-true program checkout CTA via cta.program-offer.v1', () => {
    const ctaModule = composition!.modules.find(
      (m) =>
        m.type === 'cta.program-offer.v1' &&
        (m.content as { programSlug?: string }).programSlug === 'baseline',
    )!;
    const resolved = resolveProgramOfferModuleCta(
      ctaModule.content as { collectionSlug: string; programSlug?: string },
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.cta.kind).toBe('checkout_link');
    expect(resolved!.cta.offerKey).toBe('journal-annual');
    expect(resolved!.cta.href).toBe(
      '/buy/journal-annual?placement=program-nutrition-baseline&source=program_marketing',
    );
    expect(resolved!.cta.label).toBe('Get Baseline access');
  });

  it('preserves the objective, who-it-is-for, and what-you-will-do copy', () => {
    const text = allText(composition!);
    const collection = getProgramSeriesBySlug('nutrition')!;
    const baseline = collection.programs.find((p) => p.slug === 'baseline')!;

    expect(text).toContain(baseline.title);
    expect(text).toContain(baseline.objective!);
    for (const item of baseline.whoFor ?? []) {
      expect(text).toContain(item);
    }
    for (const item of baseline.whatYouWillDo ?? []) {
      expect(text).toContain(item);
    }
  });

  it('renders resolver-driven breadcrumb + prev/next pathway nav (nav.program-pathway.v1)', () => {
    const navModule = composition!.modules.find(
      (m) => m.type === 'nav.program-pathway.v1',
    )!;
    const content = navModule.content as Record<string, unknown>;

    // Authored content owns ONLY the two slugs — never the sequence or links.
    expect(Object.keys(content).sort()).toEqual(['collectionSlug', 'programSlug']);

    const tree = NavProgramPathwayV1({ content: navModule.content as never });
    const hrefs = collectHrefs(tree);
    // Collapse whitespace: sibling JSX expressions are joined with spaces by the
    // walker, which the real DOM concatenates without the extra space.
    const text = collectRenderedText(tree).replace(/\s+/g, ' ');
    const collection = getProgramSeriesBySlug('nutrition')!;

    // Breadcrumb to Programs + collection.
    expect(hrefs).toContain('/programs');
    expect(hrefs).toContain('/programs/nutrition');

    // Baseline is first, so there is no previous link, but the next program in
    // the catalogue sequence is linked from the slugs alone.
    const baselineIndex = collection.programs.findIndex((p) => p.slug === 'baseline');
    const nextProgram = collection.programs[baselineIndex + 1];
    expect(hrefs).toContain(`/programs/nutrition/${nextProgram.slug}`);
    expect(text).toContain(nextProgram.title);

    // First-step case is handled cleanly.
    expect(text).toContain('This is the first step.');
    expect(text).toContain(`Step ${baselineIndex + 1} of ${collection.programs.length}`);
  });
});
