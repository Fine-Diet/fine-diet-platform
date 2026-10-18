import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import { parseProgramBlueprint } from './programBlueprint';
import { toProgramDeliveryModulePayloads } from './programBlueprintStorage';
import { PROGRAMS_MVP_CATEGORIES } from './appProgramsMvp';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

/**
 * Local, reviewable Baseline v2 authoring candidate. This stays separate from
 * the published Baseline v1 fallback until it is imported into a draft
 * program_versions row and explicitly published.
 */
export const BASELINE_DAY_0_TO_21_CANDIDATE = {
  // The persisted UUID is supplied by the existing version-draft RPC.
  versionKey: 'baseline-day-0-21-candidate',
  versionLabel: 'Baseline — Day 0–21 candidate',
  durationDays: 21,
  modules: [] as ProgramDeliveryModuleDefinition[],
};

export function toBaselineCandidateModulePayloads(programVersionId: string) {
  return toProgramDeliveryModulePayloads(BASELINE_DAY_0_TO_21_BLUEPRINT, programVersionId);
}

const days = [
  ['Set the tone', 'Keep today familiar. Eat your usual meals at the times that work for you, and notice what feels easy to repeat.', 'When did hunger first show up today? Note the time and what was happening around you.', 'A simple first observation gives you something concrete to compare with later days.'],
  ['Notice your rhythm', 'Follow your ordinary schedule and pay attention to the gaps between meals.', 'Which stretch of the day felt most predictable? Which felt least predictable?', 'Timing is one part of your baseline. You are collecting observations without grading the day.'],
  ['Keep a familiar meal', 'Choose one meal you already know how to make. Let convenience guide the choice.', 'What made that meal easy or difficult to put together?', 'Practical details can help you identify meals you may want to keep available.'],
  ['Pause and check in', 'Before one meal, take a moment to notice your appetite and how rushed or settled you feel.', 'What did you notice before eating, and did anything shift afterward?', 'A brief pause can make everyday signals easier to remember.'],
  ['Observe energy', 'Continue your usual meals. Notice your energy at a few points in the day.', 'When did your energy feel different from your usual? What else was going on?', 'Energy has many influences. Record context instead of assigning a cause.'],
  ['Repeat what works', 'Repeat a meal or snack that has felt practical this week.', 'What would make that option easier to return to?', 'Reliable options can reduce decision effort while you build a clearer picture.'],
  ['Review the first week', 'Keep today steady, then complete the Day 7 check-in if it is available for your enrollment.', 'What pattern or question do you want to carry into next week?', 'A weekly review gathers observations; it does not diagnose or prescribe.'],
  ['Return to your rhythm', 'Begin the next week with the meal timing that felt most workable to you.', 'What helped you return to your routine after a change in plans?', 'Noticing how you return is as useful as noticing when a routine goes smoothly.'],
  ['Notice pace', 'At one meal, give yourself a little more time if your day allows.', 'Did the pace of the meal affect how present or comfortable you felt?', 'This is a personal observation, not a rule about how quickly you should eat.'],
  ['Notice the setting', 'Pay attention to where and how you eat during one part of the day.', 'What in your setting supported the meal? What got in the way?', 'Context can help explain why the same meal feels different on different days.'],
  ['Keep choices simple', 'Choose a familiar option when it makes today easier. There is no need to add a new food.', 'What choice reduced effort today?', 'The goal is a useful baseline, not a perfect menu.'],
  ['Notice comfort', 'After a meal, take a moment to notice your general comfort without trying to interpret it.', 'What did you notice, and what else may have influenced the moment?', 'Comfort can vary for many reasons. Keep the observation neutral and specific.'],
  ['Make room for real life', 'Follow the plan that fits the day you actually have. Return to a familiar option when useful.', 'What changed from what you expected? How did you adapt?', 'A workable routine can include changes and adjustments.'],
  ['Review pace and recovery', 'Keep your usual rhythm and look back at the observations you have gathered this week.', 'What felt different this week compared with the first one?', 'The Day 14 check-in can help organize what you have noticed so far.'],
  ['Choose a steady anchor', 'Pick one small meal routine that feels realistic to repeat today.', 'What made the routine feel manageable?', 'A small, repeatable action can be easier to evaluate than a broad change.'],
  ['Notice a disruption', 'If today differs from your usual routine, note the change without treating it as a setback.', 'What helped you continue with the rest of your day?', 'A baseline includes ordinary variation and the ways you respond to it.'],
  ['Keep observing', 'Use familiar choices and notice whether anything stands out compared with earlier days.', 'What feels familiar now that did not stand out at the beginning?', 'Repeated observations can make changes easier to describe.'],
  ['Prepare for a busy day', 'Identify one familiar option that could help if the day becomes busy.', 'Was that option available when you needed it?', 'Preparation is information about what supports your routine in real conditions.'],
  ['Return without judgment', 'If a meal or timing changed, continue with the next ordinary choice that works for you.', 'What helped you move on from an unexpected change?', 'One moment does not define the whole day or the full program.'],
  ['Review what is useful', 'Look back at a few notes and identify one observation you want to keep tracking.', 'Which detail would be useful to remember next week?', 'A focused observation is easier to carry forward than a long list of rules.'],
  ['Gather your Baseline', 'Keep today familiar and complete the Day 21 check-in when it is available.', 'What do you understand about your routine now? What remains a question?', 'The final check-in organizes your observations for review; it does not replace individualized care.'],
] as const;

