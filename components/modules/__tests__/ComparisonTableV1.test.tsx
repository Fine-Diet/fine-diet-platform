/**
 * Unit tests for the comparison.table.v1 module: schema validation, registry +
 * field-descriptor wiring, and rendered text output.
 *
 * The component is hook-free, so it can be invoked directly and walked for text
 * without a DOM renderer.
 */
import React from 'react';
import { ComparisonTableV1 } from '@/components/modules/ComparisonTableV1';
import {
  comparisonTableV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import type { ComparisonTableV1Content } from '@/lib/modules/types';

// The module components use the classic JSX transform (tsconfig jsx: 'react');
// make React available globally for direct invocation, mirroring the page tests.
(globalThis as { React?: typeof React }).React = React;

const VALID: ComparisonTableV1Content = {
  heading: 'Built differently than most programs',
  columns: { left: 'Fine Diet Programs', right: 'Most Programs' },
  rows: [
    { left: 'Staged programs you add as they fit', right: 'One plan, all-or-nothing' },
    { label: 'Pace', left: 'Self-led, on your schedule', right: 'Tied to coaching cadence' },
  ],
};

/** Collect every className string anywhere in the rendered tree. */
function collectClassNames(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectClassNames(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === 'function') {
      collectClassNames((el.type as (p: unknown) => unknown)(el.props ?? {}), out);
      return out;
    }
    if (el.props) {
      if (typeof el.props.className === 'string') out.push(el.props.className);
      collectClassNames(el.props.children, out);
    }
  }
  return out;
}

function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (typeof node === 'object') {
    const el = node as { type?: unknown; props?: { children?: unknown } };
    if (typeof el.type === 'function') {
      collectText((el.type as (p: unknown) => unknown)(el.props ?? {}), out);
    } else if (el.props) {
      collectText(el.props.children, out);
    }
  }
  return out;
}

describe('comparison.table.v1 schema', () => {
  it('accepts valid content', () => {
    expect(comparisonTableV1Schema.safeParse(VALID).success).toBe(true);
  });

  it('rejects content missing column labels', () => {
    const bad = { heading: 'x', rows: [{ left: 'a', right: 'b' }] };
    expect(comparisonTableV1Schema.safeParse(bad).success).toBe(false);
  });

  it('rejects rows missing a side', () => {
    const bad = {
      heading: 'x',
      columns: { left: 'L', right: 'R' },
      rows: [{ left: 'only-left' }],
    };
    expect(comparisonTableV1Schema.safeParse(bad).success).toBe(false);
  });
});

describe('comparison.table.v1 wiring', () => {
  it('is registered in the schema map and field descriptors', () => {
    // The MODULE_REGISTRY component entry is enforced at compile time by its
    // Record<ModuleTypeKey, …> type; asserting it here would pull the full
    // registry (and ESM-only deps like Swiper) into the test graph.
    expect(MODULE_CONTENT_SCHEMAS['comparison.table.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['comparison.table.v1']).toBeDefined();
  });
});

describe('comparison.table.v1 render', () => {
  it('renders heading, column labels, row values, and optional caption', () => {
    const text = collectText(ComparisonTableV1({ content: VALID })).join('\n');
    expect(text).toContain('Built differently than most programs');
    expect(text).toContain('Fine Diet Programs');
    expect(text).toContain('Most Programs');
    expect(text).toContain('Staged programs you add as they fit');
    expect(text).toContain('Tied to coaching cadence');
    expect(text).toContain('Pace');
  });

  it('renders nothing when there are no rows', () => {
    const empty = ComparisonTableV1({
      content: { ...VALID, rows: [] },
    });
    expect(empty).toBeNull();
  });

  it('renders row values in dark brand-900 (both columns), not muted/low-opacity', () => {
    const classNames = collectClassNames(ComparisonTableV1({ content: VALID }));
    // The row-values grid wrapper must use solid brand-900 text.
    const rowValueGrid = classNames.find(
      (c) => c.includes('grid-cols-2') && c.includes('font-light') && c.includes('text-brand-900'),
    );
    expect(rowValueGrid).toBeDefined();
    // It must NOT use the old muted token.
    expect(rowValueGrid).not.toContain('text-brand-900/72');
    expect(classNames.join(' ')).not.toContain('text-brand-900/72');
  });
});
