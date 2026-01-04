/**
 * TEMP / DEV ONLY - Product Hero Editor
 * 
 * This page provides a form-based editor for product hero content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access.
 * TEMP/DEV ONLY: Product hero editor
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getProductPageContent } from '@/lib/contentApi';
import { ProductPageContent, ButtonConfig, ButtonVariant } from '@/lib/contentTypes';
import { ImageFieldWithPicker } from '@/components/admin/ImageFieldWithPicker';

interface ProductHeroEditorProps {
  user: AuthenticatedUser;
  slug: string;
  initialContent: ProductPageContent;
}

export default function ProductHeroEditor({ slug, initialContent }: ProductHeroEditorProps) {
  const [formState, setFormState] = useState<ProductPageContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updateHero = (field: 'title' | 'subtitle' | 'description', value: string) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const updateHeroImage = (field: 'imageDesktop' | 'imageMobile', value: string) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const updateHeroButton = (
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: (prev.hero.buttons || []).map((btn, idx) =>
          idx === buttonIndex ? { ...btn, [field]: value } : btn
        ),
      },
    }));
  };

  const addHeroButton = () => {
    const newButton: ButtonConfig = {
      label: '',
      variant: 'primary',
      href: '',
    };
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: [...(prev.hero.buttons || []), newButton],
      },
    }));
  };

  const removeHeroButton = (buttonIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: (prev.hero.buttons || []).filter((_, idx) => idx !== buttonIndex),
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Product content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save product content',
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
        <title>Edit Product Hero • {slug} • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Link href="/admin/products" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
                  ← Back to Products
                </Link>
                <h1 className="text-3xl font-bold text-gray-900">Edit Product: {slug}</h1>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Product Content'}
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Phase 1:</strong> Hero section only. Other sections (valueProps, sections, FAQ) are preserved but not editable yet.
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

          {/* Hero Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Hero Section</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formState.hero.title}
                  onChange={(e) => updateHero('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={formState.hero.subtitle || ''}
                  onChange={(e) => updateHero('subtitle', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formState.hero.description || ''}
                  onChange={(e) => updateHero('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Images</h3>
                <div className="space-y-4">
                  <ImageFieldWithPicker
                    value={formState.hero.imageDesktop || ''}
                    onChange={(url) => updateHeroImage('imageDesktop', url)}
                    label="Desktop Image URL"
                  />
                  <div>
                    <ImageFieldWithPicker
                      value={formState.hero.imageMobile || ''}
                      onChange={(url) => updateHeroImage('imageMobile', url)}
                      label="Mobile Image URL"
                    />
                    {formState.hero.imageDesktop && (
                      <button
                        type="button"
                        onClick={() => updateHeroImage('imageMobile', formState.hero.imageDesktop || '')}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Copy desktop to mobile
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-800">Buttons</h3>
                  <button
                    type="button"
                    onClick={addHeroButton}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Button
                  </button>
                </div>
                <div className="space-y-3">
                  {(formState.hero.buttons || []).map((button, buttonIndex) => (
                    <div
                      key={buttonIndex}
                      className="flex gap-2 items-end border border-gray-200 rounded p-3 bg-gray-50"
                    >
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                        <input
                          type="text"
                          value={button.label}
                          onChange={(e) => updateHeroButton(buttonIndex, 'label', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Variant</label>
                        <select
                          value={button.variant}
                          onChange={(e) => updateHeroButton(buttonIndex, 'variant', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          <option value="tertiary">Tertiary</option>
                          <option value="quaternary">Quaternary</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                        <input
                          type="text"
                          value={button.href}
                          onChange={(e) => updateHeroButton(buttonIndex, 'href', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHeroButton(buttonIndex)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {(formState.hero.buttons || []).length === 0 && (
                    <p className="text-sm text-gray-500 italic">No buttons added yet.</p>
                  )}
                </div>
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
                {isSaving ? 'Saving...' : 'Save Product Content'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ProductHeroEditorProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    const slug = context.params?.slug as string;
    return {
      redirect: {
        destination: `/login?redirect=/admin/products/${slug}/hero`,
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

  const slug = context.params?.slug as string;

  if (!slug) {
    return { notFound: true };
  }

  const productContent = await getProductPageContent(slug);

  if (!productContent) {
    // Return default content if product doesn't exist
    return {
      props: {
        user,
        slug,
        initialContent: {
          hero: {
            title: '',
            subtitle: '',
            description: '',
            imageDesktop: '',
            imageMobile: '',
            buttons: [],
          },
          valueProps: [],
          sections: [],
          faq: [],
          seo: {},
        },
      },
    };
  }

  return {
    props: {
      user,
      slug,
      initialContent: productContent,
    },
  };
};

