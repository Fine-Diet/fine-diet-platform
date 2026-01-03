/**
 * Global Settings Editor
 * 
 * Admin-only page for managing non-SEO global site settings:
 * - Site name
 * - Announcement bar
 * 
 * SEO settings are managed separately in /admin/seo.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getGlobalContent } from '@/lib/contentApi';
import { GlobalContent } from '@/lib/contentTypes';

interface GlobalEditorProps {
  user: AuthenticatedUser;
  initialContent: GlobalContent;
}

export default function GlobalEditor({ user, initialContent }: GlobalEditorProps) {
  const [formState, setFormState] = useState<GlobalContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateField = (field: 'siteName', value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAnnouncementBar = (field: 'enabled' | 'message' | 'href', value: boolean | string) => {
    setFormState((prev) => ({
      ...prev,
      announcementBar: {
        ...prev.announcementBar || { enabled: false, message: '' },
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Global content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save global content',
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
        <title>Global Settings • Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-50 px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link
              href="/admin/site-settings"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Site Settings
            </Link>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Global Settings</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Manage site-wide non-SEO settings. For SEO settings, visit{' '}
                  <Link href="/admin/seo" className="text-blue-600 hover:text-blue-800 underline">
                    SEO settings
                  </Link>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
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
          </div>

          {/* Site Info */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Site Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                <input
                  type="text"
                  value={formState.siteName || ''}
                  onChange={(e) => updateField('siteName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Announcement Bar */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Announcement Bar</h2>
            <div className="space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formState.announcementBar?.enabled || false}
                    onChange={(e) => updateAnnouncementBar('enabled', e.target.checked)}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Enable Announcement Bar</span>
                </label>
              </div>

              {formState.announcementBar?.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                    <input
                      type="text"
                      value={formState.announcementBar.message || ''}
                      onChange={(e) => updateAnnouncementBar('message', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Link URL (optional)</label>
                    <input
                      type="text"
                      value={formState.announcementBar.href || ''}
                      onChange={(e) => updateAnnouncementBar('href', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/some-page"
                    />
                  </div>
                </>
              )}
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
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GlobalEditorProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login?redirect=/admin/global',
        permanent: false,
      },
    };
  }

  const globalContent = await getGlobalContent();

  return {
    props: {
      user,
      initialContent: globalContent,
    },
  };
};

