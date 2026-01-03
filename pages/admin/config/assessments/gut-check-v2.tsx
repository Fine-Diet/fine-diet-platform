/**
 * Gut Check v2 Assessment Config Editor
 * 
 * Admin-only page for managing gut-check v2 scoring thresholds.
 * Protected with role-based access control (admin only).
 * 
 * Phase 2 / Step 1: First config editor for assessment thresholds.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { AssessmentConfig } from '@/lib/config/types';
import { DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2 } from '@/lib/config/defaults';

interface GutCheckV2EditorProps {
  user: AuthenticatedUser;
  initialConfig: AssessmentConfig | null;
}

export default function GutCheckV2Editor({ user, initialConfig }: GutCheckV2EditorProps) {
  const defaults = DEFAULT_ASSESSMENT_CONFIG_GUT_CHECK_V2;
  const [formState, setFormState] = useState<AssessmentConfig>(
    initialConfig || defaults
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Validate and show warnings
  const validateAndWarn = () => {
    const newWarnings: string[] = [];
    const { axisBandHigh, axisBandModerate } = formState.scoring.thresholds;

    if (axisBandHigh !== undefined && axisBandModerate !== undefined) {
      if (axisBandHigh <= axisBandModerate) {
        newWarnings.push('Axis Band High threshold should be greater than Moderate threshold.');
      }
    }
    if (axisBandHigh !== undefined && (axisBandHigh < 0 || axisBandHigh > 5)) {
      newWarnings.push('Axis Band High should be between 0 and 5.');
    }
    if (axisBandModerate < 0 || axisBandModerate > 5) {
      newWarnings.push('Axis Band Moderate should be between 0 and 5.');
    }

    setWarnings(newWarnings);
  };

  const updateThreshold = (field: 'axisBandHigh' | 'axisBandModerate', value: number) => {
    setFormState((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        thresholds: {
          ...prev.scoring.thresholds,
          [field]: value,
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
          version: 2,
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
        <title>Gut Check v2 Config • Assessments • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <a href="/admin" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
                  ← Back to Admin
                </a>
                <h1 className="text-3xl font-bold text-gray-900">Gut Check v2 Configuration</h1>
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
                <strong>Note:</strong> These thresholds control axis band classification in v2 scoring.
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

          {/* Scoring Thresholds */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Scoring Thresholds</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Axis Band High Threshold
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={formState.scoring.thresholds.axisBandHigh}
                  onChange={(e) => updateThreshold('axisBandHigh', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Axis averages >= this value are classified as 'high' band. Default: {defaults.scoring.thresholds.axisBandHigh}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Axis Band Moderate Threshold
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={formState.scoring.thresholds.axisBandModerate}
                  onChange={(e) => updateThreshold('axisBandModerate', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Axis averages >= this value (but &lt; High) are classified as 'moderate' band. Default: {defaults.scoring.thresholds.axisBandModerate}
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                <p className="text-xs text-gray-600 font-semibold mb-2">How it works:</p>
                <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                  <li>Each axis (capacity, buffer, responsiveness, recovery, protection) is averaged from question responses</li>
                  <li>If average &gt;= High threshold → 'high' band</li>
                  <li>If average &gt;= Moderate threshold (but &lt; High) → 'moderate' band</li>
                  <li>Otherwise → 'low' band</li>
                  <li>These bands determine the final level (level1-level4) via decision tree</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Save Button at Bottom */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                {saveMessage && (
                  <p
                    className={`text-sm font-medium ${
                      saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {saveMessage.text}
                  </p>
                )}
              </div>
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
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GutCheckV2EditorProps> = async (context) => {
  // Require admin role
  const user = await getCurrentUserWithRoleFromSSR(context);
  
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  // Load existing config
  let initialConfig: AssessmentConfig | null = null;
  
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { assessmentConfigSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'assessment-config:gut-check:2')
      .eq('status', 'published')
      .single();

    if (!error && data?.data) {
      const validationResult = assessmentConfigSchema.safeParse(data.data);
      if (validationResult.success) {
        initialConfig = validationResult.data;
      }
    }
  } catch (error) {
    // If load fails, use null (will show defaults)
    console.warn('[Gut Check v2 Editor] Failed to load existing config:', error);
  }

  return {
    props: {
      user,
      initialConfig,
    },
  };
};
