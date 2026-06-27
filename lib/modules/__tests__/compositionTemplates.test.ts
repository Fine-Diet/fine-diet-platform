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

/** Legacy JSON order (source: data/compositions/programs--nutrition.json). */
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

/**
 * Preview-era static /programs/nutrition section order. Source of truth:
 * components/programs/ProgramCategoryView.tsx render order +
 * lib/programs/programCategoryContent.ts (NUTRITION_CATEGORY_CONTENT).
 * Differs from the legacy JSON: intro (CategoryIntro) sits after how-it-works,
 * the program grid stays after intro and before marquee, and app-integration
 * comes after differentiators and before comparison.
 */
const NUTRITION_PREVIEW_ORDER = [
  'hero',
  'how-it-works',
  'intro',
  'program-sequence',
  'marquee',
  'differentiators',
  'app-integration',
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

describe('Nutrition Foundations preview-parity template (ProgramCategoryView)', () => {
  const preview = getProgramsCompositionTemplate('programs-nutrition-foundations-preview');

  it('is registered and is the preferred FIRST Nutrition option in the picker', () => {
    expect(preview).toBeDefined();
    expect(preview!.name).toBe('Nutrition Foundations page (preview parity)');
    // First overall, and first among Nutrition templates.
    expect(PROGRAMS_COMPOSITION_TEMPLATES[0].id).toBe('programs-nutrition-foundations-preview');
    const nutritionTemplates = PROGRAMS_COMPOSITION_TEMPLATES.filter((t) =>
      t.id.startsWith('programs-nutrition-foundations'),
    );
    expect(nutritionTemplates[0].id).toBe('programs-nutrition-foundations-preview');
  });

  it('matches the preview-era static section order (source: ProgramCategoryView + NUTRITION_CATEGORY_CONTENT)', () => {
    expect(preview!.modules.map((m) => m.id)).toEqual([...NUTRITION_PREVIEW_ORDER]);
  });

  it('keeps the program grid after intro and before marquee', () => {
    const ids = preview!.modules.map((m) => m.id);
    expect(ids.indexOf('program-sequence')).toBeGreaterThan(ids.indexOf('intro'));
    expect(ids.indexOf('program-sequence')).toBeLessThan(ids.indexOf('marquee'));
  });

  it('keeps app-integration after differentiators and before comparison', () => {
    const ids = preview!.modules.map((m) => m.id);
    expect(ids.indexOf('app-integration')).toBeGreaterThan(ids.indexOf('differentiators'));
    expect(ids.indexOf('app-integration')).toBeLessThan(ids.indexOf('comparison'));
  });

  it('represents the distinct intro section (not lost/collapsed)', () => {
    const intro = preview!.modules.find((m) => m.id === 'intro');
    expect(intro).toBeDefined();
    expect((intro!.content as Record<string, unknown>).heading).toBe(
      'Start by building a foundation you can extend',
    );
  });

  it('has zero invalid modules under the PR-A inspector', () => {
    const validity = inspectModules(
      preview!.modules.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content as Record<string, unknown>,
      })),
    );
    expect(validity.filter((v) => !v.valid)).toEqual([]);
  });

  it('uses the real nutrition collection slug on resolver-driven modules', () => {
    const sequence = preview!.modules.find((m) => m.id === 'program-sequence');
    expect((sequence!.content as Record<string, unknown>).collectionSlug).toBe('nutrition');
  });
});

describe('Nutrition Foundations legacy JSON template (retained, distinguished)', () => {
  const nutrition = getProgramsCompositionTemplate('programs-nutrition-foundations');

  it('remains registered with a distinct name from the preview-parity template', () => {
    expect(nutrition).toBeDefined();
    expect(nutrition!.name).toBe('Nutrition Foundations page (legacy JSON order)');
    expect(nutrition!.name).not.toBe('Nutrition Foundations page (preview parity)');
    expect(nutrition!.name).not.toBe('Collection landing page');
  });

  it('preserves the legacy JSON module ids and order', () => {
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
