import { theme } from '@/styles/theme';
import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import { parseProgramBlueprint } from './programBlueprint';

/**
 * Demonstration data only. Its palette composes existing Fine Diet design
 * tokens and does not propose a production brand, content, or asset choice.
 */
const syntheticModules: ProgramDeliveryModuleDefinition[] = [
  {
    id: 'sample-day-0-welcome',
    programSlug: 'synthetic-denim-example',
    moduleType: 'prep',
    groupId: 'sample-setup',
    groupTitle: 'Sample setup',
    eyebrow: 'Setup',
    title: 'A sample program, rendered from data',
    body: 'This synthetic program demonstrates a different duration and palette through the same Blueprint and Programs renderer.',
    statusVisibility: ['pre_start', 'active'],
  },
  ...Array.from({ length: 5 }, (_, index): ProgramDeliveryModuleDefinition[] => {
    const day = index + 1;
    const groupId = `sample-day-${day}`;
    return [
      {
        id: `${groupId}-practice`,
        programSlug: 'synthetic-denim-example',
        moduleType: 'practice_card',
        groupId,
        groupTitle: `Day ${day}`,
        eyebrow: 'Sample practice',
        title: `A small practice for day ${day}`,
        body: 'This copy is synthetic demonstration content. It does not describe a released program.',
        dayStart: day,
        dayEnd: day,
        statusVisibility: ['active'],
      },
      {
        id: `${groupId}-reflection`,
        programSlug: 'synthetic-denim-example',
        moduleType: 'guide',
        groupId,
        eyebrow: 'Sample observation',
        title: `What would be useful to notice on day ${day}?`,
        body: 'Synthetic reflection content used to demonstrate the shared content model.',
        dayStart: day,
        dayEnd: day,
        statusVisibility: ['active'],
      },
    ];
  }).flat(),
];
export const SYNTHETIC_PROGRAM_BLUEPRINT = parseProgramBlueprint({
  schemaVersion: 1,
  identity: {
    programId: 'synthetic-denim-example',
    slug: 'synthetic-denim-example',
    title: 'Sample Program',
    description: 'Synthetic Blueprint example; not a published program.',
  },
  presentation: {
    themeId: 'synthetic-existing-denim-and-brand-tokens',
    themeSource: 'existing-design-tokens',
    tokens: {
      heroSurface: theme.colors.brand[900],
      pageSurface: theme.colors.brand[800],
      darkSurface: theme.colors.brand[700],
      deepSurface: theme.colors.brand[800],
      lightSurface: theme.colors.denim[900],
      completionSurface: theme.colors.neutral[900],
      darkForeground: theme.colors.brand[50],
      lightForeground: theme.colors.neutral[900],
      accentSurface: theme.colors.denim[100],
      accentForeground: theme.colors.neutral[900],
    },
    // Keep the synthetic program image-free so it does not borrow Baseline's
    // photography or imply an unapproved brand asset.
    assets: [],
  },
  version: { key: 'sample-program-v1', label: 'Synthetic sample v1', durationDays: 5 },
  phases: [
    { id: 'sample-setup', title: 'Sample setup', label: 'Day 00 · Setup', dayStart: 0, dayEnd: 0 },
    { id: 'sample-practice', title: 'Sample practice', label: 'Days 1–5 · Synthetic', dayStart: 1, dayEnd: 5 },
  ],
  days: Array.from({ length: 6 }, (_, day) => ({
    day,
    title: day === 0 ? 'Sample setup' : `A small practice for day ${day}`,
    phaseId: day === 0 ? 'sample-setup' : 'sample-practice',
  })),
  modules: syntheticModules,
  media: [],
  interactions: {
    observations: syntheticModules
      .filter((module) => module.moduleType === 'guide' && module.dayStart != null)
      .map((module) => ({ day: module.dayStart!, moduleKey: module.id, prompt: module.title, requiredForCompletion: false })),
    checkIns: [],
    completion: {
      mode: 'explicit-day-action',
      requiresSavedObservations: false,
      requiresHandledCheckIn: true,
      calendarAdvance: 'never',
    },
  },
});
