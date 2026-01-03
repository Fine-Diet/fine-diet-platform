/**
 * Gut Check v1 Assessment Config Editor
 * 
 * Admin-only page for managing gut-check v1 scoring thresholds.
 * Protected with role-based access control (admin only).
 * 
 * Phase 2 / Step 4: Admin UI for v1 confidence thresholds.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { AssessmentConfig } from '@/lib/config/types';
import { DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1 } from '@/lib/config/defaults';

interface GutCheckV1EditorProps {
  user: AuthenticatedUser;
  initialConfig: AssessmentConfig | null;
}

export default function GutCheckV1Editor({ user, initialConfig }: GutCheckV1EditorProps) {
  const defaults = DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V1;
  const [formState, setFormState] = useState<AssessmentConfig>(
    initialConfig || defaults
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Validate and show warnings
  const validateAndWarn = () => {
    const newWarnings: string[] = [];
    const thresholds = formState.scoring.thresholds;
    const confidence = thresholds.confidenceThresholds;
    const secondary = thresholds.secondaryAvatarThreshold;

    if (confidence) {
      if (confidence.high <= confidence.medium) {
        newWarnings.push('High confidence threshold should be greater than medium threshold.');
      }
      if (confidence.high < 0 || confidence.high > 1) {
        newWarnings.push('High confidence threshold should be between 0 and 1.');
      }
      if (confidence.medium < 0 || confidence.medium > 1) {
        newWarnings.push('Medium confidence threshold should be between 0 and 1.');
      }
    }

    if (secondary !== undefined) {
      if (secondary < 0 || secondary > 1) {
        newWarnings.push('Secondary avatar threshold should be between 0 and 1.');
      }
    }

    setWarnings(newWarnings);
  };

  const updateConfidenceThreshold = (field: 'high' | 'medium', value: number) => {
    setFormState((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        thresholds: {
          ...prev.scoring.thresholds,
          confidenceThresholds: {
            ...(prev.scoring.thresholds.confidenceThresholds || { high: 0.3, medium: 0.15 }),
            [field]: value,
          },
        },
      },
    }));
  };

  const updateSecondaryThreshold = (value: number) => {
    setFormState((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        thresholds: {
          ...prev.scoring.thresholds,
          secondaryAvatarThreshold: value,
        },
      },
    }));
  };

  // Validate on form state change
  useEffect(() => {
    validateAndWarn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/config/assessment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assessmentType: 'gut-check',
          version: 1,
          config: formState,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Assessment config saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save assessment config',
        });
      }
    } catch (error) {
      setSaveMessage({
        type: 'error',
        text: 'Network error. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to defaults? This will discard your current changes.')) {
      setFormState(defaults);
      setSaveMessage(null);
    }
  };

  return (
    <>
      <Head>
        <title>Gut Check v1 Config • Assessments • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <a href="/admin" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
                  ← Back to Admin
                </a>
                <h1 className="text-3xl font-bold text-gray-900">Gut Check v1 Configuration</h1>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Config'}
                </button>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> These thresholds control confidence scoring and secondary avatar detection in v1 scoring.
                Changes take effect immediately for new assessments.
              </p>
            </div>
            {saveMessage && (
              <div
                className={`p-3 rounded-md mb-4 ${
                  saveMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {saveMessage.text}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-yellow-800 mb-2">Warnings:</p>
                <ul className="list-disc list-inside text-xs text-yellow-700 space-y-1">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confidence Thresholds */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Confidence Thresholds</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  High Confidence Threshold
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formState.scoring.thresholds.confidenceThresholds?.high ?? defaults.scoring.thresholds.confidenceThresholds?.high ?? 0.3}
                  onChange={(e) => updateConfidenceThreshold('high', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  High confidence if gap {'>='} this value. Default: {defaults.scoring.thresholds.confidenceThresholds?.high ?? 0.3}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medium Confidence Threshold
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formState.scoring.thresholds.confidenceThresholds?.medium ?? defaults.scoring.thresholds.confidenceThresholds?.medium ?? 0.15}
                  onChange={(e) => updateConfidenceThreshold('medium', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Medium confidence if gap {'>='} this value. Default: {defaults.scoring.thresholds.confidenceThresholds?.medium ?? 0.15}
                </p>
              </div>
            </div>
          </section>

          {/* Secondary Avatar Threshold */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Secondary Avatar Threshold</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secondary Avatar Threshold
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formState.scoring.thresholds.secondaryAvatarThreshold ?? defaults.scoring.thresholds.secondaryAvatarThreshold ?? 0.15}
                onChange={(e) => updateSecondaryThreshold(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Show secondary avatar if within this threshold of primary. Default: {defaults.scoring.thresholds.secondaryAvatarThreshold ?? 0.15}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login?redirect=/admin/config/assessments/gut-check-v1',
        permanent: false,
      },
    };
  }

  // Load existing config from CMS
  let initialConfig: AssessmentConfig | null = null;

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { assessmentConfigSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'assessment-config:gut-check:1')
      .eq('status', 'published')
      .single();

    if (!error && data && data.data) {
      const validationResult = assessmentConfigSchema.safeParse(data.data);
      if (validationResult.success) {
        initialConfig = validationResult.data;
      }
    }
  } catch (error) {
    console.error('[Gut Check v1 Editor] Error loading config:', error);
  }

  return {
    props: {
      user,
      initialConfig,
    },
  };
};