const dayModules: ProgramDeliveryModuleDefinition[] = days.flatMap(
  ([focus, practice, observation, context], index): ProgramDeliveryModuleDefinition[] => {
    const day = index + 1;
    const week = Math.ceil(day / 7);
    return [
      {
        id: `baseline-candidate-day-${day}-practice`,
        programSlug: 'baseline',
        moduleType: 'practice_card',
        groupId: `baseline-candidate-day-${day}`,
        groupTitle: `Day ${String(day).padStart(2, '0')}`,
        eyebrow: "Today's practice",
        title: focus,
        body: practice,
        dayStart: day,
        dayEnd: day,
        statusVisibility: ['active'],
      },
      {
        id: `baseline-candidate-day-${day}-reflection`,
        programSlug: 'baseline',
        moduleType: 'guide',
        groupId: `baseline-candidate-day-${day}`,
        eyebrow: `Week ${week} · Observation`,
        title: observation,
        body: context,
        dayStart: day,
        dayEnd: day,
        statusVisibility: ['active'],
      },
    ];
  },
);

BASELINE_DAY_0_TO_21_CANDIDATE.modules = [
  {
    id: 'baseline-candidate-day-0-orientation',
    programSlug: 'baseline',
    moduleType: 'prep',
    groupId: 'baseline-candidate-day-0',
    groupTitle: 'Baseline setup',
    eyebrow: 'Day 00 · Setup',
    title: 'Let’s get you set up for Baseline',
    body: 'Use this space to get oriented and make a simple plan for the days ahead. Your usual meals are a useful place to begin.',
    dayStart: 0,
    dayEnd: 0,
    statusVisibility: ['pre_start', 'active'],
  },
  {
    id: 'baseline-candidate-day-0-meal-map',
    programSlug: 'baseline',
    moduleType: 'prep',
    groupId: 'baseline-candidate-day-0',
    eyebrow: 'Setup workspace',
    title: 'Build a meal map that fits your routine',
    body: 'Choose the setup action that is useful today. You can return to Day 0 after Baseline begins.',
    dayStart: 0,
    dayEnd: 0,
    statusVisibility: ['pre_start', 'active'],
    blocks: [
      {
        type: 'cards',
        cards: [
          {
            title: 'Create Meals',
            body: 'Open the existing meal creation flow to save familiar options you may want to repeat.',
          },
          {
            title: 'Prepare Pantry',
            body: 'Review your current pantry and make note of anything you would like to have on hand.',
          },
        ],
      },
    ],
  },
  {
    id: 'baseline-candidate-day-0-create-meals',
    programSlug: 'baseline',
    moduleType: 'prep',
    groupId: 'baseline-candidate-day-0',
    eyebrow: 'Create Meals',
    title: 'Create familiar meal options',
    body: 'Use the existing meal import and review flow to save an option you may want to repeat.',
    dayStart: 0,
    dayEnd: 0,
    statusVisibility: ['pre_start', 'active'],
    cta: {
      label: 'Open meal creation',
      href: APP_ROUTES.planImportNew,
      microcopy: 'Meal changes are saved through the existing Plans workflow.',
    },
  },
  {
    id: 'baseline-candidate-day-0-prepare-pantry',
    programSlug: 'baseline',
    moduleType: 'prep',
    groupId: 'baseline-candidate-day-0',
    eyebrow: 'Prepare Pantry',
    title: 'Get your pantry ready',
    body: 'Review what you already have and note anything you may want to pick up.',
    dayStart: 0,
    dayEnd: 0,
    statusVisibility: ['pre_start', 'active'],
    cta: {
      label: 'Pantry setup is unavailable',
      disabled: true,
      microcopy: 'There is no standalone pantry-readiness flow in the current app.',
    },
  },
  {
    id: 'baseline-candidate-day-0-roadmap',
    programSlug: 'baseline',
    moduleType: 'roadmap',
    groupId: 'baseline-candidate-day-0',
    eyebrow: 'Program sequence',
    title: 'Your 21-day Baseline',
    body: 'The day rail follows the calendar selected for your enrollment. Schedule shows the three-week sequence.',
    dayStart: 0,
    dayEnd: 0,
    statusVisibility: ['pre_start', 'active'],
    blocks: [
      {
        type: 'roadmap',
        items: [
          { key: 'setup', label: 'Setup', range: 'Day 0', description: 'Get oriented and choose a comfortable starting point.', dayStart: 0, dayEnd: 0 },
          { key: 'week-one', label: 'Week One', range: 'Days 1–7', description: 'Notice your usual rhythm and collect first-week observations.', dayStart: 1, dayEnd: 7 },
          { key: 'week-two', label: 'Week Two', range: 'Days 8–14', description: 'Continue observing routine, pace, and day-to-day context.', dayStart: 8, dayEnd: 14 },
          { key: 'week-three', label: 'Week Three', range: 'Days 15–21', description: 'Gather the observations that feel useful to carry forward.', dayStart: 15, dayEnd: 21 },
        ],
      },
    ],
  },
  {
    id: 'baseline-candidate-week-1-context',
    programSlug: 'baseline',
    moduleType: 'week',
    groupId: 'baseline-candidate-week-1',
    eyebrow: 'Week One · Rhythm',
    title: 'Find a routine that works',
    body: 'Notice your usual meal timing, familiar choices, and the practical details that make a routine easier to repeat.',
    dayStart: 1,
    dayEnd: 7,
    statusVisibility: ['active'],
  },
  {
    id: 'baseline-candidate-week-2-context',
    programSlug: 'baseline',
    moduleType: 'week',
    groupId: 'baseline-candidate-week-2',
    eyebrow: 'Week Two · Observation',
    title: 'Add context to your observations',
    body: 'Keep your routine familiar while noticing pace, setting, comfort, and what was happening around each moment.',
    dayStart: 8,
    dayEnd: 14,
    statusVisibility: ['active'],
  },
  {
    id: 'baseline-candidate-week-3-context',
    programSlug: 'baseline',
    moduleType: 'week',
    groupId: 'baseline-candidate-week-3',
    eyebrow: 'Week Three · Carry Forward',
    title: 'Gather what feels useful',
    body: 'Continue with familiar choices and collect the observations you would like to carry into your next conversation or planning step.',
    dayStart: 15,
    dayEnd: 21,
    statusVisibility: ['active'],
  },
  ...dayModules,
];

