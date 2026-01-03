/**
 * Feature Flags Editor
 * 
 * Admin-only page for managing global feature flags.
 * Protected with role-based access control (admin only).
 * 
 * Phase 2 / Step 2: Feature flags admin UI.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { FeatureFlags } from '@/lib/config/types';
import { DEFAULT_FEATURE_FLAGS } from '@/lib/config/defaults';

interface FeatureFlagsEditorProps {
  user: AuthenticatedUser;
  initialFlags: FeatureFlags | null;
}

export default function FeatureFlagsEditor({ user, initialFlags }: FeatureFlagsEditorProps) {
  const defaults = DEFAULT_FEATURE_FLAGS;
  const [formState, setFormState] = useState<FeatureFlags>(
    initialFlags || defaults
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateFlag = (field: keyof FeatureFlags, value: boolean) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/config/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Feature flags saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save feature flags',
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

  const handleReset = async () => {
    if (!confirm('Reset to defaults? This will clear the CMS entry and use hard-coded defaults.')) {
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/config/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Empty payload triggers reset
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setFormState(defaults);
        setSaveMessage({ type: 'success', text: 'Reset to defaults successful!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to reset feature flags',
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

  return (
    <>
      <Head>
        <title>Feature Flags | Admin | Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage global feature flags. Changes take effect immediately.
              </p>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Defaults Reference */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Default Values (Reference)</h2>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>enableN8nWebhook: {defaults.enableN8nWebhook ? 'true' : 'false'}</div>
                  <div>enableNewResultsFlow: {defaults.enableNewResultsFlow ? 'true' : 'false'}</div>
                  <div>allowUnlistedYoutubeEmbeds: {defaults.allowUnlistedYoutubeEmbeds ? 'true' : 'false'}</div>
                </div>
              </div>

              {/* Feature Flags */}
              <div className="space-y-4">
                {/* Enable N8N Webhook */}
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">
                      Enable N8N Webhook
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Controls whether N8N webhooks are emitted for people service events.
                      Default: {defaults.enableN8nWebhook ? 'enabled' : 'disabled'}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.enableN8nWebhook ?? defaults.enableN8nWebhook}
                      onChange={(e) => updateFlag('enableN8nWebhook', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Enable New Results Flow */}
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">
                      Enable New Results Flow
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Enables the new results flow UI (if implemented).
                      Default: {defaults.enableNewResultsFlow ? 'enabled' : 'disabled'}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.enableNewResultsFlow ?? defaults.enableNewResultsFlow}
                      onChange={(e) => updateFlag('enableNewResultsFlow', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Allow Unlisted YouTube Embeds */}
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">
                      Allow Unlisted YouTube Embeds
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Controls whether unlisted YouTube videos can be embedded.
                      Default: {defaults.allowUnlistedYoutubeEmbeds ? 'allowed' : 'blocked'}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.allowUnlistedYoutubeEmbeds ?? defaults.allowUnlistedYoutubeEmbeds}
                      onChange={(e) => updateFlag('allowUnlistedYoutubeEmbeds', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Save Message */}
              {saveMessage && (
                <div
                  className={`p-3 rounded ${
                    saveMessage.type === 'success'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  {saveMessage.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <button
                  onClick={handleReset}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset to Defaults
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const userResult = await getCurrentUserWithRoleFromSSR(context);

  if (!userResult.user || userResult.role !== 'admin') {
    return {
      redirect: {
        destination: '/login?redirect=/admin/config/feature-flags',
        permanent: false,
      },
    };
  }

  // Load existing feature flags from CMS
  let initialFlags: FeatureFlags | null = null;

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { featureFlagsSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'feature-flags:global')
      .eq('status', 'published')
      .single();

    if (!error && data && data.data) {
      const validationResult = featureFlagsSchema.safeParse(data.data);
      if (validationResult.success) {
        initialFlags = validationResult.data;
      }
    }
  } catch (error) {
    console.error('[Feature Flags Editor] Error loading flags:', error);
  }

  return {
    props: {
      user: userResult.user,
      initialFlags,
    },
  };
};
