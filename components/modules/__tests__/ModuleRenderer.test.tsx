/**
 * Unit tests for ModuleRenderer — the composition entrypoint that wraps each
 * module instance in a section shell.
 *
 * Contract under test:
 *   1. Stacked fallback (no chrome) does NOT apply a default rounded top. It
 *      keeps `relative`, the `-mt-8` overlap, and a safe z-index token only.
 *   2. Top/bottom rounding is chrome-controlled: `chrome.roundedTop` resolves to
 *      `rounded-t-[2rem]` via `resolveModuleChromeClasses`, and `roundedBottom`
 *      to `rounded-b-[2rem]` (without implying top rounding).
 *   3. The stacked base layer (index 0) keeps its flush-bottom shell.
 *   4. Flat layout renders modules as plain siblings (no wrapper div).
 *
 * The real MODULE_REGISTRY pulls in ESM-only deps (swiper via FeatureSplitMediaV1
 * → FeatureSection) that Jest cannot parse, so the registry is mocked with tiny
 * inline components. ModuleRenderer is hook-free and is invoked directly; we walk
 * the returned Fragment's direct children (the wrapper shells) without invoking
 * the mocked module components.
 */
import React from 'react';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition, ModuleChrome } from '@/lib/modules/types';

jest.mock('@/lib/modules/registry', () => {
  const PlainSection = ({ content }: { content: unknown }) =>
    React.createElement('section', { 'data-testid': 'mod', content: String(content) });
  return {
    MODULE_REGISTRY: {
      'test.plain.v1': {
        schema: { safeParse: () => ({ success: true }) },
        component: PlainSection,
      },
    },
  };
});

(globalThis as { React?: typeof React }).React = React;

// `ModuleInstance` is a discriminated union over the real ModuleTypeKey set, so a
// synthetic `test.plain.v1` type can't satisfy it literally. Cast through unknown.
type RawModule = { id: string; type: string; content: unknown; chrome?: ModuleChrome };
const comp = (modules: RawModule[]): PageComposition =>
  ({ key: 'test-page', modules }) as unknown as PageComposition;

/** The wrapper shells ModuleRenderer emits are the direct children of its Fragment. */
function wrapperShells(modules: RawModule[], layout?: 'flat' | 'stacked') {
  const root = ModuleRenderer({ composition: comp(modules), layout }) as React.ReactElement;
  const children = (root.props as { children?: unknown }).children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.filter(Boolean) as React.ReactElement[];
}

function className(el: React.ReactElement): string {
  return String((el.props as { className?: unknown }).className ?? '');
}

const PLAIN = (id: string, chrome?: ModuleChrome): RawModule => ({
  id,
  type: 'test.plain.v1',
  content: { n: id },
  chrome,
});

const COMPOSITION: RawModule[] = [PLAIN('m0'), PLAIN('m1'), PLAIN('m2')];

describe('ModuleRenderer — stacked fallback (no chrome)', () => {
  it('does not apply rounded-t-[2rem] to later stacked layers', () => {
    const shells = wrapperShells(COMPOSITION, 'stacked');
    // index 1 and 2 are the stacked fallback layers
    const later = [shells[1], shells[2]].map(className);
    for (const cn of later) {
      expect(cn).not.toContain('rounded-t-[2rem]');
      expect(cn).not.toContain('overflow-hidden');
    }
  });

  it('keeps relative, overlap (-mt-8), and a safe z-index token', () => {
    const shells = wrapperShells(COMPOSITION, 'stacked');
    const cn = className(shells[1]);
    expect(cn).toContain('relative');
    expect(cn).toContain('-mt-8');
    // ascending z-index token from the allowlist (z-10 for layer 1)
    expect(cn).toMatch(/\bz-(?:10|20|30|40|50|\[60\])\b/);
  });

  it('caps the z-index at MAX_STACK_LAYER for high indices', () => {
    const big: RawModule[] = Array.from({ length: 8 }, (_, i) => PLAIN(`m${i}`));
    const shells = wrapperShells(big, 'stacked');
    // index 7 → clamped to MAX_STACK_LAYER (5) → z-[60] is the allowlist max
    const cn = className(shells[7]);
    expect(cn).toMatch(/\bz-(?:10|20|30|40|50|\[60\])\b/);
  });

  it('renders the base layer (index 0) with a flush-bottom shell and no top radius', () => {
    const shells = wrapperShells(COMPOSITION, 'stacked');
    const cn = className(shells[0]);
    expect(cn).toContain('relative');
    expect(cn).toContain('z-0');
    expect(cn).toContain('[&>section]:rounded-b-none');
    expect(cn).not.toContain('rounded-t-[2rem]');
  });
});

describe('ModuleRenderer — chrome-controlled rounding', () => {
  it('applies rounded-t-[2rem] only when chrome.roundedTop === true', () => {
    const withTop: RawModule[] = [PLAIN('m0'), PLAIN('m1', { roundedTop: true })];
    const shells = wrapperShells(withTop, 'stacked');
    const cn = className(shells[1]);
    expect(cn).toContain('rounded-t-[2rem]');
    expect(cn).toContain('overflow-hidden');
    // chrome path still gets a safe z-index token in stacked layout
    expect(cn).toMatch(/\bz-(?:10|20|30|40|50|\[60\])\b/);
  });

  it('applies rounded-b-[2rem] for chrome.roundedBottom without implying top rounding', () => {
    const withBottom: RawModule[] = [PLAIN('m0'), PLAIN('m1', { roundedBottom: true })];
    const shells = wrapperShells(withBottom, 'stacked');
    const cn = className(shells[1]);
    expect(cn).toContain('rounded-b-[2rem]');
    expect(cn).not.toContain('rounded-t-[2rem]');
  });

  it('a chrome-only effect (no rounding) does not add top radius', () => {
    const surfaceOnly: RawModule[] = [PLAIN('m0'), PLAIN('m1', { surface: 'brand-900' })];
    const shells = wrapperShells(surfaceOnly, 'stacked');
    const cn = className(shells[1]);
    expect(cn).toContain('bg-brand-900');
    expect(cn).not.toContain('rounded-t-[2rem]');
    expect(cn).not.toContain('rounded-b-[2rem]');
  });
});

describe('ModuleRenderer — flat layout', () => {
  it('renders modules as plain siblings (Fragment wrappers, no stacked shell)', () => {
    const shells = wrapperShells(COMPOSITION, 'flat');
    for (const el of shells) {
      // flat path wraps each module in a Fragment (React.Fragment), not a div
      expect(el.type).toBe(React.Fragment);
    }
  });

  it('flat default layout also uses Fragment wrappers', () => {
    const shells = wrapperShells(COMPOSITION);
    for (const el of shells) {
      expect(el.type).toBe(React.Fragment);
    }
  });
});

describe('ModuleRenderer — unknown module types', () => {
  it('skips unknown module types gracefully', () => {
    const unknown: RawModule[] = [
      { id: 'm0', type: 'does.not.exist.v1', content: {} },
      PLAIN('m1'),
    ];
    const shells = wrapperShells(unknown, 'stacked');
    // only the known module (m1) is wrapped — unknown is dropped (null filtered)
    expect(shells).toHaveLength(1);
  });
});
