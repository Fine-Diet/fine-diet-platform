/**
 * TEMP / DEV ONLY - Waitlist Content Editor
 * 
 * This page provides a form-based editor for waitlist content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access.
 * TEMP/DEV ONLY: Waitlist editor
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getWaitlistContent } from '@/lib/contentApi';
import { WaitlistContent } from '@/lib/contentTypes';

interface WaitlistEditorProps {
  user: AuthenticatedUser;
  initialContent: WaitlistContent;
}

export default function WaitlistEditor({ user, initialContent }: WaitlistEditorProps) {
  const [formState, setFormState] = useState<WaitlistContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateField = (field: keyof WaitlistContent, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Waitlist content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save waitlist content',
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
        <title>Edit Waitlist Content • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Edit Waitlist Content</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Waitlist Content'}
              </button>
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

          {/* Main Content */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Main Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={formState.subtitle || ''}
                  onChange={(e) => updateField('subtitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formState.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="text"
                  value={formState.image || ''}
                  onChange={(e) => updateField('image', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/images/waitlist/hero.jpg"
                />
              </div>
            </div>
          </section>

          {/* Form Content */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Form Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Form Headline</label>
                <input
                  type="text"
                  value={formState.formHeadline || ''}
                  onChange={(e) => updateField('formHeadline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Form Subheadline</label>
                <input
                  type="text"
                  value={formState.formSubheadline || ''}
                  onChange={(e) => updateField('formSubheadline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Success Message</label>
                <textarea
                  value={formState.successMessage || ''}
                  onChange={(e) => updateField('successMessage', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Form UI Content */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Form UI Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Success Title</label>
                <input
                  type="text"
                  value={formState.successTitle || ''}
                  onChange={(e) => updateField('successTitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="You're on the list!"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Label</label>
                <input
                  type="text"
                  value={formState.submitButtonLabel || ''}
                  onChange={(e) => updateField('submitButtonLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Join Waitlist"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Loading Label</label>
                <input
                  type="text"
                  value={formState.submitButtonLoadingLabel || ''}
                  onChange={(e) => updateField('submitButtonLoadingLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Submitting..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal Placeholder</label>
                <input
                  type="text"
                  value={formState.goalPlaceholder || ''}
                  onChange={(e) => updateField('goalPlaceholder', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Select a goal..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Privacy Note</label>
                <textarea
                  value={formState.privacyNote || ''}
                  onChange={(e) => updateField('privacyNote', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="We respect your privacy. Unsubscribe at any time."
                />
              </div>
            </div>
          </section>

          {/* Form Field Labels */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Form Field Labels</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Label</label>
                <input
                  type="text"
                  value={formState.emailLabel || ''}
                  onChange={(e) => updateField('emailLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name Label</label>
                <input
                  type="text"
                  value={formState.nameLabel || ''}
                  onChange={(e) => updateField('nameLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal Label</label>
                <input
                  type="text"
                  value={formState.goalLabel || ''}
                  onChange={(e) => updateField('goalLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Goal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Required Label</label>
                <input
                  type="text"
                  value={formState.requiredLabel || ''}
                  onChange={(e) => updateField('requiredLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="(required)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Optional Label</label>
                <input
                  type="text"
                  value={formState.optionalLabel || ''}
                  onChange={(e) => updateField('optionalLabel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="(optional)"
                />
              </div>
            </div>
          </section>

          {/* Form Field Placeholders */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Form Field Placeholders</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Placeholder</label>
                <input
                  type="text"
                  value={formState.emailPlaceholder || ''}
                  onChange={(e) => updateField('emailPlaceholder', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name Placeholder</label>
                <input
                  type="text"
                  value={formState.namePlaceholder || ''}
                  onChange={(e) => updateField('namePlaceholder', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your name"
                />
              </div>
            </div>
          </section>

          {/* Logo Settings */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Logo Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo Path</label>
                <input
                  type="text"
                  value={formState.logoPath || ''}
                  onChange={(e) => updateField('logoPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="/images/home/Fine-Diet-Logo.svg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo Alt Text</label>
                <input
                  type="text"
                  value={formState.logoAlt || ''}
                  onChange={(e) => updateField('logoAlt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Fine Diet"
                />
              </div>
            </div>
          </section>

          {/* SEO Content */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">SEO Content</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title</label>
                <input
                  type="text"
                  value={formState.seoTitle || ''}
                  onChange={(e) => updateField('seoTitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SEO Description</label>
                <textarea
                  value={formState.seoDescription || ''}
                  onChange={(e) => updateField('seoDescription', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                {isSaving ? 'Saving...' : 'Save Waitlist Content'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<WaitlistEditorProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/waitlist',
        permanent: false,
      },
    };
  }

  if (user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  const waitlistContent = await getWaitlistContent();

  return {
    props: {
      user,
      initialContent: waitlistContent,
    },
  };
};

