/**
 * Unit tests for the cta.program-offer.v1 module's `ctaStyle` flag.
 *
 * The default ('full') renders both the primary pill and the secondary link
 * (original behavior). 'primary-only' renders a single primary CTA — used for
 * preview-era CategoryIntro parity. We walk the returned React element tree
 * WITHOUT invoking function components and check for the presence of the
 * PrimaryPillCta / SecondaryCtaLink component references.
 */
import React from 'react';
import { CtaProgramOfferV1 } from '@/components/modules/CtaProgramOfferV1';
import {
  PrimaryPillCta,
  SecondaryCtaLink,
} from '@/components/programs/PrimaryPillCta';
import {
  ctaProgramOfferV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import type { CtaProgramOfferV1Content } from '@/lib/modules/types';

(globalThis as { React?: typeof React }).React = React;

/** Collect the set of function-component `type`s in an element tree (no invocation). */
function collectComponentTypes(node: unknown, out: Set<unknown> = new Set()): Set<unknown> {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectComponentTypes(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const el = node as { type?: unknown; props?: { children?: unknown } };
    if (el.type) out.add(el.type);
    if (el.props) collectComponentTypes(el.props.children, out);
  }
  return out;
}

const BASE: CtaProgramOfferV1Content = {
  collectionSlug: 'nutrition',
  heading: 'Start by building a foundation you can extend',
  body: 'Begin with a shared Baseline, then add focused programs over time.',
  align: 'left',
  surface: 'light',
};

describe('cta.program-offer.v1 schema', () => {
  it('accepts the optional ctaStyle flag', () => {
    expect(
      ctaProgramOfferV1Schema.safeParse({ ...BASE, ctaStyle: 'primary-only' }).success,
    ).toBe(true);
    expect(
      ctaProgramOfferV1Schema.safeParse({ ...BASE, ctaStyle: 'full' }).success,
    ).toBe(true);
  });

  it('rejects an unknown ctaStyle value', () => {
    expect(
      ctaProgramOfferV1Schema.safeParse({ ...BASE, ctaStyle: 'nope' }).success,
    ).toBe(false);
  });

  it('is wired into the schema map and field descriptors', () => {
    expect(MODULE_CONTENT_SCHEMAS['cta.program-offer.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['cta.program-offer.v1']).toBeDefined();
  });
});

describe('cta.program-offer.v1 ctaStyle render behavior', () => {
  it('renders BOTH primary and secondary CTA by default (backwards compatible)', () => {
    const types = collectComponentTypes(CtaProgramOfferV1({ content: BASE }));
    expect(types.has(PrimaryPillCta)).toBe(true);
    expect(types.has(SecondaryCtaLink)).toBe(true);
  });

  it('renders ONLY the primary CTA when ctaStyle is primary-only', () => {
    const types = collectComponentTypes(
      CtaProgramOfferV1({ content: { ...BASE, ctaStyle: 'primary-only' } }),
    );
    expect(types.has(PrimaryPillCta)).toBe(true);
    expect(types.has(SecondaryCtaLink)).toBe(false);
  });

  it("treats explicit ctaStyle 'full' the same as the default", () => {
    const types = collectComponentTypes(
      CtaProgramOfferV1({ content: { ...BASE, ctaStyle: 'full' } }),
    );
    expect(types.has(PrimaryPillCta)).toBe(true);
    expect(types.has(SecondaryCtaLink)).toBe(true);
  });
});
