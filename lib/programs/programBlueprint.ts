import { z } from 'zod';
import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const visibilitySchema = z.enum([
  'not_started', 'pre_start', 'active', 'paused', 'completed', 'cancelled',
]);
const moduleTypeSchema = z.enum([
  'prep', 'week', 'practice_card', 'guide', 'capacity_support', 'roadmap',
  'checkin_prompt', 'recommendation_prompt',
]);

const themeTokensSchema = z.object({
  heroSurface: hexColorSchema,
  pageSurface: hexColorSchema,
  darkSurface: hexColorSchema,
  deepSurface: hexColorSchema,
  lightSurface: hexColorSchema,
  completionSurface: hexColorSchema,
  darkForeground: hexColorSchema,
  lightForeground: hexColorSchema,
  accentSurface: hexColorSchema,
  accentForeground: hexColorSchema,
});

const assetRoleSchema = z.enum([
  'delivery-hero', 'catalogue-card', 'marketing-hero', 'module-media',
  'social-card',
]);

const assetSchema = z.object({
  id: slugSchema,
  role: assetRoleSchema,
  variant: z.enum(['desktop', 'mobile', 'square', 'default']).default('default'),
  src: z.string().min(1).refine((value) => {
    if (value.startsWith('/')) return !value.startsWith('//');
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }, 'Asset must use a site path or HTTPS URL.'),
  alt: z.string(),
  decorative: z.boolean(),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  source: z.string().min(1),
}).superRefine((asset, ctx) => {
  if (!asset.decorative && asset.alt.trim().length === 0) {
    ctx.addIssue({ code: 'custom', path: ['alt'], message: 'Informative assets require alt text.' });
  }
});

const moduleSchema = z.object({
  id: slugSchema,
  programSlug: slugSchema,
  moduleType: moduleTypeSchema,
  groupId: z.string().min(1).optional(),
  groupTitle: z.string().min(1).optional(),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  body: z.string(),
  dayStart: z.number().int().min(0).optional(),
  dayEnd: z.number().int().min(0).optional(),
  statusVisibility: z.array(visibilitySchema).min(1),
  showWhen: z.union([
    z.enum(['always', 'checkin_due', 'checkin_not_due', 'day21_handled', 'day21_not_handled']),
    z.array(z.enum(['always', 'checkin_due', 'checkin_not_due', 'day21_handled', 'day21_not_handled'])),
  ]).optional(),
  blocks: z.array(z.unknown()).optional(),
  capacityVariants: z.record(z.string(), z.unknown()).optional(),
  cta: z.record(z.string(), z.unknown()).optional(),
  safetyNotes: z.array(z.string()).optional(),
  noClaimsNotes: z.array(z.string()).optional(),
}).passthrough();

