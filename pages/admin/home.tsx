/**
 * TEMP / DEV ONLY - Home Content Editor
 * 
 * This page provides a form-based editor for home content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access.
 * TEMP/DEV ONLY: Home Hero Editor (Phase 1) + Feature Sections Editor (Phase 2)
 * 
 * Phase 1: Hero section ✓
 * Phase 2: Feature sections ✓
 * Phase 3: Grid sections ✓
 * Phase 4: CTA section ✓
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { getHomeContent } from '@/lib/contentApi';
import { HomeContent, ButtonConfig, FeatureSection, FeatureSlide, GridSection, GridItem, ButtonVariant } from '@/lib/contentTypes';

interface HomeEditorProps {
  user: AuthenticatedUser;
  initialContent: HomeContent;
}

export default function HomeEditor({ user, initialContent }: HomeEditorProps) {
  const [formState, setFormState] = useState<HomeContent>(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hero section update functions
  const updateHero = (field: 'title' | 'description', value: string) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const updateHeroImage = (field: 'desktop' | 'mobile', value: string) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        images: {
          ...prev.hero.images,
          [field]: value,
        },
      },
    }));
  };

  // Hero button functions
  const updateHeroButton = (
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: prev.hero.buttons.map((btn, idx) =>
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
        buttons: [...prev.hero.buttons, newButton],
      },
    }));
  };

  const removeHeroButton = (buttonIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: prev.hero.buttons.filter((_, idx) => idx !== buttonIndex),
      },
    }));
  };

  // Feature section update functions
  const updateFeatureSection = (
    sectionIndex: number,
    field: 'title' | 'description',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex ? { ...section, [field]: value } : section
      ),
    }));
  };

  const initializeFeatureSectionImages = (sectionIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              images: section.images || { desktop: '', mobile: '' },
            }
          : section
      ),
    }));
  };

  const updateFeatureSectionImage = (
    sectionIndex: number,
    field: 'desktop' | 'mobile',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              images: {
                ...(section.images || { desktop: '', mobile: '' }),
                [field]: value,
              },
            }
          : section
      ),
    }));
  };

  const updateFeatureSectionButton = (
    sectionIndex: number,
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              buttons: (section.buttons || []).map((btn, bIdx) =>
                bIdx === buttonIndex ? { ...btn, [field]: value } : btn
              ),
            }
          : section
      ),
    }));
  };

  const addFeatureSectionButton = (sectionIndex: number) => {
    const newButton: ButtonConfig = {
      label: '',
      variant: 'primary',
      href: '',
    };
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              buttons: [...(section.buttons || []), newButton],
            }
          : section
      ),
    }));
  };

  const removeFeatureSectionButton = (sectionIndex: number, buttonIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              buttons: (section.buttons || []).filter((_, bIdx) => bIdx !== buttonIndex),
            }
          : section
      ),
    }));
  };

  // Slide functions
  const updateSlide = (
    sectionIndex: number,
    slideIndex: number,
    field: 'title' | 'description',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).map((slide, sIdx) =>
                sIdx === slideIndex ? { ...slide, [field]: value } : slide
              ),
            }
          : section
      ),
    }));
  };

  const updateSlideImage = (
    sectionIndex: number,
    slideIndex: number,
    field: 'desktop' | 'mobile',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).map((slide, sIdx) =>
                sIdx === slideIndex
                  ? {
                      ...slide,
                      images: {
                        ...(slide.images || { desktop: '', mobile: '' }),
                        [field]: value,
                      },
                    }
                  : slide
              ),
            }
          : section
      ),
    }));
  };

  const updateSlideButton = (
    sectionIndex: number,
    slideIndex: number,
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).map((slide, sIdx) =>
                sIdx === slideIndex
                  ? {
                      ...slide,
                      buttons: (slide.buttons || []).map((btn, bIdx) =>
                        bIdx === buttonIndex ? { ...btn, [field]: value } : btn
                      ),
                    }
                  : slide
              ),
            }
          : section
      ),
    }));
  };

  const addSlideButton = (sectionIndex: number, slideIndex: number) => {
    const newButton: ButtonConfig = {
      label: '',
      variant: 'primary',
      href: '',
    };
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).map((slide, sIdx) =>
                sIdx === slideIndex
                  ? {
                      ...slide,
                      buttons: [...(slide.buttons || []), newButton],
                    }
                  : slide
              ),
            }
          : section
      ),
    }));
  };

  const removeSlideButton = (sectionIndex: number, slideIndex: number, buttonIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).map((slide, sIdx) =>
                sIdx === slideIndex
                  ? {
                      ...slide,
                      buttons: (slide.buttons || []).filter((_, bIdx) => bIdx !== buttonIndex),
                    }
                  : slide
              ),
            }
          : section
      ),
    }));
  };

  const addSlide = (sectionIndex: number) => {
    // Generate UUID - use window.crypto if available, otherwise fallback
    const generateId = () => {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
      return `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };
    
    const newSlide: FeatureSlide = {
      id: generateId(),
      title: '',
      description: '',
      images: { desktop: '', mobile: '' },
      buttons: [],
    };
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: [...(section.slides || []), newSlide],
            }
          : section
      ),
    }));
  };

  const removeSlide = (sectionIndex: number, slideIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              slides: (section.slides || []).filter((_, sIdx) => sIdx !== slideIndex),
            }
          : section
      ),
    }));
  };

  // Add/remove feature sections
  const addFeatureSection = () => {
    const newSection: FeatureSection = {
      title: '',
      description: '',
      buttons: [],
      images: { desktop: '', mobile: '' },
      slides: [],
    };
    setFormState((prev) => ({
      ...prev,
      featureSections: [...prev.featureSections, newSection],
    }));
  };

  const removeFeatureSection = (sectionIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      featureSections: prev.featureSections.filter((_, idx) => idx !== sectionIndex),
    }));
  };

  // Grid section update functions
  const updateGridItem = (
    sectionIndex: number,
    itemIndex: number,
    field: 'title' | 'description' | 'image',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, iIdx) =>
                iIdx === itemIndex ? { ...item, [field]: value } : item
              ),
            }
          : section
      ),
    }));
  };

  const updateGridItemButton = (
    sectionIndex: number,
    itemIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, iIdx) =>
                iIdx === itemIndex
                  ? {
                      ...item,
                      button: item.button
                        ? { ...item.button, [field]: value }
                        : { label: '', href: '', variant: 'primary' as ButtonVariant, [field]: value },
                    }
                  : item
              ),
            }
          : section
      ),
    }));
  };

  const initializeGridItemButton = (sectionIndex: number, itemIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, iIdx) =>
                iIdx === itemIndex
                  ? {
                      ...item,
                      button: { label: '', href: '', variant: 'primary' as ButtonVariant },
                    }
                  : item
              ),
            }
          : section
      ),
    }));
  };

  const removeGridItemButton = (sectionIndex: number, itemIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, iIdx) =>
                iIdx === itemIndex ? { ...item, button: undefined } : item
              ),
            }
          : section
      ),
    }));
  };

  const addGridItem = (sectionIndex: number) => {
    const newItem: GridItem = {
      title: '',
      description: '',
      image: '',
      button: undefined,
    };
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: [...section.items, newItem],
            }
          : section
      ),
    }));
  };

  const removeGridItem = (sectionIndex: number, itemIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).map((section, sIdx) =>
        sIdx === sectionIndex
          ? {
              ...section,
              items: section.items.filter((_, iIdx) => iIdx !== itemIndex),
            }
          : section
      ),
    }));
  };

  const addGridSection = () => {
    const newSection: GridSection = {
      items: [],
    };
    setFormState((prev) => ({
      ...prev,
      gridSections: [...(prev.gridSections || []), newSection],
    }));
  };

  const removeGridSection = (sectionIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      gridSections: (prev.gridSections || []).filter((_, idx) => idx !== sectionIndex),
    }));
  };

  // CTA section update functions
  const updateCtaField = (field: 'title' | 'description', value: string) => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        [field]: value,
      },
    }));
  };

  const initializeCtaImages = () => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        images: prev.ctaSection.images || { desktop: '', mobile: '' },
      },
    }));
  };

  const updateCtaImage = (field: 'desktop' | 'mobile', value: string) => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        images: {
          ...(prev.ctaSection.images || { desktop: '', mobile: '' }),
          [field]: value,
        },
      },
    }));
  };

  const initializeCtaButton = () => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        button: { label: '', href: '', variant: 'primary' as ButtonVariant },
      },
    }));
  };

  const updateCtaButtonField = (field: 'label' | 'href' | 'variant', value: string) => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        button: prev.ctaSection.button
          ? { ...prev.ctaSection.button, [field]: value }
          : { label: '', href: '', variant: 'primary' as ButtonVariant, [field]: value },
      },
    }));
  };

  const removeCtaButton = () => {
    setFormState((prev) => ({
      ...prev,
      ctaSection: {
        ...prev.ctaSection,
        button: undefined,
      },
    }));
  };

  // Collapsible section state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedSlides, setExpandedSlides] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSlides = (key: string) => {
    setExpandedSlides((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/admin/home', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Home content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save home content',
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
        <title>Edit Home Content • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Edit Home Content</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Home Content'}
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> If Supabase write fails, the live site may still show fallback JSON.
              </p>
              <p className="text-xs text-blue-700 mt-1">
                <strong>Phase 1:</strong> Hero section ✓ | <strong>Phase 2:</strong> Feature sections ✓ | <strong>Phase 3:</strong> Grid sections ✓ | <strong>Phase 4:</strong> CTA section ✓
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
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formState.hero.title}
                  onChange={(e) => updateHero('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formState.hero.description}
                  onChange={(e) => updateHero('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Hero Images */}
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Images</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Desktop Image URL
                    </label>
                    <input
                      type="text"
                      value={formState.hero.images.desktop}
                      onChange={(e) => updateHeroImage('desktop', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/images/home/hero-desktop.jpg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mobile Image URL
                    </label>
                    <input
                      type="text"
                      value={formState.hero.images.mobile}
                      onChange={(e) => updateHeroImage('mobile', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/images/home/hero-mobile.jpg"
                    />
                  </div>
                </div>
              </div>

              {/* Hero Buttons */}
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
                  {formState.hero.buttons.map((button, buttonIndex) => (
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
                  {formState.hero.buttons.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No buttons added yet. Click "Add Button" to add one.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Feature Sections */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Feature Sections</h2>
              <button
                type="button"
                onClick={addFeatureSection}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                + Add Feature Section
              </button>
            </div>
            <div className="space-y-4">
              {formState.featureSections.map((featureSection, sectionIndex) => {
                const sectionKey = `feature-${sectionIndex}`;
                const slidesKey = `${sectionKey}-slides`;
                return (
                  <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className="flex items-center justify-between w-full text-left"
                      >
                        <h3 className="text-lg font-medium text-gray-800">
                          Feature Section #{sectionIndex + 1}
                        </h3>
                        <span className="text-gray-500">{expandedSections[sectionKey] ? '−' : '+'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFeatureSection(sectionIndex)}
                        className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove Section
                      </button>
                    </div>
                    {expandedSections[sectionKey] && (
                      <div className="space-y-4 mt-4">
                        {/* Title */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                          <input
                            type="text"
                            value={featureSection.title || ''}
                            onChange={(e) => updateFeatureSection(sectionIndex, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={featureSection.description || ''}
                            onChange={(e) => updateFeatureSection(sectionIndex, 'description', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* Images */}
                        <div className="pt-4 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-md font-medium text-gray-800">Images</h4>
                            {!featureSection.images && (
                              <button
                                type="button"
                                onClick={() => initializeFeatureSectionImages(sectionIndex)}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                              >
                                + Add Images Block
                              </button>
                            )}
                          </div>
                          {featureSection.images && (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Desktop Image URL
                                </label>
                                <input
                                  type="text"
                                  value={featureSection.images.desktop}
                                  onChange={(e) => updateFeatureSectionImage(sectionIndex, 'desktop', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Mobile Image URL
                                </label>
                                <input
                                  type="text"
                                  value={featureSection.images.mobile}
                                  onChange={(e) => updateFeatureSectionImage(sectionIndex, 'mobile', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Buttons */}
                        <div className="pt-4 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-md font-medium text-gray-800">Buttons</h4>
                            <button
                              type="button"
                              onClick={() => addFeatureSectionButton(sectionIndex)}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              + Add Button
                            </button>
                          </div>
                          <div className="space-y-3">
                            {(featureSection.buttons || []).map((button, buttonIndex) => (
                              <div
                                key={buttonIndex}
                                className="flex gap-2 items-end border border-gray-200 rounded p-3 bg-white"
                              >
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                                  <input
                                    type="text"
                                    value={button.label}
                                    onChange={(e) => updateFeatureSectionButton(sectionIndex, buttonIndex, 'label', e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Variant</label>
                                  <select
                                    value={button.variant}
                                    onChange={(e) => updateFeatureSectionButton(sectionIndex, buttonIndex, 'variant', e.target.value)}
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
                                    onChange={(e) => updateFeatureSectionButton(sectionIndex, buttonIndex, 'href', e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFeatureSectionButton(sectionIndex, buttonIndex)}
                                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            {(featureSection.buttons || []).length === 0 && (
                              <p className="text-sm text-gray-500 italic">No buttons added yet.</p>
                            )}
                          </div>
                        </div>

                        {/* Slides */}
                        <div className="pt-4 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-md font-medium text-gray-800">
                              Slides ({(featureSection.slides || []).length})
                            </h4>
                            <button
                              type="button"
                              onClick={() => toggleSlides(slidesKey)}
                              className="text-sm text-gray-600 hover:text-gray-800"
                            >
                              {expandedSlides[slidesKey] ? '−' : '+'}
                            </button>
                          </div>
                          {expandedSlides[slidesKey] && (
                            <div className="space-y-4 mt-3">
                              {(featureSection.slides || []).map((slide, slideIndex) => (
                                <div key={slide.id || slideIndex} className="border border-gray-200 rounded p-3 bg-white">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-700">
                                      Slide {slideIndex + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeSlide(sectionIndex, slideIndex)}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Remove Slide
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    {/* Slide ID (read-only) */}
                                    {slide.id && (
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                          ID (read-only)
                                        </label>
                                        <input
                                          type="text"
                                          value={slide.id}
                                          disabled
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                        />
                                      </div>
                                    )}

                                    {/* Slide Title */}
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                      <input
                                        type="text"
                                        value={slide.title || ''}
                                        onChange={(e) => updateSlide(sectionIndex, slideIndex, 'title', e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Slide Description */}
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                      <textarea
                                        value={slide.description || ''}
                                        onChange={(e) => updateSlide(sectionIndex, slideIndex, 'description', e.target.value)}
                                        rows={2}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Slide Images */}
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-2">Images</label>
                                      <div className="space-y-2">
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">Desktop</label>
                                          <input
                                            type="text"
                                            value={slide.images?.desktop || ''}
                                            onChange={(e) => updateSlideImage(sectionIndex, slideIndex, 'desktop', e.target.value)}
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">Mobile</label>
                                          <input
                                            type="text"
                                            value={slide.images?.mobile || ''}
                                            onChange={(e) => updateSlideImage(sectionIndex, slideIndex, 'mobile', e.target.value)}
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Slide Buttons */}
                                    <div className="pt-2 border-t border-gray-200">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-gray-600">Buttons</span>
                                        <button
                                          type="button"
                                          onClick={() => addSlideButton(sectionIndex, slideIndex)}
                                          className="text-xs text-blue-600 hover:text-blue-800"
                                        >
                                          + Add Button
                                        </button>
                                      </div>
                                      <div className="space-y-2">
                                        {(slide.buttons || []).map((button, buttonIndex) => (
                                          <div
                                            key={buttonIndex}
                                            className="flex gap-2 items-end border border-gray-200 rounded p-2 bg-gray-50"
                                          >
                                            <div className="flex-1">
                                              <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                                              <input
                                                type="text"
                                                value={button.label}
                                                onChange={(e) => updateSlideButton(sectionIndex, slideIndex, buttonIndex, 'label', e.target.value)}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                              />
                                            </div>
                                            <div className="flex-1">
                                              <label className="block text-xs font-medium text-gray-600 mb-1">Variant</label>
                                              <select
                                                value={button.variant}
                                                onChange={(e) => updateSlideButton(sectionIndex, slideIndex, buttonIndex, 'variant', e.target.value)}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
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
                                                onChange={(e) => updateSlideButton(sectionIndex, slideIndex, buttonIndex, 'href', e.target.value)}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                              />
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => removeSlideButton(sectionIndex, slideIndex, buttonIndex)}
                                              className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addSlide(sectionIndex)}
                                className="w-full px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                              >
                                + Add Slide
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {formState.featureSections.length === 0 && (
                <p className="text-sm text-gray-500 italic text-center py-4">
                  No feature sections yet. Click "Add Feature Section" to create one.
                </p>
              )}
            </div>
          </section>

          {/* Grid Sections */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Grid Sections</h2>
              <button
                type="button"
                onClick={addGridSection}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                + Add Grid Section
              </button>
            </div>
            <div className="space-y-4">
              {formState.gridSections && formState.gridSections.length > 0 ? (
                formState.gridSections.map((gridSection, sectionIndex) => {
                  const gridSectionKey = `grid-${sectionIndex}`;
                  return (
                    <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <button
                          type="button"
                          onClick={() => toggleSection(gridSectionKey)}
                          className="flex items-center justify-between w-full text-left"
                        >
                          <h3 className="text-lg font-medium text-gray-800">
                            Grid Section #{sectionIndex + 1}
                          </h3>
                          <span className="text-gray-500">{expandedSections[gridSectionKey] ? '−' : '+'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGridSection(sectionIndex)}
                          className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove Section
                        </button>
                      </div>
                      {expandedSections[gridSectionKey] && (
                        <div className="space-y-4 mt-4">
                          {/* Items */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-md font-medium text-gray-800">
                                Items ({gridSection.items.length})
                              </h4>
                              <button
                                type="button"
                                onClick={() => addGridItem(sectionIndex)}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                              >
                                + Add Item
                              </button>
                            </div>
                            <div className="space-y-4">
                              {gridSection.items.map((item, itemIndex) => (
                                <div key={itemIndex} className="border border-gray-200 rounded p-3 bg-white">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-700">
                                      Item #{itemIndex + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeGridItem(sectionIndex, itemIndex)}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Remove Item
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    {/* Title */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                      <input
                                        type="text"
                                        value={item.title || ''}
                                        onChange={(e) => updateGridItem(sectionIndex, itemIndex, 'title', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Description */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                      <textarea
                                        value={item.description || ''}
                                        onChange={(e) => updateGridItem(sectionIndex, itemIndex, 'description', e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Image */}
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                                      <input
                                        type="text"
                                        value={item.image || ''}
                                        onChange={(e) => updateGridItem(sectionIndex, itemIndex, 'image', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Button */}
                                    <div className="pt-3 border-t border-gray-200">
                                      <div className="flex items-center justify-between mb-3">
                                        <h5 className="text-sm font-medium text-gray-700">Button</h5>
                                        {!item.button ? (
                                          <button
                                            type="button"
                                            onClick={() => initializeGridItemButton(sectionIndex, itemIndex)}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                          >
                                            + Add Button
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => removeGridItemButton(sectionIndex, itemIndex)}
                                            className="text-sm text-red-600 hover:text-red-800 font-medium"
                                          >
                                            Remove Button
                                          </button>
                                        )}
                                      </div>
                                      {item.button && (
                                        <div className="space-y-3">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                                            <input
                                              type="text"
                                              value={item.button.label}
                                              onChange={(e) => updateGridItemButton(sectionIndex, itemIndex, 'label', e.target.value)}
                                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Variant</label>
                                            <select
                                              value={item.button.variant}
                                              onChange={(e) => updateGridItemButton(sectionIndex, itemIndex, 'variant', e.target.value)}
                                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                              <option value="primary">Primary</option>
                                              <option value="secondary">Secondary</option>
                                              <option value="tertiary">Tertiary</option>
                                              <option value="quaternary">Quaternary</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                                            <input
                                              type="text"
                                              value={item.button.href}
                                              onChange={(e) => updateGridItemButton(sectionIndex, itemIndex, 'href', e.target.value)}
                                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {gridSection.items.length === 0 && (
                                <p className="text-sm text-gray-500 italic text-center py-4">
                                  No items yet. Click "Add Item" to create one.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 italic text-center py-4">
                  No grid sections yet. Click "Add Grid Section" to create one.
                </p>
              )}
            </div>
          </section>

          {/* CTA Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">CTA Section</h2>
            {formState.ctaSection ? (
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={formState.ctaSection.title}
                    onChange={(e) => updateCtaField('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formState.ctaSection.description || ''}
                    onChange={(e) => updateCtaField('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Images */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-medium text-gray-800">Images</h3>
                    {!formState.ctaSection.images && (
                      <button
                        type="button"
                        onClick={initializeCtaImages}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Add Images Block
                      </button>
                    )}
                  </div>
                  {formState.ctaSection.images && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Desktop Image URL
                        </label>
                        <input
                          type="text"
                          value={formState.ctaSection.images.desktop}
                          onChange={(e) => updateCtaImage('desktop', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="/images/home/cta-desktop.jpg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mobile Image URL
                        </label>
                        <input
                          type="text"
                          value={formState.ctaSection.images.mobile}
                          onChange={(e) => updateCtaImage('mobile', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="/images/home/cta-mobile.jpg"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Button */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-medium text-gray-800">Button</h3>
                    {!formState.ctaSection.button ? (
                      <button
                        type="button"
                        onClick={initializeCtaButton}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        + Add Button
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={removeCtaButton}
                        className="text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove Button
                      </button>
                    )}
                  </div>
                  {formState.ctaSection.button && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                        <input
                          type="text"
                          value={formState.ctaSection.button.label}
                          onChange={(e) => updateCtaButtonField('label', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Variant</label>
                        <select
                          value={formState.ctaSection.button.variant}
                          onChange={(e) => updateCtaButtonField('variant', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                          <option value="tertiary">Tertiary</option>
                          <option value="quaternary">Quaternary</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                        <input
                          type="text"
                          value={formState.ctaSection.button.href}
                          onChange={(e) => updateCtaButtonField('href', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">No CTA section configured.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFormState((prev) => ({
                      ...prev,
                      ctaSection: {
                        title: '',
                        description: '',
                        button: undefined,
                        images: { desktop: '', mobile: '' },
                      },
                    }));
                  }}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Add CTA Section
                </button>
              </div>
            )}
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
                {isSaving ? 'Saving...' : 'Save Home Content'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HomeEditorProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/home',
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

  const homeContent = await getHomeContent();

  return {
    props: {
      user,
      initialContent: homeContent,
    },
  };
};

