/**
 * Unit tests for the process.timed-steps.v1 module.
 *
 * This module renders the table-style "how it works" process section by wrapping
 * the code-owned `TimedProcessSteps` visual — distinct from the image-driven
 * `process.slide-stack.v1` slideshow. We assert schema/registry wiring and that
 * the renderer delegates to `TimedProcessSteps` (walking the returned element
 * tree WITHOUT invoking the function component).
 */
import React from 'react';
import { ProcessTimedStepsV1 } from '@/components/modules/ProcessTimedStepsV1';
import TimedProcessSteps from '@/components/programs/TimedProcessSteps';
import {
  processTimedStepsV1Schema,
  MODULE_CONTENT_SCHEMAS,
} from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';
import type { ProcessTimedStepsV1Content } from '@/lib/modules/types';

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

const BASE: ProcessTimedStepsV1Content = {
  heading: 'How this program works',
  steps: [
    {
      stepNumber: 1,
      label: 'Days 1–21',
      title: 'Establish your Baseline',
      description: 'Follow a practical 21-day rhythm and observe patterns first.',
    },
    {
      stepNumber: 2,
      title: 'Read your signals',
      description: 'Use what Baseline revealed to choose a focused next program.',
    },
  ],
};

describe('process.timed-steps.v1 schema', () => {
  it('accepts a well-formed timed-steps content object', () => {
    expect(processTimedStepsV1Schema.safeParse(BASE).success).toBe(true);
  });

  it('treats the per-step label as optional', () => {
    const noLabel = {
      heading: 'x',
      steps: [{ stepNumber: 1, title: 't', description: 'd' }],
    };
    expect(processTimedStepsV1Schema.safeParse(noLabel).success).toBe(true);
  });

  it('rejects a step missing its title', () => {
    const bad = { heading: 'x', steps: [{ stepNumber: 1, description: 'd' }] };
    expect(processTimedStepsV1Schema.safeParse(bad).success).toBe(false);
  });

  it('is wired into the schema map and field descriptors', () => {
    // The MODULE_REGISTRY component entry is enforced at compile time by its
    // Record<ModuleTypeKey, ...> type (importing it here would pull in swiper,
    // which Jest cannot parse), so we assert the schema map + descriptors.
    expect(MODULE_CONTENT_SCHEMAS['process.timed-steps.v1']).toBeDefined();
    expect(MODULE_FIELD_DESCRIPTORS['process.timed-steps.v1']).toBeDefined();
  });
});

describe('process.timed-steps.v1 render behavior', () => {
  it('delegates to the table-style TimedProcessSteps visual', () => {
    const types = collectComponentTypes(ProcessTimedStepsV1({ content: BASE }));
    expect(types.has(TimedProcessSteps)).toBe(true);
  });

  it('renders nothing when there are no steps', () => {
    const out = ProcessTimedStepsV1({ content: { heading: 'x', steps: [] } });
    expect(out).toBeNull();
  });
});