const blueprintSchema = z.object({
  schemaVersion: z.literal(1),
  identity: z.object({
    programId: z.string().min(1),
    slug: slugSchema,
    title: z.string().min(1),
    description: z.string(),
    categorySlug: slugSchema.optional(),
    collectionSlug: slugSchema.optional(),
    marketingRecordSlug: z.string().optional(),
  }),
  presentation: z.object({
    themeId: z.string().min(1),
    themeSource: z.enum(['existing-renderer', 'existing-design-tokens', 'founder-approved']),
    tokens: themeTokensSchema,
    assets: z.array(assetSchema),
  }),
  version: z.object({
    key: slugSchema,
    label: z.string().min(1),
    durationDays: z.number().int().min(1).max(366),
  }),
  phases: z.array(z.object({
    id: slugSchema,
    title: z.string().min(1),
    label: z.string().optional(),
    dayStart: z.number().int().min(0),
    dayEnd: z.number().int().min(0),
  })).min(1),
  days: z.array(z.object({
    day: z.number().int().min(0),
    title: z.string().min(1),
    phaseId: slugSchema,
  })),
  modules: z.array(moduleSchema),
  media: z.array(z.object({
    id: slugSchema,
    kind: z.enum(['audio', 'video', 'image']),
    role: assetRoleSchema,
    src: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    alt: z.string().optional(),
  })),
  interactions: z.object({
    observations: z.array(z.object({
      day: z.number().int().min(1),
      moduleKey: slugSchema,
      prompt: z.string().min(1),
      requiredForCompletion: z.boolean(),
    })),
    checkIns: z.array(z.object({
      day: z.number().int().min(1),
      templateSource: z.enum(['program_checkin_templates', 'inline-blueprint']),
      templateKey: z.string().min(1),
      requiredForCompletion: z.boolean(),
    })),
    completion: z.object({
      mode: z.literal('explicit-day-action'),
      requiresSavedObservations: z.boolean(),
      requiresHandledCheckIn: z.boolean(),
      calendarAdvance: z.literal('never'),
    }),
  }),
}).superRefine((blueprint, ctx) => {
  const { durationDays } = blueprint.version;
  const phases = [...blueprint.phases].sort((a, b) => a.dayStart - b.dayStart);
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length) {
    ctx.addIssue({ code: 'custom', path: ['phases'], message: 'Phase IDs must be unique within a version.' });
  }
  if (phases[0]?.dayStart !== 0 || phases.at(-1)?.dayEnd !== durationDays) {
    ctx.addIssue({ code: 'custom', path: ['phases'], message: 'Phases must cover Day 0 through the version duration.' });
  }
  phases.forEach((phase, index) => {
    if (phase.dayEnd < phase.dayStart || phase.dayEnd > durationDays) {
      ctx.addIssue({ code: 'custom', path: ['phases', index], message: 'Phase day range is outside the version.' });
    }
    if (index > 0 && phases[index - 1].dayEnd + 1 !== phase.dayStart) {
      ctx.addIssue({ code: 'custom', path: ['phases', index], message: 'Phases must be contiguous and non-overlapping.' });
    }
  });

  const expectedDays = Array.from({ length: durationDays + 1 }, (_, day) => day);
  const actualDays = blueprint.days.map((entry) => entry.day).sort((a, b) => a - b);
  if (new Set(actualDays).size !== actualDays.length || actualDays.join(',') !== expectedDays.join(',')) {
    ctx.addIssue({ code: 'custom', path: ['days'], message: 'Blueprint must define each day from 0 through duration exactly once.' });
  }
  blueprint.days.forEach((day, index) => {
    const phase = phases.find((entry) => day.day >= entry.dayStart && day.day <= entry.dayEnd);
    if (!phase || day.phaseId !== phase.id) {
      ctx.addIssue({ code: 'custom', path: ['days', index, 'phaseId'], message: 'Day phase must match its versioned phase range.' });
    }
  });

  const moduleKeys = new Set<string>();
  blueprint.modules.forEach((module, index) => {
    if (module.programSlug !== blueprint.identity.slug) {
      ctx.addIssue({ code: 'custom', path: ['modules', index, 'programSlug'], message: 'Module slug must match the blueprint identity.' });
    }
    if (moduleKeys.has(module.id)) {
      ctx.addIssue({ code: 'custom', path: ['modules', index, 'id'], message: 'Module keys must be unique within a version.' });
    }
    moduleKeys.add(module.id);
    if ((module.dayStart != null && module.dayStart > durationDays) || (module.dayEnd != null && module.dayEnd > durationDays) || (module.dayStart != null && module.dayEnd != null && module.dayStart > module.dayEnd)) {
      ctx.addIssue({ code: 'custom', path: ['modules', index], message: 'Module day range is outside the version.' });
    }
  });
  const assetIds = blueprint.presentation.assets.map((asset) => asset.id);
  if (new Set(assetIds).size !== assetIds.length) {
    ctx.addIssue({ code: 'custom', path: ['presentation', 'assets'], message: 'Asset IDs must be unique within a program.' });
  }
  const mediaIds = blueprint.media.map((item) => item.id);
  if (new Set(mediaIds).size !== mediaIds.length) {
    ctx.addIssue({ code: 'custom', path: ['media'], message: 'Media IDs must be unique within a version.' });
  }
  const observationDays = blueprint.interactions.observations.map((item) => item.day);
  if (new Set(observationDays).size !== observationDays.length) {
    ctx.addIssue({ code: 'custom', path: ['interactions', 'observations'], message: 'Observation days must be unique within a version.' });
  }
  blueprint.interactions.observations.forEach((observation, index) => {
    const observedModule = blueprint.modules.find((entry) => entry.id === observation.moduleKey);
    if (!observedModule || observedModule.moduleType !== 'guide' || observation.day > durationDays || observedModule.dayStart !== observation.day || observedModule.dayEnd !== observation.day) {
      ctx.addIssue({ code: 'custom', path: ['interactions', 'observations', index], message: 'Observation must point to a guide module authored for the same day.' });
    }
  });
  const checkinDays = blueprint.interactions.checkIns.map((item) => item.day);
  if (new Set(checkinDays).size !== checkinDays.length || checkinDays.some((day) => day > durationDays)) {
    ctx.addIssue({ code: 'custom', path: ['interactions', 'checkIns'], message: 'Check-in days must be unique and within the version.' });
  }
  const tokens = blueprint.presentation.tokens;
  for (const [foreground, background, role] of [
    [tokens.darkForeground, tokens.pageSurface, 'pageSurface'],
    [tokens.darkForeground, tokens.darkSurface, 'darkSurface'],
    [tokens.darkForeground, tokens.deepSurface, 'deepSurface'],
    [tokens.lightForeground, tokens.lightSurface, 'lightSurface'],
    [tokens.darkForeground, tokens.heroSurface, 'heroSurface'],
    [tokens.darkForeground, tokens.completionSurface, 'completionSurface'],
    [tokens.accentForeground, tokens.accentSurface, 'accentSurface'],
  ] as const) {
    if (contrastRatio(foreground, background) < 4.5) {
      ctx.addIssue({ code: 'custom', path: ['presentation', 'tokens', role], message: `Foreground/background contrast must be at least 4.5:1 (${role}).` });
    }
  }
});

