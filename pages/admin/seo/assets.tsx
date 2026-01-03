/**
 * Browser Assets Configuration Editor
 * 
 * Admin-only page for managing browser assets (favicon, theme-color, manifest).
 * Protected with role-based access control (admin only).
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { BrowserAssets } from '@/lib/contentTypes';

interface BrowserAssetsEditorProps {
  user: AuthenticatedUser;
  initialAssets: BrowserAssets | null;
}

export default function BrowserAssetsEditor({ user, initialAssets }: BrowserAssetsEditorProps) {
  const [formState, setFormState] = useState<BrowserAssets>(initialAssets || {});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Validate and show warnings
  useEffect(() => {
    const newWarnings: string[] = [];
    
    if (formState.favicon && !formState.favicon.startsWith('http')) {
      newWarnings.push('Favicon must be an absolute URL (starting with http:// or https://)');
    }
    if (formState.appleTouchIcon && !formState.appleTouchIcon.startsWith('http')) {
      newWarnings.push('Apple Touch Icon must be an absolute URL (starting with http:// or https://)');
    }
    if (formState.themeColor && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$|^[a-z]+$/.test(formState.themeColor)) {
      newWarnings.push('Theme color must be a hex color (e.g., #FF5733) or CSS color name (e.g., blue)');
    }
    
    setWarnings(newWarnings);
  }, [formState]);

  const updateField = <K extends keyof BrowserAssets>(field: K, value: BrowserAssets[K]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value || undefined, // Convert empty strings to undefined
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    // Remove undefined/empty fields before saving
    const cleanedState: BrowserAssets = {};
    if (formState.favicon) cleanedState.favicon = formState.favicon;
    if (formState.appleTouchIcon) cleanedState.appleTouchIcon = formState.appleTouchIcon;
    if (formState.themeColor) cleanedState.themeColor = formState.themeColor;
    if (formState.manifestName) cleanedState.manifestName = formState.manifestName;
    if (formState.manifestShortName) cleanedState.manifestShortName = formState.manifestShortName;

    try {
      const response = await fetch('/api/admin/seo/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanedState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Browser assets saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save browser assets',
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
        <title>Browser Assets • SEO • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <a href="/admin/seo" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
                  ← Back to SEO Global
                </a>
                <h1 className="text-3xl font-bold text-gray-900">Browser Assets</h1>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Browser Assets'}
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> All fields are optional. If not set, the site will use static defaults from /public.
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

          {/* Icons */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Icons</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Favicon URL
                </label>
                <input
                  type="url"
                  value={formState.favicon || ''}
                  onChange={(e) => updateField('favicon', e.target.value)}
                  placeholder="https://myfinediet.com/favicon.ico"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Absolute URL to favicon (typically .ico or .png, 32x32px recommended)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apple Touch Icon URL
                </label>
                <input
                  type="url"
                  value={formState.appleTouchIcon || ''}
                  onChange={(e) => updateField('appleTouchIcon', e.target.value)}
                  placeholder="https://myfinediet.com/apple-touch-icon.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Absolute URL to Apple Touch Icon (180x180px recommended)</p>
              </div>
            </div>
          </section>

          {/* Theme */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Theme</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Theme Color
                </label>
                <input
                  type="text"
                  value={formState.themeColor || ''}
                  onChange={(e) => updateField('themeColor', e.target.value)}
                  placeholder="#FF5733 or blue"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Hex color (e.g., #FF5733) or CSS color name (e.g., blue, red)</p>
              </div>
            </div>
          </section>

          {/* Manifest */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Web App Manifest</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manifest Name
                </label>
                <input
                  type="text"
                  value={formState.manifestName || ''}
                  onChange={(e) => updateField('manifestName', e.target.value)}
                  placeholder="Fine Diet"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formState.manifestName?.length || 0}/100 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manifest Short Name
                </label>
                <input
                  type="text"
                  value={formState.manifestShortName || ''}
                  onChange={(e) => updateField('manifestShortName', e.target.value)}
                  placeholder="Fine Diet"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formState.manifestShortName?.length || 0}/50 characters
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                <p className="text-xs text-gray-600">
                  <strong>Manifest URL:</strong> <code className="bg-gray-100 px-1 rounded">/api/manifest.webmanifest</code>
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  The manifest is automatically generated from these fields and available at the URL above.
                </p>
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
                {isSaving ? 'Saving...' : 'Save Browser Assets'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<BrowserAssetsEditorProps> = async (context) => {
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

  // Load existing browser assets
  let initialAssets: BrowserAssets | null = null;
  
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:assets')
      .eq('status', 'published')
      .single();

    if (!error && data?.data) {
      const { browserAssetsSchema } = await import('@/lib/contentValidators');
      const validationResult = browserAssetsSchema.safeParse(data.data);
      if (validationResult.success) {
        initialAssets = validationResult.data;
      }
    }
  } catch (error) {
    // If load fails, use null (will show empty form)
    console.warn('[Browser Assets Editor] Failed to load existing assets:', error);
  }

  return {
    props: {
      user,
      initialAssets,
    },
  };
};
