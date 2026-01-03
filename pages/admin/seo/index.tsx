/**
 * SEO Global Configuration Editor
 * 
 * Admin-only page for managing global SEO defaults.
 * Protected with role-based access control (admin only).
 * 
 * ============================================================================
 * MANUAL TEST CHECKLIST
 * ============================================================================
 * 
 * 1. Saving/Loading:
 *    - Load page: Should show existing config or defaults
 *    - Edit fields: Changes should persist in form state
 *    - Click "Save SEO Configuration": Should show success message
 *    - Refresh page: Saved values should load correctly
 *    - Test validation: Try invalid URLs, empty required fields
 * 
 * 2. Tags in Rendered HTML (View Source):
 *    - Visit homepage (/)
 *    - View page source (Ctrl+U / Cmd+Option+U)
 *    - Verify <title> tag matches configured titleTemplate
 *    - Verify <meta name="description"> matches configured defaultDescription
 *    - Verify <link rel="canonical"> is absolute URL with correct base
 *    - Verify OG tags (og:title, og:description, og:image if set)
 *    - Verify Twitter tags (twitter:card, twitter:title, twitter:description)
 * 
 * 3. ISR Behavior (SEO Updates Propagation):
 *    - Save SEO config change in admin
 *    - Visit homepage immediately: May show old cached version
 *    - Wait up to 300 seconds (5 minutes): Next request triggers background regeneration
 *    - After regeneration: New SEO tags should appear
 *    - Note: ISR revalidate is 300s, so changes may take up to 5 minutes to appear
 *    - For immediate testing: Use Next.js on-demand revalidation or wait for ISR window
 * 
 * 4. Route-Specific Overrides (Future):
 *    - Per-route SEO configs use key format: "seo:route:/path"
 *    - Route paths are normalized (leading "/", no trailing "/", no query/hash)
 *    - Example: "/category/program-name" (not "/category/program-name/")
 *    - Route overrides merge over global defaults
 * 
 * ============================================================================
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { SeoGlobalConfig } from '@/lib/contentTypes';

interface SeoEditorProps {
  user: AuthenticatedUser;
  initialConfig: SeoGlobalConfig | null;
}

const DEFAULT_CONFIG: SeoGlobalConfig = {
  siteName: 'Fine Diet',
  titleTemplate: '{{pageTitle}} | {{siteName}}',
  defaultTitle: 'Fine Diet • Read your body. Reset your health.',
  defaultDescription: 'Bridging everyday wellness with real nutrition strategy and lifestyle therapy so you don\'t have to figure it out alone.',
  canonicalBase: 'https://myfinediet.com',
  twitterCard: 'summary_large_image',
  robots: 'index,follow',
};

export default function SeoEditor({ user, initialConfig }: SeoEditorProps) {
  const [formState, setFormState] = useState<SeoGlobalConfig>(initialConfig || DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Validate and show warnings
  useEffect(() => {
    const newWarnings: string[] = [];
    
    if (formState.defaultTitle.length > 70) {
      newWarnings.push('Default title exceeds 70 characters (recommended for SEO)');
    }
    if (formState.defaultDescription.length > 160) {
      newWarnings.push('Default description exceeds 160 characters (recommended for SEO)');
    }
    if (formState.ogImage && !formState.ogImage.startsWith('http')) {
      newWarnings.push('OG Image must be an absolute URL (starting with http:// or https://)');
    }
    
    setWarnings(newWarnings);
  }, [formState]);

  const updateField = <K extends keyof SeoGlobalConfig>(field: K, value: SeoGlobalConfig[K]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/seo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'SEO configuration saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save SEO configuration',
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
        <title>SEO Configuration • Admin • Fine Diet</title>
      </Head>
      <div className="px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Global SEO Defaults</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save SEO Configuration'}
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> These are site-wide defaults. Page-level SEO is edited inside each page's editor.
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-gray-900 mb-3">Page-Level SEO Editing:</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>
                  <Link href="/admin/navigation" className="text-blue-600 hover:text-blue-800 underline">
                    Edit Category SEO
                  </Link>
                </li>
                <li>
                  <Link href="/admin/products" className="text-blue-600 hover:text-blue-800 underline">
                    Edit Product SEO
                  </Link>
                </li>
                <li>
                  <Link href="/admin/seo/robots" className="text-blue-600 hover:text-blue-800 underline">
                    Edit Robots.txt
                  </Link>
                </li>
                <li>
                  <Link href="/admin/seo/assets" className="text-blue-600 hover:text-blue-800 underline">
                    Edit Browser Assets
                  </Link>
                </li>
              </ul>
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

          {/* Basic SEO Settings */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic SEO Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site Name *
                </label>
                <input
                  type="text"
                  value={formState.siteName}
                  onChange={(e) => updateField('siteName', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Used in title template and throughout the site</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title Template *
                </label>
                <input
                  type="text"
                  value={formState.titleTemplate}
                  onChange={(e) => updateField('titleTemplate', e.target.value)}
                  required
                  placeholder="{{pageTitle}} | {{siteName}}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {'{{pageTitle}}'} and {'{{siteName}}'} as placeholders
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Title *
                </label>
                <input
                  type="text"
                  value={formState.defaultTitle}
                  onChange={(e) => updateField('defaultTitle', e.target.value)}
                  required
                  maxLength={70}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formState.defaultTitle.length}/70 characters (recommended max)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Description *
                </label>
                <textarea
                  value={formState.defaultDescription}
                  onChange={(e) => updateField('defaultDescription', e.target.value)}
                  required
                  rows={3}
                  maxLength={160}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formState.defaultDescription.length}/160 characters (recommended max)
                </p>
              </div>
            </div>
          </section>

          {/* Canonical & URLs */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Canonical & URLs</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Canonical Base URL *
                </label>
                <input
                  type="url"
                  value={formState.canonicalBase}
                  onChange={(e) => updateField('canonicalBase', e.target.value)}
                  required
                  placeholder="https://myfinediet.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Base URL for canonical links (must be absolute)</p>
              </div>
            </div>
          </section>

          {/* Social Media */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Social Media (Open Graph & Twitter)</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OG Image (optional)
                </label>
                <input
                  type="url"
                  value={formState.ogImage || ''}
                  onChange={(e) => updateField('ogImage', e.target.value || undefined)}
                  placeholder="https://myfinediet.com/images/og-image.jpg"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Absolute URL to default Open Graph image (1200x630px recommended)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Twitter Card Type
                </label>
                <select
                  value={formState.twitterCard || 'summary_large_image'}
                  onChange={(e) => updateField('twitterCard', e.target.value as 'summary' | 'summary_large_image')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="summary">Summary</option>
                  <option value="summary_large_image">Summary Large Image</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Default Twitter card format</p>
              </div>
            </div>
          </section>

          {/* Robots */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Robots Meta</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Robots (optional)
                </label>
                <input
                  type="text"
                  value={formState.robots || 'index,follow'}
                  onChange={(e) => updateField('robots', e.target.value || undefined)}
                  placeholder="index,follow"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Default robots meta tag (e.g., "index,follow", "noindex,nofollow")</p>
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
                {isSaving ? 'Saving...' : 'Save SEO Configuration'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<SeoEditorProps> = async (context) => {
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

  // Load existing SEO config
  let initialConfig: SeoGlobalConfig | null = null;
  
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:global')
      .eq('status', 'published')
      .single();

    if (!error && data?.data) {
      const { seoGlobalConfigSchema } = await import('@/lib/contentValidators');
      const validationResult = seoGlobalConfigSchema.safeParse(data.data);
      if (validationResult.success) {
        initialConfig = validationResult.data;
      }
    }
  } catch (error) {
    // If load fails, use null (will show defaults)
    console.warn('[SEO Editor] Failed to load existing config:', error);
  }

  return {
    props: {
      user,
      initialConfig,
    },
  };
};
