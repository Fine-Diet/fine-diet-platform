export type AppProgramSupportCategoryKey =
  | 'nutrition'
  | 'lifestyle'
  | 'advanced';

export type AppProgramMvpStatus =
  | 'available'
  | 'available_soon'
  | 'dependency_blocked'
  | 'tba';

export type AppProgramDependencyType =
  | 'previous_program_completion'
  | 'score_trigger'
  | 'entitlement'
  | 'manual_release';

export interface AppProgramCtaDefinition {
  label: string;
  disabled: boolean;
}

export interface AppProgramDependencyDefinition {
  type: AppProgramDependencyType;
  programId?: string;
}

export interface AppProgramDefinition {
  id: string;
  slug: string;
  name: string;
  lengthLabel: string;
  objective: string;
  imageUrl: string;
  status: AppProgramMvpStatus;
  cta: AppProgramCtaDefinition;
  dependency?: AppProgramDependencyDefinition;
}

export interface AppProgramSeriesDependencyRules {
  requiredFirstProgramId: string;
  unlockAfterCompletion: {
    programId: string;
    unlockLimit: number;
    candidateProgramIds: string[];
  };
}

export interface AppProgramSeriesDefinition {
  id: string;
  slug: string;
  name: string;
  supportCategory: AppProgramSupportCategoryKey;
  visibleOnProgramsPage: boolean;
  sequenceRules?: AppProgramSeriesDependencyRules;
  programs: AppProgramDefinition[];
}

export interface AppProgramSupportCategoryDefinition {
  key: AppProgramSupportCategoryKey;
  slug: string;
  name: string;
  headline: string;
  description: string;
  categoryNavigationDisabled: boolean;
  series: AppProgramSeriesDefinition[];
}

export const PROGRAMS_MVP_HERO_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776806738515-Navigation-Featured-Image-Intensive.jpg';

export const PROGRAMS_MVP_CATEGORIES: AppProgramSupportCategoryDefinition[] = [
  {
    key: 'nutrition',
    slug: 'nutrition',
    name: 'Nutrition',
    headline: 'Start Your Nutrition Journey',
    description:
      'Begin with a guided foundation, then build toward more focused nutrition support as the program system expands.',
    categoryNavigationDisabled: true,
    series: [
      {
        id: 'fine_diet_method',
        slug: 'fine-diet-method',
        name: 'The Fine Diet Method',
        supportCategory: 'nutrition',
        visibleOnProgramsPage: false,
        // Static-only MVP shape. Runtime unlocks should later come from a
        // dependency service, not from this presentation registry.
        sequenceRules: {
          requiredFirstProgramId: 'baseline',
          unlockAfterCompletion: {
            programId: 'baseline',
            unlockLimit: 2,
            candidateProgramIds: [],
          },
        },
        programs: [
          {
            id: 'baseline',
            slug: 'baseline',
            name: 'Baseline',
            lengthLabel: '21 days',
            objective:
              'Stabilize inputs, improve internal responses, and adapt to real life.',
            imageUrl:
              'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg',
            status: 'available',
            cta: {
              label: 'Get Started',
              disabled: true,
            },
          },
          {
            id: 'digestive-reset',
            slug: 'digestive-reset',
            name: 'Digestive Reset',
            lengthLabel: '14 days',
            objective:
              'Increase digestive capacity without increasing restriction.',
            imageUrl:
              'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826859288-woman-in-hunter-green_copy.jpg',
            status: 'dependency_blocked',
            dependency: {
              type: 'previous_program_completion',
              programId: 'baseline',
            },
            cta: {
              label: 'Available Soon',
              disabled: true,
            },
          },
          {
            id: 'protein-optimization',
            slug: 'protein-optimization',
            name: 'Protein Optimization',
            lengthLabel: '14 days',
            objective:
              'Stabilize inputs, improve internal responses, and adapt to real life.',
            imageUrl:
              'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826953239-building-blocks.jpg',
            status: 'dependency_blocked',
            dependency: {
              type: 'previous_program_completion',
              programId: 'baseline',
            },
            cta: {
              label: 'Available Soon',
              disabled: true,
            },
          },
        ],
      },
    ],
  },
  {
    key: 'lifestyle',
    slug: 'lifestyle',
    name: 'Lifestyle',
    headline: 'Lifestyle Programs To Grow With',
    description:
      'Future programs will support the daily behaviors and routines that help nutrition changes stick.',
    categoryNavigationDisabled: true,
    series: [
      {
        id: 'lifestyle_tba',
        slug: 'lifestyle-tba',
        name: 'Lifestyle Programs',
        supportCategory: 'lifestyle',
        visibleOnProgramsPage: false,
        programs: [
          {
            id: 'lifestyle-tba',
            slug: 'lifestyle-tba',
            name: 'tbd',
            lengthLabel: '-- days',
            objective:
              'Behavior, rhythm, and routine support programs are being prepared for a future release.',
            imageUrl:
              'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826859288-woman-in-hunter-green_copy.jpg',
            status: 'tba',
            cta: {
              label: 'Available Soon',
              disabled: true,
            },
          },
        ],
      },
    ],
  },
  {
    key: 'advanced',
    slug: 'advanced',
    name: 'Advanced',
    headline: 'Advanced Programs',
    description:
      'Future advanced pathways will offer deeper support once the program architecture is ready.',
    categoryNavigationDisabled: true,
    series: [
      {
        id: 'advanced_tba',
        slug: 'advanced-tba',
        name: 'Advanced Programs',
        supportCategory: 'advanced',
        visibleOnProgramsPage: false,
        programs: [
          {
            id: 'advanced-tba',
            slug: 'advanced-tba',
            name: 'tbd',
            lengthLabel: '-- days',
            objective:
              'Higher-touch and more specialized program pathways are being prepared for a future release.',
            imageUrl:
              'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826859288-woman-in-hunter-green_copy.jpg',
            status: 'tba',
            cta: {
              label: 'Available Soon',
              disabled: true,
            },
          },
        ],
      },
    ],
  },
];