/** Only version-specific configuration belongs in program_versions.metadata. */
export const PROGRAM_BLUEPRINT_METADATA_KEY = 'programBlueprintV1' as const;
export const programBlueprintVersionFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  presentation: blueprintSchema.shape.presentation,
  phases: blueprintSchema.shape.phases,
  days: blueprintSchema.shape.days,
  media: blueprintSchema.shape.media,
  interactions: blueprintSchema.shape.interactions,
});
export type ProgramBlueprintVersionFields = z.infer<typeof programBlueprintVersionFieldsSchema>;

export interface ProgramBlueprintRuntimeConfig {
  programSlug: string;
  version: ProgramBlueprint['version'];
  presentation: ProgramBlueprint['presentation'];
  phases: ProgramBlueprint['phases'];
  interactions: ProgramBlueprint['interactions'];
}
export type ProgramBlueprintDeliveryConfig = ProgramBlueprint | ProgramBlueprintRuntimeConfig;

export function programBlueprintSlug(config: ProgramBlueprintDeliveryConfig): string {
  return 'identity' in config ? config.identity.slug : config.programSlug;
}

export type ProgramBlueprint = z.infer<typeof blueprintSchema> & {
  modules: ProgramDeliveryModuleDefinition[];
};

export function parseProgramBlueprint(input: unknown): ProgramBlueprint {
  return blueprintSchema.parse(input) as ProgramBlueprint;
}

export function parseProgramBlueprintVersionFields(input: unknown): ProgramBlueprintVersionFields {
  return programBlueprintVersionFieldsSchema.parse(input);
}

export function toProgramBlueprintVersionFields(blueprint: ProgramBlueprint): ProgramBlueprintVersionFields {
  return parseProgramBlueprintVersionFields({
    schemaVersion: blueprint.schemaVersion,
    presentation: blueprint.presentation,
    phases: blueprint.phases,
    days: blueprint.days,
    media: blueprint.media,
    interactions: blueprint.interactions,
  });
}

export function programBlueprintRuntimeConfig(blueprint: ProgramBlueprint): ProgramBlueprintRuntimeConfig {
  return {
    programSlug: blueprint.identity.slug,
    version: blueprint.version,
    presentation: blueprint.presentation,
    phases: blueprint.phases,
    interactions: blueprint.interactions,
  };
}

export function blueprintWithDeliveryModules(
  blueprint: ProgramBlueprint,
  modules: ProgramDeliveryModuleDefinition[],
  version?: Partial<ProgramBlueprint['version']>,
): ProgramBlueprint {
  return parseProgramBlueprint({
    ...blueprint,
    version: { ...blueprint.version, ...version },
    modules,
  });
}

export function getProgramBlueprintAsset(
  blueprint: Pick<ProgramBlueprint, 'presentation'> | ProgramBlueprintRuntimeConfig,
  role: ProgramBlueprint['presentation']['assets'][number]['role'],
  variant: ProgramBlueprint['presentation']['assets'][number]['variant'] = 'default',
) {
  return blueprint.presentation.assets.find((asset) => asset.role === role && asset.variant === variant)
    ?? blueprint.presentation.assets.find((asset) => asset.role === role && asset.variant === 'default')
    ?? null;
}

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255) ?? [];
    const [r, g, b] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
