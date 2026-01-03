/**
 * Avatar Mapping Editor
 * 
 * Admin-only page for managing global avatar mappings.
 * Protected with role-based access control (admin only).
 * 
 * Phase 2 / Step 2: Avatar mapping admin UI.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { AvatarMapping } from '@/lib/config/types';
import { DEFAULT_AVATAR_MAPPING } from '@/lib/config/defaults';

interface AvatarMappingEditorProps {
  user: AuthenticatedUser;
  initialMapping: AvatarMapping | null;
}

export default function AvatarMappingEditor({ user, initialMapping }: AvatarMappingEditorProps) {
  const defaults = DEFAULT_AVATAR_MAPPING;
  const [formState, setFormState] = useState<AvatarMapping>(
    initialMapping || defaults
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newMappingKey, setNewMappingKey] = useState('');
  const [newMappingValue, setNewMappingValue] = useState('');

  const updateDefaultAvatar = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      defaultAvatarKey: value,
    }));
  };

  const addMapping = () => {
    if (!newMappingKey.trim() || !newMappingValue.trim()) {
      return;
    }

    setFormState((prev) => ({
      ...prev,
      mappings: {
        ...prev.mappings,
        [newMappingKey.trim()]: newMappingValue.trim(),
      },
    }));

    setNewMappingKey('');
    setNewMappingValue('');
  };

  const removeMapping = (key: string) => {
    setFormState((prev) => {
      const newMappings = { ...prev.mappings };
      delete newMappings[key];
      return {
        ...prev,
        mappings: newMappings,
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/config/avatar-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Avatar mapping saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save avatar mapping',
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
      const response = await fetch('/api/admin/config/avatar-mapping', {
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
          text: data.error || 'Failed to reset avatar mapping',
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
        <title>Avatar Mapping | Admin | Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">Avatar Mapping</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage avatar key mappings. Maps result keys (e.g., level1-level4) to avatar display keys.
              </p>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Defaults Reference */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Default Values (Reference)</h2>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>defaultAvatarKey: {defaults.defaultAvatarKey}</div>
                  <div>mappings: {Object.keys(defaults.mappings).length === 0 ? '{}' : JSON.stringify(defaults.mappings)}</div>
                </div>
              </div>

              {/* Default Avatar Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Avatar Key
                </label>
                <input
                  type="text"
                  value={formState.defaultAvatarKey}
                  onChange={(e) => updateDefaultAvatar(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., balanced"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default avatar key to use when no mapping is found. Default: {defaults.defaultAvatarKey}
                </p>
              </div>

              {/* Mappings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mappings
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Map result keys (e.g., level1, level2) to avatar display keys.
                </p>

                {/* Existing Mappings */}
                {Object.keys(formState.mappings).length > 0 && (
                  <div className="space-y-2 mb-4">
                    {Object.entries(formState.mappings).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <span className="text-sm font-mono text-gray-700 flex-1">
                          {key} → {value}
                        </span>
                        <button
                          onClick={() => removeMapping(key)}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Mapping */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMappingKey}
                    onChange={(e) => setNewMappingKey(e.target.value)}
                    placeholder="Result key (e.g., level1)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMapping();
                      }
                    }}
                  />
                  <span className="self-center text-gray-500">→</span>
                  <input
                    type="text"
                    value={newMappingValue}
                    onChange={(e) => setNewMappingValue(e.target.value)}
                    placeholder="Avatar key (e.g., balanced)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMapping();
                      }
                    }}
                  />
                  <button
                    onClick={addMapping}
                    disabled={!newMappingKey.trim() || !newMappingValue.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
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
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login?redirect=/admin/config/avatar-mapping',
        permanent: false,
      },
    };
  }

  // Load existing avatar mapping from CMS
  let initialMapping: AvatarMapping | null = null;

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { avatarMappingSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'avatar-mapping:global')
      .eq('status', 'published')
      .single();

    if (!error && data && data.data) {
      const validationResult = avatarMappingSchema.safeParse(data.data);
      if (validationResult.success) {
        initialMapping = validationResult.data;
      }
    }
  } catch (error) {
    console.error('[Avatar Mapping Editor] Error loading mapping:', error);
  }

  return {
    props: {
      user: userResult.user,
      initialMapping,
    },
  };
};
