/**
 * Tests for code-backed reusable starting templates (PR-B).
 *
 * The key guarantee: every registered template is VALID by default under the
 * PR-A shared inspector, so applying a template never introduces validation
 * errors or drops modules on save/reload.
 */

import {
  PROGRAMS_COMPOSITION_TEMPLATES,
  listProgramsTemplateOptions,
  getProgramsCompositionTemplate,
  instantiateTemplateModules,
} from '../compositionTemplates';
import { inspectModules } from '../compositionValidation';
import { MODULE_CONTENT_SCHEMAS } from '../schema';
import type { ModuleTypeKey } from '../types';

/** Confirmed /programs/nutrition module order (source: programs--nutrition.json). */
const NUTRITION_REFERENCE_ORDER = [
  'hero',
  'collection-cta',
  'how-it-works',
  'program-sequence',
  'app-integration',
  'marquee',
  'differentiators',
  'comparison',
  'faq',
  'final-cta',
] as const;

describe('PROGRAMS_COMPOSITION_TEMPLATES', () => {
  it('exposes at least one template with unique ids', () => {
    expect(PROGRAMS_COMPOSITION_TEMPLATES.length).toBeGreaterThan(0);
    const ids = PROGRAMS_COMPOSITION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template module uses a registered module type', () => {
    for (const template of PROGRAMS_COMPOSITION_TEMPLATES) {
      for (const mod of template.modules) {
        expect(MODULE_CONTENT_SCHEMAS[mod.type as ModuleTypeKey]).toBeDefined();
      }
    }
  });

  it('every template is fully valid under the PR-A inspector (no invalid modules)', () => {
    for (const template of PROGRAMS_COMPOSITION_TEMPLATES) {
      const validity = inspectModules(
        template.modules.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content as Record<string, unknown>,
        })),
      );
      const invalid = validity.filter((v) => !v.valid);
      // Surface details if this ever regresses.
      expect(
        invalid.map((v) => ({ id: v.id, type: v.type, issues: v.issues })),
      ).toEqual([]);
    }
  });
});

describe('Nutrition Foundations template (preserved /programs/nutrition)', () => {
  const nutrition = getProgramsCompositionTemplate('programs-nutrition-foundations');

  it('is registered as a first-class, distinctly named template', () => {
    expect(nutrition).toBeDefined();
    expect(nutrition!.name).toBe('Nutrition Foundations page');
    // Distinct from the generic Collection landing template.
    expect(nutrition!.name).not.toBe('Collection landing page');
  });

  it('preserves the confirmed module ids and order', () => {
    expect(nutrition!.modules.map((m) => m.id)).toEqual([...NUTRITION_REFERENCE_ORDER]);
  });

  it('has zero invalid modules under the PR-A inspector', () => {
    const validity = inspectModules(
      nutrition!.modules.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content as Record<string, unknown>,
      })),
    );
    expect(validity.filter((v) => !v.valid)).toEqual([]);
  });

  it('uses the real nutrition collection slug on resolver-driven modules', () => {
    const sequence = nutrition!.modules.find((m) => m.id === 'program-sequence');
    expect((sequence!.content as Record<string, unknown>).collectionSlug).toBe('nutrition');
  });
});

describe('listProgramsTemplateOptions', () => {
  it('returns summaries parallel to the registry with correct module counts', () => {
    const options = listProgramsTemplateOptions();
    expect(options).toHaveLength(PROGRAMS_COMPOSITION_TEMPLATES.length);
    options.forEach((opt, i) => {
      const source = PROGRAMS_COMPOSITION_TEMPLATES[i];
      expect(opt.id).toBe(source.id);
      expect(opt.moduleCount).toBe(source.modules.length);
    });
  });
});

describe('getProgramsCompositionTemplate', () => {
  it('finds a known template and returns undefined for unknown ids', () => {
    const known = PROGRAMS_COMPOSITION_TEMPLATES[0].id;
    expect(getProgramsCompositionTemplate(known)?.id).toBe(known);
    expect(getProgramsCompositionTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('instantiateTemplateModules', () => {
  it('produces a deep clone with unique ids that stays valid', () => {
    const template = PROGRAMS_COMPOSITION_TEMPLATES[0];
    const instance = instantiateTemplateModules(template);

    // Same count, fresh unique ids.
    expect(instance).toHaveLength(template.modules.length);
    const ids = instance.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).not.toBe(template.modules[0].id);

    // Deep clone: mutating the instance must not touch the registry source.
    (instance[0].content as Record<string, unknown>).headline = 'MUTATED';
    expect(
      (template.modules[0].content as Record<string, unknown>).headline,
    ).not.toBe('MUTATED');

    // Instantiated modules remain valid under the inspector.
    const validity = inspectModules(instance);
    expect(validity.filter((v) => !v.valid)).toEqual([]);
  });
});
