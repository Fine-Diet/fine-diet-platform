/**
 * TEMP / DEV ONLY - Global Content Editor
 * 
 * This page provides a form-based editor for global site content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access.
 * TEMP/DEV ONLY: Global content editor
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getGlobalContent } from '@/lib/contentApi';
import { GlobalContent } from '@/lib/contentTypes';

interface GlobalEditorProps {
  initialContent: GlobalContent;
}

export default function GlobalEditor({ initialContent }: GlobalEditorProps) {
  const [formState, setFormState] = useState<GlobalContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateField = (field: 'siteName' | 'metaDefaultTitle' | 'metaDefaultDescription', value: string) => {
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
        <title>Edit Global Content • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Edit Global Content</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Global Content'}
              </button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold">
                ⚠️ TEMP / DEV ONLY - This route is not protected. Do not deploy to production without authentication.
              </p>
              <p className="text-xs text-red-700 mt-1">
                TODO: Protect this route with Supabase Auth and role-based access.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> If Supabase write fails, the live site may still show fallback JSON.
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Title</label>
                <input
                  type="text"
                  value={formState.metaDefaultTitle || ''}
                  onChange={(e) => updateField('metaDefaultTitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Meta Description</label>
                <textarea
                  value={formState.metaDefaultDescription || ''}
                  onChange={(e) => updateField('metaDefaultDescription', e.target.value)}
                  rows={3}
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
                {isSaving ? 'Saving...' : 'Save Global Content'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GlobalEditorProps> = async () => {
  const globalContent = await getGlobalContent();

  return {
    props: {
      initialContent: globalContent,
    },
  };
};

