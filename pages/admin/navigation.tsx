/**
 * TEMP / DEV ONLY - Navigation Content Editor
 * 
 * This page provides a form-based editor for navigation content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access
 * TEMP/DEV ONLY: Navigation editor
 * 
 * Phase 2: Extended editing for subcategories, items, prospectProduct, and sections
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getNavigationContent } from '@/lib/contentApi';
import {
  NavigationContent,
  NavigationCategory,
  NavigationSubcategory,
  NavigationItem,
  NavigationProspectProduct,
  ButtonConfig,
  PricingCard,
} from '@/lib/contentTypes';

interface NavigationEditorProps {
  initialContent: NavigationContent;
}

// Helper to generate IDs
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper to normalize navigation content, ensuring all required fields are present
const normalizeNavigationContent = (content: NavigationContent): NavigationContent => {
  return {
    ...content,
    categories: content.categories.map((category) => ({
      ...category,
      prospectProduct: {
        ...category.prospectProduct,
        badge: category.prospectProduct.badge ?? '', // Ensure badge is always a string
      },
    })),
  };
};

export default function NavigationEditor({ initialContent }: NavigationEditorProps) {
  const [formState, setFormState] = useState<NavigationContent>(normalizeNavigationContent(initialContent));
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Collapsible section state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateTopLink = (link: 'journal' | 'account', field: 'label' | 'href', value: string) => {
    setFormState((prev) => ({
      ...prev,
      topLinks: {
        ...prev.topLinks,
        [link]: {
          ...prev.topLinks[link],
          [field]: value,
        },
      },
    }));
  };

  const updateCategory = (
    categoryIndex: number,
    field: 'label' | 'headline' | 'subtitle',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex
          ? { ...cat, [field]: value }
          : cat
      ),
    }));
  };

  const updateCategoryLayout = (
    categoryIndex: number,
    field: 'showHero' | 'showGrid' | 'showCTA',
    value: boolean
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex
          ? {
              ...cat,
              layout: {
                ...cat.layout,
                [field]: value,
              },
            }
          : cat
      ),
    }));
  };

  // Subcategory functions
  const updateSubcategoryName = (categoryIndex: number, subcategoryIndex: number, value: string) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex ? { ...sub, name: value } : sub
              ),
            }
          : cat
      ),
    }));
  };

  const addSubcategory = (categoryIndex: number) => {
    const newSubcategory: NavigationSubcategory = {
      id: generateId('subcat'),
      name: '',
      items: [],
    };
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex
          ? {
              ...cat,
              subcategories: [...cat.subcategories, newSubcategory],
            }
          : cat
      ),
    }));
  };

  const removeSubcategory = (categoryIndex: number, subcategoryIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.filter((_, sIdx) => sIdx !== subcategoryIndex),
            }
          : cat
      ),
    }));
  };

  // Item functions
  const updateItem = (
    categoryIndex: number,
    subcategoryIndex: number,
    itemIndex: number,
    field: 'title' | 'description' | 'href' | 'image',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.map((item, iIdx) =>
                        iIdx === itemIndex ? { ...item, [field]: value } : item
                      ),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  const updateItemAvailable = (
    categoryIndex: number,
    subcategoryIndex: number,
    itemIndex: number,
    value: boolean
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.map((item, iIdx) =>
                        iIdx === itemIndex ? { ...item, available: value } : item
                      ),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  const addItem = (categoryIndex: number, subcategoryIndex: number) => {
    const newItem: NavigationItem = {
      id: generateId('item'),
      type: 'program',
      title: '',
      description: '',
      image: '',
      href: '',
      available: true,
      buttons: [],
    };
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: [...sub.items, newItem],
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  const removeItem = (categoryIndex: number, subcategoryIndex: number, itemIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.filter((_, iIdx) => iIdx !== itemIndex),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  // Button functions (for items)
  const updateItemButton = (
    categoryIndex: number,
    subcategoryIndex: number,
    itemIndex: number,
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.map((item, iIdx) =>
                        iIdx === itemIndex
                          ? {
                              ...item,
                              buttons: item.buttons.map((btn, bIdx) =>
                                bIdx === buttonIndex
                                  ? { ...btn, [field]: value }
                                  : btn
                              ),
                            }
                          : item
                      ),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  const addItemButton = (categoryIndex: number, subcategoryIndex: number, itemIndex: number) => {
    const newButton: ButtonConfig = {
      label: '',
      variant: 'primary',
      href: '',
    };
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.map((item, iIdx) =>
                        iIdx === itemIndex
                          ? {
                              ...item,
                              buttons: [...item.buttons, newButton],
                            }
                          : item
                      ),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  const removeItemButton = (
    categoryIndex: number,
    subcategoryIndex: number,
    itemIndex: number,
    buttonIndex: number
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex
          ? {
              ...cat,
              subcategories: cat.subcategories.map((sub, sIdx) =>
                sIdx === subcategoryIndex
                  ? {
                      ...sub,
                      items: sub.items.map((item, iIdx) =>
                        iIdx === itemIndex
                          ? {
                              ...item,
                              buttons: item.buttons.filter((_, bIdx) => bIdx !== buttonIndex),
                            }
                          : item
                      ),
                    }
                  : sub
              ),
            }
          : cat
      ),
    }));
  };

  // Prospect Product functions
  // Note: prospectProduct is required by NavigationCategory type, so we always keep it in state
  // The "enabled" checkbox just controls UI visibility - the data is preserved
  const updateProspectProductEnabled = (categoryIndex: number, enabled: boolean) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex
          ? {
              ...cat,
              prospectProduct: enabled
                ? cat.prospectProduct || {
                    subcategoryLabel: '',
                    id: generateId('prospect'),
                    title: '',
                    description: '',
                    badge: '',
                    image: '',
                    href: '',
                    available: true,
                    waitlist: { enabled: false },
                    buttons: [],
                  }
                : cat.prospectProduct, // Keep existing when disabling (required by type)
            }
          : cat
      ),
    }));
  };

  const updateProspectProduct = (
    categoryIndex: number,
    field: 'title' | 'description' | 'image' | 'href' | 'badge' | 'subcategoryLabel',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex && cat.prospectProduct
          ? {
              ...cat,
              prospectProduct: {
                ...cat.prospectProduct,
                [field]: value,
              },
            }
          : cat
      ),
    }));
  };

  const updateProspectProductButton = (
    categoryIndex: number,
    buttonIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex && cat.prospectProduct
          ? {
              ...cat,
              prospectProduct: {
                ...cat.prospectProduct,
                buttons: cat.prospectProduct.buttons.map((btn, bIdx) =>
                  bIdx === buttonIndex ? { ...btn, [field]: value } : btn
                ),
              },
            }
          : cat
      ),
    }));
  };

  const addProspectProductButton = (categoryIndex: number) => {
    const newButton: ButtonConfig = {
      label: '',
      variant: 'primary',
      href: '',
    };
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex && cat.prospectProduct
          ? {
              ...cat,
              prospectProduct: {
                ...cat.prospectProduct,
                buttons: [...cat.prospectProduct.buttons, newButton],
              },
            }
          : cat
      ),
    }));
  };

  const removeProspectProductButton = (categoryIndex: number, buttonIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, idx) =>
        idx === categoryIndex && cat.prospectProduct
          ? {
              ...cat,
              prospectProduct: {
                ...cat.prospectProduct,
                buttons: cat.prospectProduct.buttons.filter((_, bIdx) => bIdx !== buttonIndex),
              },
            }
          : cat
      ),
    }));
  };

  // Section functions (Pricing)
  const updateSection = (
    categoryIndex: number,
    sectionIndex: number,
    field: 'enabled' | 'title' | 'description',
    value: boolean | string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex
                  ? { ...section, [field]: value }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const updateSectionColumns = (
    categoryIndex: number,
    sectionIndex: number,
    field: 'mobile' | 'tablet' | 'desktop',
    value: number
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex && section.type === 'pricing'
                  ? {
                      ...section,
                      columns: {
                        ...section.columns,
                        [field]: value,
                      },
                    }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const updatePricingCard = (
    categoryIndex: number,
    sectionIndex: number,
    cardIndex: number,
    field: 'title' | 'subtitle' | 'description' | 'price' | 'paymentSchedule' | 'image',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex && section.type === 'pricing'
                  ? {
                      ...section,
                      cards: section.cards.map((card, cardIdx) =>
                        cardIdx === cardIndex ? { ...card, [field]: value } : card
                      ),
                    }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const updatePricingCardButton = (
    categoryIndex: number,
    sectionIndex: number,
    cardIndex: number,
    field: 'label' | 'href' | 'variant',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex && section.type === 'pricing'
                  ? {
                      ...section,
                      cards: section.cards.map((card, cardIdx) =>
                        cardIdx === cardIndex
                          ? {
                              ...card,
                              button: {
                                ...card.button,
                                [field]: value,
                              },
                            }
                          : card
                      ),
                    }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const addPricingCard = (categoryIndex: number, sectionIndex: number) => {
    const newCard: PricingCard = {
      id: generateId('card'),
      image: '',
      title: '',
      subtitle: '',
      description: '',
      price: '',
      paymentSchedule: '',
      button: {
        label: '',
        variant: 'primary',
        href: '',
      },
    };
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex && section.type === 'pricing'
                  ? {
                      ...section,
                      cards: [...section.cards, newCard],
                    }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const removePricingCard = (categoryIndex: number, sectionIndex: number, cardIndex: number) => {
    setFormState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, cIdx) =>
        cIdx === categoryIndex && cat.sections
          ? {
              ...cat,
              sections: cat.sections.map((section, sIdx) =>
                sIdx === sectionIndex && section.type === 'pricing'
                  ? {
                      ...section,
                      cards: section.cards.filter((_, cardIdx) => cardIdx !== cardIndex),
                    }
                  : section
              ),
            }
          : cat
      ),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Normalize data before sending to ensure all required fields are present
      const normalizedData = normalizeNavigationContent(formState);
      
      const response = await fetch('/api/admin/navigation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSaveMessage({ type: 'success', text: 'Navigation content saved successfully!' });
      } else {
        setSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save navigation content',
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
        <title>Edit Navigation • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Edit Navigation Content</h1>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Navigation'}
              </button>
            </div>
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
              <p className="text-xs text-blue-700 mt-1">
                <strong>Phase 2:</strong> Extended editing for subcategories, items, prospectProduct, and sections.
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

          {/* Top Links Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Links</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">Journal Link</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={formState.topLinks.journal.label}
                      onChange={(e) => updateTopLink('journal', 'label', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="text"
                      value={formState.topLinks.journal.href}
                      onChange={(e) => updateTopLink('journal', 'href', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">Account Link</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={formState.topLinks.account.label}
                      onChange={(e) => updateTopLink('account', 'label', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="text"
                      value={formState.topLinks.account.href}
                      onChange={(e) => updateTopLink('account', 'href', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Categories Section */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Categories</h2>
            <div className="space-y-6">
              {formState.categories.map((category, categoryIndex) => {
                const categoryKey = `category-${categoryIndex}`;
                const subcategoriesKey = `${categoryKey}-subcategories`;
                const prospectProductKey = `${categoryKey}-prospect`;
                const sectionsKey = `${categoryKey}-sections`;

                return (
                  <div key={category.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h3 className="text-lg font-medium text-gray-800 mb-4">Category {categoryIndex + 1}</h3>
                    <div className="space-y-4">
                      {/* Read-only ID */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ID (read-only)</label>
                        <input
                          type="text"
                          value={category.id}
                          disabled
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                        />
                      </div>

                      {/* Label */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                        <input
                          type="text"
                          value={category.label}
                          onChange={(e) => updateCategory(categoryIndex, 'label', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Headline */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                        <textarea
                          value={category.headline}
                          onChange={(e) => updateCategory(categoryIndex, 'headline', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Subtitle */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                        <textarea
                          value={category.subtitle}
                          onChange={(e) => updateCategory(categoryIndex, 'subtitle', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Layout Checkboxes */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Layout Options</label>
                        <div className="space-y-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={category.layout.showHero}
                              onChange={(e) => updateCategoryLayout(categoryIndex, 'showHero', e.target.checked)}
                              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">Show Hero</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={category.layout.showGrid}
                              onChange={(e) => updateCategoryLayout(categoryIndex, 'showGrid', e.target.checked)}
                              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">Show Grid</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={category.layout.showCTA}
                              onChange={(e) => updateCategoryLayout(categoryIndex, 'showCTA', e.target.checked)}
                              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-700">Show CTA</span>
                          </label>
                        </div>
                      </div>

                      {/* Subcategories Section */}
                      <div className="mt-6 pt-4 border-t border-gray-300">
                        <button
                          type="button"
                          onClick={() => toggleSection(subcategoriesKey)}
                          className="flex items-center justify-between w-full text-left"
                        >
                          <h4 className="text-md font-semibold text-gray-800">Subcategories</h4>
                          <span className="text-gray-500">{expandedSections[subcategoriesKey] ? '−' : '+'}</span>
                        </button>
                        {expandedSections[subcategoriesKey] && (
                          <div className="mt-4 space-y-4">
                            {category.subcategories.map((subcategory, subcategoryIndex) => {
                              const itemsKey = `${subcategoriesKey}-${subcategoryIndex}-items`;
                              return (
                                <div key={subcategory.id} className="border border-gray-200 rounded p-3 bg-white">
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-gray-700">
                                      Subcategory {subcategoryIndex + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeSubcategory(categoryIndex, subcategoryIndex)}
                                      className="text-xs text-red-600 hover:text-red-800"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        ID (read-only)
                                      </label>
                                      <input
                                        type="text"
                                        value={subcategory.id}
                                        disabled
                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                                      <input
                                        type="text"
                                        value={subcategory.name}
                                        onChange={(e) =>
                                          updateSubcategoryName(categoryIndex, subcategoryIndex, e.target.value)
                                        }
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    </div>

                                    {/* Items within Subcategory */}
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                      <button
                                        type="button"
                                        onClick={() => toggleSection(itemsKey)}
                                        className="flex items-center justify-between w-full text-left mb-2"
                                      >
                                        <span className="text-sm font-medium text-gray-700">
                                          Items ({subcategory.items.length})
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                          {expandedSections[itemsKey] ? '−' : '+'}
                                        </span>
                                      </button>
                                      {expandedSections[itemsKey] && (
                                        <div className="space-y-3 mt-2">
                                          {subcategory.items.map((item, itemIndex) => (
                                            <div
                                              key={item.id}
                                              className="border border-gray-200 rounded p-3 bg-gray-50"
                                            >
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-gray-600">
                                                  Item {itemIndex + 1}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeItem(categoryIndex, subcategoryIndex, itemIndex)
                                                  }
                                                  className="text-xs text-red-600 hover:text-red-800"
                                                >
                                                  Remove
                                                </button>
                                              </div>
                                              <div className="space-y-2">
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    ID (read-only)
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={item.id}
                                                    disabled
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Title
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={item.title}
                                                    onChange={(e) =>
                                                      updateItem(
                                                        categoryIndex,
                                                        subcategoryIndex,
                                                        itemIndex,
                                                        'title',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Description
                                                  </label>
                                                  <textarea
                                                    value={item.description}
                                                    onChange={(e) =>
                                                      updateItem(
                                                        categoryIndex,
                                                        subcategoryIndex,
                                                        itemIndex,
                                                        'description',
                                                        e.target.value
                                                      )
                                                    }
                                                    rows={2}
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Image URL
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={item.image}
                                                    onChange={(e) =>
                                                      updateItem(
                                                        categoryIndex,
                                                        subcategoryIndex,
                                                        itemIndex,
                                                        'image',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    URL
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={item.href}
                                                    onChange={(e) =>
                                                      updateItem(
                                                        categoryIndex,
                                                        subcategoryIndex,
                                                        itemIndex,
                                                        'href',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="flex items-center">
                                                    <input
                                                      type="checkbox"
                                                      checked={item.available}
                                                      onChange={(e) =>
                                                        updateItemAvailable(
                                                          categoryIndex,
                                                          subcategoryIndex,
                                                          itemIndex,
                                                          e.target.checked
                                                        )
                                                      }
                                                      className="mr-2 h-3 w-3 text-blue-600"
                                                    />
                                                    <span className="text-xs text-gray-700">Available</span>
                                                  </label>
                                                </div>

                                                {/* Buttons for Item */}
                                                <div className="mt-2 pt-2 border-t border-gray-200">
                                                  <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-medium text-gray-600">Buttons</span>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        addItemButton(categoryIndex, subcategoryIndex, itemIndex)
                                                      }
                                                      className="text-xs text-blue-600 hover:text-blue-800"
                                                    >
                                                      + Add Button
                                                    </button>
                                                  </div>
                                                  <div className="space-y-2">
                                                    {item.buttons.map((button, buttonIndex) => (
                                                      <div
                                                        key={buttonIndex}
                                                        className="flex gap-2 items-end border border-gray-200 rounded p-2 bg-white"
                                                      >
                                                        <div className="flex-1">
                                                          <label className="block text-xs font-medium text-gray-600 mb-1">
                                                            Label
                                                          </label>
                                                          <input
                                                            type="text"
                                                            value={button.label}
                                                            onChange={(e) =>
                                                              updateItemButton(
                                                                categoryIndex,
                                                                subcategoryIndex,
                                                                itemIndex,
                                                                buttonIndex,
                                                                'label',
                                                                e.target.value
                                                              )
                                                            }
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                          />
                                                        </div>
                                                        <div className="flex-1">
                                                          <label className="block text-xs font-medium text-gray-600 mb-1">
                                                            Variant
                                                          </label>
                                                          <input
                                                            type="text"
                                                            value={button.variant}
                                                            onChange={(e) =>
                                                              updateItemButton(
                                                                categoryIndex,
                                                                subcategoryIndex,
                                                                itemIndex,
                                                                buttonIndex,
                                                                'variant',
                                                                e.target.value
                                                              )
                                                            }
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                          />
                                                        </div>
                                                        <div className="flex-1">
                                                          <label className="block text-xs font-medium text-gray-600 mb-1">
                                                            URL
                                                          </label>
                                                          <input
                                                            type="text"
                                                            value={button.href}
                                                            onChange={(e) =>
                                                              updateItemButton(
                                                                categoryIndex,
                                                                subcategoryIndex,
                                                                itemIndex,
                                                                buttonIndex,
                                                                'href',
                                                                e.target.value
                                                              )
                                                            }
                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                          />
                                                        </div>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            removeItemButton(
                                                              categoryIndex,
                                                              subcategoryIndex,
                                                              itemIndex,
                                                              buttonIndex
                                                            )
                                                          }
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
                                            onClick={() => addItem(categoryIndex, subcategoryIndex)}
                                            className="w-full px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                                          >
                                            + Add Item
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => addSubcategory(categoryIndex)}
                              className="w-full px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                            >
                              + Add Subcategory
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Prospect Product Section */}
                      <div className="mt-6 pt-4 border-t border-gray-300">
                        <button
                          type="button"
                          onClick={() => toggleSection(prospectProductKey)}
                          className="flex items-center justify-between w-full text-left"
                        >
                          <h4 className="text-md font-semibold text-gray-800">Prospect Product</h4>
                          <span className="text-gray-500">{expandedSections[prospectProductKey] ? '−' : '+'}</span>
                        </button>
                        {expandedSections[prospectProductKey] && (
                          <div className="mt-4 space-y-4">
                            <div>
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={!!category.prospectProduct}
                                  onChange={(e) =>
                                    updateProspectProductEnabled(categoryIndex, e.target.checked)
                                  }
                                  className="mr-2 h-4 w-4 text-blue-600"
                                />
                                <span className="text-sm text-gray-700">Enable prospect product</span>
                              </label>
                            </div>
                            {category.prospectProduct && (
                              <div className="border border-gray-200 rounded p-3 bg-white space-y-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                  <input
                                    type="text"
                                    value={category.prospectProduct.title}
                                    onChange={(e) => updateProspectProduct(categoryIndex, 'title', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory Label</label>
                                  <input
                                    type="text"
                                    value={category.prospectProduct.subcategoryLabel}
                                    onChange={(e) =>
                                      updateProspectProduct(categoryIndex, 'subcategoryLabel', e.target.value)
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                  <textarea
                                    value={category.prospectProduct.description}
                                    onChange={(e) =>
                                      updateProspectProduct(categoryIndex, 'description', e.target.value)
                                    }
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                                  <input
                                    type="text"
                                    value={category.prospectProduct.image}
                                    onChange={(e) => updateProspectProduct(categoryIndex, 'image', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                                  <input
                                    type="text"
                                    value={category.prospectProduct.href}
                                    onChange={(e) => updateProspectProduct(categoryIndex, 'href', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Badge</label>
                                  <input
                                    type="text"
                                    value={category.prospectProduct.badge}
                                    onChange={(e) => updateProspectProduct(categoryIndex, 'badge', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>

                                {/* Buttons for Prospect Product */}
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700">Buttons</span>
                                    <button
                                      type="button"
                                      onClick={() => addProspectProductButton(categoryIndex)}
                                      className="text-sm text-blue-600 hover:text-blue-800"
                                    >
                                      + Add Button
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {category.prospectProduct.buttons.map((button, buttonIndex) => (
                                      <div
                                        key={buttonIndex}
                                        className="flex gap-2 items-end border border-gray-200 rounded p-2 bg-gray-50"
                                      >
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                                          <input
                                            type="text"
                                            value={button.label}
                                            onChange={(e) =>
                                              updateProspectProductButton(
                                                categoryIndex,
                                                buttonIndex,
                                                'label',
                                                e.target.value
                                              )
                                            }
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-600 mb-1">Variant</label>
                                          <input
                                            type="text"
                                            value={button.variant}
                                            onChange={(e) =>
                                              updateProspectProductButton(
                                                categoryIndex,
                                                buttonIndex,
                                                'variant',
                                                e.target.value
                                              )
                                            }
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900"
                                          />
                                        </div>
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                                          <input
                                            type="text"
                                            value={button.href}
                                            onChange={(e) =>
                                              updateProspectProductButton(
                                                categoryIndex,
                                                buttonIndex,
                                                'href',
                                                e.target.value
                                              )
                                            }
                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeProspectProductButton(categoryIndex, buttonIndex)}
                                          className="px-2 py-1 text-sm text-red-600 hover:text-red-800"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sections (Pricing) */}
                      {category.sections && category.sections.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-300">
                          <button
                            type="button"
                            onClick={() => toggleSection(sectionsKey)}
                            className="flex items-center justify-between w-full text-left"
                          >
                            <h4 className="text-md font-semibold text-gray-800">Sections</h4>
                            <span className="text-gray-500">{expandedSections[sectionsKey] ? '−' : '+'}</span>
                          </button>
                          {expandedSections[sectionsKey] && (
                            <div className="mt-4 space-y-4">
                              {category.sections.map((section, sectionIndex) => {
                                if (section.type !== 'pricing') {
                                  // Preserve unknown section types
                                  return (
                                    <div key={section.id} className="border border-gray-200 rounded p-3 bg-gray-50">
                                      <p className="text-sm text-gray-600">
                                        Section type "{section.type}" is not editable (preserved)
                                      </p>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={section.id} className="border border-gray-200 rounded p-3 bg-white">
                                    <div className="flex items-center justify-between mb-3">
                                      <span className="text-sm font-medium text-gray-700">
                                        Pricing Section {sectionIndex + 1}
                                      </span>
                                    </div>
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                          ID (read-only)
                                        </label>
                                        <input
                                          type="text"
                                          value={section.id}
                                          disabled
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Type (read-only)</label>
                                        <input
                                          type="text"
                                          value={section.type}
                                          disabled
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                        />
                                      </div>
                                      <div>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={section.enabled}
                                            onChange={(e) =>
                                              updateSection(categoryIndex, sectionIndex, 'enabled', e.target.checked)
                                            }
                                            className="mr-2 h-3 w-3 text-blue-600"
                                          />
                                          <span className="text-xs text-gray-700">Enabled</span>
                                        </label>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                        <input
                                          type="text"
                                          value={section.title}
                                          onChange={(e) =>
                                            updateSection(categoryIndex, sectionIndex, 'title', e.target.value)
                                          }
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                        <textarea
                                          value={section.description}
                                          onChange={(e) =>
                                            updateSection(categoryIndex, sectionIndex, 'description', e.target.value)
                                          }
                                          rows={2}
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">Columns</label>
                                        <div className="grid grid-cols-3 gap-2">
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Mobile</label>
                                            <input
                                              type="number"
                                              value={section.columns.mobile}
                                              onChange={(e) =>
                                                updateSectionColumns(
                                                  categoryIndex,
                                                  sectionIndex,
                                                  'mobile',
                                                  parseInt(e.target.value) || 1
                                                )
                                              }
                                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Tablet</label>
                                            <input
                                              type="number"
                                              value={section.columns.tablet}
                                              onChange={(e) =>
                                                updateSectionColumns(
                                                  categoryIndex,
                                                  sectionIndex,
                                                  'tablet',
                                                  parseInt(e.target.value) || 2
                                                )
                                              }
                                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Desktop</label>
                                            <input
                                              type="number"
                                              value={section.columns.desktop}
                                              onChange={(e) =>
                                                updateSectionColumns(
                                                  categoryIndex,
                                                  sectionIndex,
                                                  'desktop',
                                                  parseInt(e.target.value) || 3
                                                )
                                              }
                                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {/* Pricing Cards */}
                                      <div className="mt-3 pt-3 border-t border-gray-200">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-sm font-medium text-gray-700">
                                            Cards ({section.cards.length})
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => addPricingCard(categoryIndex, sectionIndex)}
                                            className="text-sm text-blue-600 hover:text-blue-800"
                                          >
                                            + Add Card
                                          </button>
                                        </div>
                                        <div className="space-y-3">
                                          {section.cards.map((card, cardIndex) => (
                                            <div key={card.id} className="border border-gray-200 rounded p-3 bg-gray-50">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-gray-600">Card {cardIndex + 1}</span>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removePricingCard(categoryIndex, sectionIndex, cardIndex)
                                                  }
                                                  className="text-xs text-red-600 hover:text-red-800"
                                                >
                                                  Remove
                                                </button>
                                              </div>
                                              <div className="space-y-2">
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    ID (read-only)
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={card.id}
                                                    disabled
                                                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-gray-100 text-gray-600"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                                                  <input
                                                    type="text"
                                                    value={card.title}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'title',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">Subtitle</label>
                                                  <input
                                                    type="text"
                                                    value={card.subtitle}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'subtitle',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                                  <textarea
                                                    value={card.description}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'description',
                                                        e.target.value
                                                      )
                                                    }
                                                    rows={2}
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
                                                  <input
                                                    type="text"
                                                    value={card.price}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'price',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    Payment Schedule
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={card.paymentSchedule}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'paymentSchedule',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                                                  <input
                                                    type="text"
                                                    value={card.image}
                                                    onChange={(e) =>
                                                      updatePricingCard(
                                                        categoryIndex,
                                                        sectionIndex,
                                                        cardIndex,
                                                        'image',
                                                        e.target.value
                                                      )
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                  />
                                                </div>

                                                {/* Button for Pricing Card */}
                                                <div className="mt-2 pt-2 border-t border-gray-200">
                                                  <span className="block text-xs font-medium text-gray-600 mb-2">Button</span>
                                                  <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                      <label className="block text-xs text-gray-500 mb-1">Label</label>
                                                      <input
                                                        type="text"
                                                        value={card.button.label}
                                                        onChange={(e) =>
                                                          updatePricingCardButton(
                                                            categoryIndex,
                                                            sectionIndex,
                                                            cardIndex,
                                                            'label',
                                                            e.target.value
                                                          )
                                                        }
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                      />
                                                    </div>
                                                    <div>
                                                      <label className="block text-xs text-gray-500 mb-1">Variant</label>
                                                      <input
                                                        type="text"
                                                        value={card.button.variant}
                                                        onChange={(e) =>
                                                          updatePricingCardButton(
                                                            categoryIndex,
                                                            sectionIndex,
                                                            cardIndex,
                                                            'variant',
                                                            e.target.value
                                                          )
                                                        }
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                      />
                                                    </div>
                                                    <div>
                                                      <label className="block text-xs text-gray-500 mb-1">URL</label>
                                                      <input
                                                        type="text"
                                                        value={card.button.href}
                                                        onChange={(e) =>
                                                          updatePricingCardButton(
                                                            categoryIndex,
                                                            sectionIndex,
                                                            cardIndex,
                                                            'href',
                                                            e.target.value
                                                          )
                                                        }
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900"
                                                      />
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
                {isSaving ? 'Saving...' : 'Save Navigation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<NavigationEditorProps> = async () => {
  const navigationContent = await getNavigationContent();

  return {
    props: {
      initialContent: navigationContent,
    },
  };
};
