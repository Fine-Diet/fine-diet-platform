/**
 * Unit tests for feature.reasons-split.v1 (the "Built into the Fine Diet App"
 * journal/app-integration module).
 *
 * The renderer mirrors the code-owned CategoryAppIntegration split layout; the
 * jest env is `node` (no DOM) and the component uses matchMedia, so the layout
 * is covered by the integration build. Here we assert the schema/descriptor
 * contract — notably the optional `body` lead paragraph.
 */
import {
  featureReasonsSplitV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';

const BASE = {
  heading: 'Built into the Fine Diet App',
  items: [
    { label: 'Plan', sentence: 'Set a realistic weekly rhythm.' },
    { label: 'Log', sentence: 'Capture meals and timing as you go.' },
  ],
  imageDesktop: 'https://example.com/d.jpg',
  imageMobile: 'https://example.com/m.jpg',
  imageAlt: 'The Fine Diet app on a tablet',
};

describe('feature.reasons-split.v1 schema', () => {
  it('accepts content without a body (back-compatible)', () => {
    expect(featureReasonsSplitV1Schema.safeParse(BASE).success).toBe(true);
  });

  it('accepts an optional body lead paragraph', () => {
    expect(
      featureReasonsSplitV1Schema.safeParse({ ...BASE, body: 'A short lead paragraph.' })
        .success,
    ).toBe(true);
  });

  it('is wired into the schema map', () => {
    expect(MODULE_CONTENT_SCHEMAS['feature.reasons-split.v1']).toBeDefined();
  });

  it('exposes an optional body field in the editor descriptors', () => {
    const descriptors = MODULE_FIELD_DESCRIPTORS['feature.reasons-split.v1'];
    const body = descriptors.find((d) => d.key === 'body');
    expect(body).toBeDefined();
    expect(body!.optional).toBe(true);
  });
});
