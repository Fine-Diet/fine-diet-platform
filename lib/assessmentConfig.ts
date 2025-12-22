/**
 * Assessment Configuration
 * 
 * Placeholder configuration for Gut Check v1
 * Final copy and scoring weights will be added later
 */

import type { AssessmentConfig } from './assessmentTypes';
import questionsV2 from '@/content/assessments/gut-check/questions_v2.json';

/**
 * Gut Check v1 Configuration
 * 
 * NOTE: This is placeholder content. Final questions, options, and scoring
 * weights will be provided by the content team.
 */
export const gutCheckConfig: AssessmentConfig = {
  assessmentType: 'gut-check',
  assessmentVersion: 1,
  questions: [
    {
      id: 'q1',
      text: 'How often do you experience bloating?',
      options: [
        {
          id: 'o1-1',
          label: 'Rarely or never',
          scoreWeights: {
            'balanced': 2,
            'sensitive': 0,
            'reactive': 0,
          },
        },
        {
          id: 'o1-2',
          label: 'Occasionally (1-2 times per week)',
          scoreWeights: {
            'balanced': 1,
            'sensitive': 1,
            'reactive': 0,
          },
        },
        {
          id: 'o1-3',
          label: 'Frequently (3-5 times per week)',
          scoreWeights: {
            'balanced': 0,
            'sensitive': 2,
            'reactive': 1,
          },
        },
        {
          id: 'o1-4',
          label: 'Almost daily',
          scoreWeights: {
            'balanced': 0,
            'sensitive': 1,
            'reactive': 2,
          },
        },
      ],
    },
    {
      id: 'q2',
      text: 'How would you describe your typical energy levels?',
      options: [
        {
          id: 'o2-1',
          label: 'Consistent and steady throughout the day',
          scoreWeights: {
            'balanced': 2,
            'sensitive': 1,
            'reactive': 0,
          },
        },
        {
          id: 'o2-2',
          label: 'Variable, with some ups and downs',
          scoreWeights: {
            'balanced': 1,
            'sensitive': 2,
            'reactive': 1,
          },
        },
        {
          id: 'o2-3',
          label: 'Often low or unpredictable',
          scoreWeights: {
            'balanced': 0,
            'sensitive': 1,
            'reactive': 2,
          },
        },
      ],
    },
    {
      id: 'q3',
      text: 'How do you typically respond to stress?',
      options: [
        {
          id: 'o3-1',
          label: 'I handle stress well with minimal impact',
          scoreWeights: {
            'balanced': 2,
            'sensitive': 1,
            'reactive': 0,
          },
        },
        {
          id: 'o3-2',
          label: 'Stress affects me, but I can manage it',
          scoreWeights: {
            'balanced': 1,
            'sensitive': 2,
            'reactive': 1,
          },
        },
        {
          id: 'o3-3',
          label: 'Stress significantly impacts my well-being',
          scoreWeights: {
            'balanced': 0,
            'sensitive': 1,
            'reactive': 2,
          },
        },
      ],
    },
  ],
  avatars: ['balanced', 'sensitive', 'reactive'],
  scoring: {
    thresholds: {
      secondaryAvatarThreshold: 0.15, // Show secondary if within 15% of primary
      confidenceThresholds: {
        high: 0.3, // High confidence if gap >= 30%
        medium: 0.15, // Medium confidence if gap >= 15%
      },
    },
  },
};

/**
 * Get assessment config by type and version
 */
export function getAssessmentConfig(assessmentType: 'gut-check', version?: number): AssessmentConfig {
  switch (assessmentType) {
    case 'gut-check':
      // Load v2 config from JSON if version is 2
      if (version === 2) {
        const v2Data = questionsV2 as {
          version: string;
          assessmentType: string;
          sections?: Array<{ id: string; title: string; questionIds: string[] }>;
          questions: Array<{
            id: string;
            text: string;
            options: Array<{ id: string; label: string; value: number }>;
          }>;
        };

        return {
          assessmentType: 'gut-check',
          assessmentVersion: 2,
          sections: v2Data.sections,
          questions: v2Data.questions.map((q) => ({
            id: q.id,
            text: q.text,
            options: q.options.map((opt) => ({
              id: opt.id,
              label: opt.label,
              value: opt.value,
            })),
          })),
          avatars: ['level1', 'level2', 'level3', 'level4'], // v2 uses levels
          scoring: {
            thresholds: {
              secondaryAvatarThreshold: 0.15, // Not used in v2 but required by interface
              confidenceThresholds: {
                high: 0.3,
                medium: 0.15,
              },
            },
          },
        };
      }
      // Default to v1
      return gutCheckConfig;
    default:
      throw new Error(`Unknown assessment type: ${assessmentType}`);
  }
}

