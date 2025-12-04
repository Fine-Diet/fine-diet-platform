/**
 * TEMP / DEV ONLY - Footer Content Editor
 * 
 * This page provides a form-based editor for footer content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getFooterContent } from '@/lib/contentApi';
import { FooterContent, FooterLink } from '@/lib/contentTypes';

interface FooterEditorProps {
  initialContent: FooterContent;
}

export default function FooterEditor({ initialContent }: FooterEditorProps) {
  const [formState, setFormState] = useState<FooterContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateNewsletter = (field: 'headline' | 'subheadline', value: string) => {
    setFormState((prev) => ({
      ...prev,
      newsletter: {
        ...prev.newsletter,
        [field]: value,
      },
    }));
  };

  const updateLinkSection = (
    section: 'explore' | 'resources' | 'connect',
    field: 'title' | 'links',
    value: string | FooterLink[]
  ) => {
    setFormState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const addLink = (section: 'explore' | 'resources' | 'connect' | 'legal') => {
    const newLink: FooterLink = { label: '', href: '' };
    if (section === 'legal') {
      setFormState((prev) => ({
        ...prev,
        legal: {
          ...prev.legal,
          links: [...prev.legal.links, newLink],
        },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          links: [...prev[section].links, newLink],
        },
      }));
    }
  };

  const removeLink = (section: 'explore' | 'resources' | 'connect' | 'legal', index: number) => {
    if (section === 'legal') {
      setFormState((prev) => ({
        ...prev,
        legal: {
          ...prev.legal,
          links: prev.legal.links.filter((_, i) => i !== index),
        },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          links: prev[section].links.filter((_, i) => i !== index),
        },
      }));
    }
  };

  const updateLink = (
    section: 'explore' | 'resources' | 'connect' | 'legal',
    index: number,
    field: 'label' | 'href',
    value: string
  ) => {
    if (section === 'legal') {
      setFormState((prev) => ({
        ...prev,
        legal: {
          ...prev.legal,
          links: prev.legal.links.map((link, i) =>
            i === index ? { ...link, [field]: value } : link
          ),
        },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          links: prev[section].links.map((link, i) =>
            i === index ? { ...link, [field]: value } : link
          ),
        },
      }));
    }
  };

  const updateLegalCopyright = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      legal: {
        ...prev.legal,
        copyright: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/footer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Footer content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save footer content',
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
        <title>Edit Footer • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Footer Content</h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold">
                ⚠️ TEMP / DEV ONLY - This route is not protected. Do not deploy to production without authentication.
              </p>
              <p className="text-xs text-red-700 mt-1">
                TODO: Protect this route with Supabase Auth and role-based access
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> If Supabase write fails, the live site may still show fallback JSON.
              </p>
            </div>
          </div>

          {/* Newsletter Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Newsletter</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Headline
                </label>
                <input
                  type="text"
                  value={formState.newsletter.headline}
                  onChange={(e) => updateNewsletter('headline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subheadline
                </label>
                <textarea
                  value={formState.newsletter.subheadline}
                  onChange={(e) => updateNewsletter('subheadline', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Explore Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Explore</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formState.explore.title}
                  onChange={(e) => updateLinkSection('explore', 'title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Links</label>
                  <button
                    type="button"
                    onClick={() => addLink('explore')}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Link
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.explore.links.map((link, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        placeholder="Label"
                        value={link.label}
                        onChange={(e) => updateLink('explore', index, 'label', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="URL"
                        value={link.href}
                        onChange={(e) => updateLink('explore', index, 'href', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink('explore', index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Resources Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Resources</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formState.resources.title}
                  onChange={(e) => updateLinkSection('resources', 'title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Links</label>
                  <button
                    type="button"
                    onClick={() => addLink('resources')}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Link
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.resources.links.map((link, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        placeholder="Label"
                        value={link.label}
                        onChange={(e) => updateLink('resources', index, 'label', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="URL"
                        value={link.href}
                        onChange={(e) => updateLink('resources', index, 'href', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink('resources', index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Connect Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Connect</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formState.connect.title}
                  onChange={(e) => updateLinkSection('connect', 'title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Links</label>
                  <button
                    type="button"
                    onClick={() => addLink('connect')}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Link
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.connect.links.map((link, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        placeholder="Label"
                        value={link.label}
                        onChange={(e) => updateLink('connect', index, 'label', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="URL"
                        value={link.href}
                        onChange={(e) => updateLink('connect', index, 'href', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink('connect', index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Legal Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Legal</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Links</label>
                  <button
                    type="button"
                    onClick={() => addLink('legal')}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Link
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.legal.links.map((link, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        placeholder="Label"
                        value={link.label}
                        onChange={(e) => updateLink('legal', index, 'label', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="URL"
                        value={link.href}
                        onChange={(e) => updateLink('legal', index, 'href', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink('legal', index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Copyright
                </label>
                <input
                  type="text"
                  value={formState.legal.copyright}
                  onChange={(e) => updateLegalCopyright(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Save Button */}
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
                {isSaving ? 'Saving...' : 'Save Footer Content'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<FooterEditorProps> = async () => {
  const footerContent = await getFooterContent();

  return {
    props: {
      initialContent: footerContent,
    },
  };
};

