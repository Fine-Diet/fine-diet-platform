/**
 * Unit tests for the feature.icon-tiles.v1 module: schema validation (incl. the
 * allowlisted icon enum), schema-map + descriptor wiring, and rendered output.
 *
 * The component is hook-free, so it can be invoked directly and walked for text.
 */
import React from 'react';
import { FeatureIconTilesV1 } from '@/components/modules/FeatureIconTilesV1';
import {
  featureIconTilesV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import type { FeatureIconTilesV1Content } from '@/lib/modules/types';

// Classic JSX transform (tsconfig jsx: 'react') needs React on the global.
(globalThis as { React?: typeof React }).React = React;

const VALID: FeatureIconTilesV1Content = {
  heading: 'What makes this different',
  intro: 'A short supporting paragraph.',
  surface: 'dark',
  tiles: [
    { icon: 'programs', title: 'Stabilize first', description: 'Build rhythm first.' },
    { icon: 'notebook', title: 'Follow the signal', description: 'Use check-ins.' },
    { title: 'No glyph tile', description: 'Renders without an icon.' },
  ],
};

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

describe('feature.icon-tiles.v1 schema', () => {
  it('accepts valid content', () => {
    expect(featureIconTilesV1Schema.safeParse(VALID).success).toBe(true);
  });

  it('rejects an icon outside the allowlist', () => {
    const bad = {
      heading: 'x',
      tiles: [{ icon: 'rocket', title: 't', description: 'd' }],
    };
    expect(featureIconTilesV1Schema.safeParse(bad).success).toBe(false);
  });

  it('allows tiles with no icon', () => {
    const ok = {
      heading: 'x',
      tiles: [{ title: 't', description: 'd' }],
    };
    expect(featureIconTilesV1Schema.safeParse(ok).success).toBe(true);
  });
});

describe('feature.icon-tiles.v1 wiring', () => {
  it('is registered in the schema map and field descriptors', () => {
    expect(MODULE_CONTENT_SCHEMAS['feature.icon-tiles.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['feature.icon-tiles.v1']).toBeDefined();
  });
});

describe('feature.icon-tiles.v1 render', () => {
  it('renders heading, intro, and every tile title + description', () => {
    const text = collectText(FeatureIconTilesV1({ content: VALID })).join('\n');
    expect(text).toContain('What makes this different');
    expect(text).toContain('A short supporting paragraph.');
    expect(text).toContain('Stabilize first');
    expect(text).toContain('Use check-ins.');
    expect(text).toContain('No glyph tile');
  });

  it('renders nothing when there are no tiles', () => {
    expect(
      FeatureIconTilesV1({ content: { heading: 'x', tiles: [] } }),
    ).toBeNull();
  });
});
