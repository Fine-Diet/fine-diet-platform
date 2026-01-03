/**
 * Robots.txt Editor
 * 
 * Admin-only page for managing robots.txt content.
 * Protected with role-based access control (admin only).
 * 
 * Phase 1 / Step 3: CMS-backed robots.txt editor
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { RobotsContent } from '@/lib/contentTypes';

interface RobotsEditorProps {
  user: AuthenticatedUser;
  initialContent: RobotsContent | null;
}

const DEFAULT_ROBOTS = `User-agent: *
Allow: /`;

export default function RobotsEditor({ user, initialContent }: RobotsEditorProps) {
  const [formState, setFormState] = useState<string>(initialContent?.content || DEFAULT_ROBOTS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Validate and show warnings
  useEffect(() => {
    const newWarnings: string[] = [];
    
    if (formState.length > 5000) {
      newWarnings.push('Content exceeds 5000 characters (recommended max). Consider shortening.');
    }
    
    setWarnings(newWarnings);
  }, [formState]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/seo/robots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: formState.trim() || undefined, // Save empty string as undefined to allow deletion
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Robots.txt saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save robots.txt',
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
    if (confirm('Reset to default robots.txt? This will discard your current changes.')) {
      setFormState(DEFAULT_ROBOTS);
    }
  };

  return (
    <>
      <Head>
        <title>Robots.txt • SEO • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <a href="/admin/seo" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
                  ← Back to SEO Global
                </a>
                <h1 className="text-3xl font-bold text-gray-900">Robots.txt Editor</h1>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                >
                  Reset to Default
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Robots.txt'}
                </button>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> The Sitemap line will be automatically appended if missing. You don't need to include it manually.
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

          {/* Editor */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Robots.txt Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                  rows={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={DEFAULT_ROBOTS}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formState.length}/5000 characters
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  <strong>Tip:</strong> Common directives include User-agent, Allow, Disallow, and Crawl-delay.
                </p>
              </div>
            </div>
          </section>

          {/* Preview */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">
                {formState || DEFAULT_ROBOTS}
                {!formState.includes('Sitemap:') && (
                  <>
                    {'\n\nSitemap: https://myfinediet.com/sitemap.xml'}
                  </>
                )}
              </pre>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Note: Sitemap line will be automatically added if missing (shown in preview above).
            </p>
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
                {isSaving ? 'Saving...' : 'Save Robots.txt'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<RobotsEditorProps> = async (context) => {
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

  // Load existing robots content
  let initialContent: RobotsContent | null = null;
  
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { robotsContentSchema } = await import('@/lib/contentValidators');

    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'seo:robots')
      .eq('status', 'published')
      .single();

    if (!error && data?.data) {
      const validationResult = robotsContentSchema.safeParse(data.data);
      if (validationResult.success) {
        initialContent = validationResult.data;
      }
    }
  } catch (error) {
    // If load fails, use null (will show default)
    console.warn('[Robots Editor] Failed to load existing content:', error);
  }

  return {
    props: {
      user,
      initialContent,
    },
  };
};