const baselineCatalogProgram = PROGRAMS_MVP_CATEGORIES
  .flatMap((category) => category.series)
  .flatMap((series) => series.programs)
  .find((program) => program.slug === 'baseline');

const baselineWeeks = [1, 2, 3].map((week) =>
  BASELINE_DAY_0_TO_21_CANDIDATE.modules.find((module) => module.id === `baseline-candidate-week-${week}-context`),
);

export const BASELINE_DAY_0_TO_21_BLUEPRINT = parseProgramBlueprint({
  schemaVersion: 1,
  identity: {
    programId: 'baseline',
    slug: 'baseline',
    title: 'Baseline',
    description: baselineCatalogProgram?.objective ?? '',
    categorySlug: 'nutrition',
    collectionSlug: 'nutrition',
    marketingRecordSlug: 'nutrition--baseline',
  },
  presentation: {
    themeId: 'baseline-existing-renderer',
    themeSource: 'existing-renderer',
    tokens: {
      heroSurface: '#07170f',
      pageSurface: '#0d1d0f',
      darkSurface: '#0d2110',
      deepSurface: '#031205',
      lightSurface: '#f3f3ea',
      completionSurface: '#1b1711',
      darkForeground: '#ffffff',
      lightForeground: '#17100c',
      accentSurface: '#C0D0DC',
      accentForeground: '#17100c',
    },
    assets: baselineCatalogProgram ? [
      {
        id: 'baseline-delivery-hero',
        role: 'delivery-hero',
        variant: 'default',
        src: baselineCatalogProgram.imageUrl,
        alt: '',
        decorative: true,
        source: 'PROGRAMS_MVP_CATEGORIES[].programs[].imageUrl',
      },
      {
        id: 'baseline-catalogue-card',
        role: 'catalogue-card',
        variant: 'default',
        src: baselineCatalogProgram.imageUrl,
        alt: 'Baseline program',
        decorative: false,
        source: 'PROGRAMS_MVP_CATEGORIES[].programs[].imageUrl',
      },
    ] : [],
  },
  version: {
    key: BASELINE_DAY_0_TO_21_CANDIDATE.versionKey,
    label: BASELINE_DAY_0_TO_21_CANDIDATE.versionLabel,
    durationDays: BASELINE_DAY_0_TO_21_CANDIDATE.durationDays,
  },
  phases: [
    { id: 'baseline-setup', title: 'Baseline setup', label: 'Day 00 · Setup', dayStart: 0, dayEnd: 0 },
    ...baselineWeeks.map((module, index) => ({
      id: `baseline-week-${index + 1}`,
      title: module?.title ?? `Week ${index + 1}`,
      label: module?.eyebrow,
      dayStart: index * 7 + 1,
      dayEnd: (index + 1) * 7,
    })),
  ],
  days: Array.from({ length: 22 }, (_, day) => {
    const phaseIndex = day === 0 ? 0 : Math.ceil(day / 7);
    const practiceModule = BASELINE_DAY_0_TO_21_CANDIDATE.modules.find((item) => item.id === `baseline-candidate-day-${day}-practice`);
    return {
      day,
      title: day === 0 ? 'Baseline setup' : practiceModule?.title ?? `Day ${day}`,
      phaseId: day === 0 ? 'baseline-setup' : `baseline-week-${phaseIndex}`,
    };
  }),
  modules: BASELINE_DAY_0_TO_21_CANDIDATE.modules,
  media: BASELINE_DAY_0_TO_21_CANDIDATE.modules.flatMap((module) => (module.blocks ?? [])
    .filter((block): block is Extract<NonNullable<ProgramDeliveryModuleDefinition['blocks']>[number], { type: 'audio' | 'video' }> => block.type === 'audio' || block.type === 'video')
    .map((block) => ({ id: block.id, kind: block.type, role: 'module-media' as const, src: block.url, title: block.title, description: block.description }))),
  interactions: {
    observations: BASELINE_DAY_0_TO_21_CANDIDATE.modules
      .filter((module) => module.moduleType === 'guide' && module.dayStart != null && module.dayStart === module.dayEnd)
      .map((module) => ({ day: module.dayStart!, moduleKey: module.id, prompt: module.title, requiredForCompletion: true })),
    checkIns: [7, 14, 21].map((day) => ({
      day,
      templateSource: 'program_checkin_templates' as const,
      templateKey: `baseline-day-${day}-checkin`,
      requiredForCompletion: true,
    })),
    completion: {
      mode: 'explicit-day-action' as const,
      requiresSavedObservations: true,
      requiresHandledCheckIn: true,
      calendarAdvance: 'never' as const,
    },
  },
});
