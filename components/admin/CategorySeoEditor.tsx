/**
 * Category SEO Editor Component
 * 
 * Embedded SEO editor for category pages.
 * Shows override fields with inherited values from global SEO.
 */

import { useState, useEffect } from 'react';
import type { SeoRouteConfig, SeoGlobalConfig } from '@/lib/contentTypes';

interface CategorySeoEditorProps {
  categoryId: string;
  routePath: string;
  seoOverride: SeoRouteConfig | null;
  onSeoChange: (seo: SeoRouteConfig | null) => void;
  isLoading: boolean;
  saveMessage: { type: 'success' | 'error'; text: string } | undefined;
  onSaveMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
  onSetLoading: (loading: boolean) => void;
}

export function CategorySeoEditor({
  categoryId,
  routePath,
  seoOverride,
  onSeoChange,
  isLoading,
  saveMessage,
  onSaveMessage,
  onSetLoading,
}: CategorySeoEditorProps) {
  const [globalSeo, setGlobalSeo] = useState<SeoGlobalConfig | null>(null);
  const [localSeo, setLocalSeo] = useState<SeoRouteConfig>(seoOverride || {});

  // Load global SEO for inheritance hints
  useEffect(() => {
    async function loadGlobalSeo() {
      try {
        const response = await fetch('/api/admin/seo/global');
        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            setGlobalSeo(data.config);
          }
        }
      } catch (error) {
        // Non-blocking: if global SEO can't load, just don't show inheritance hints
        console.warn('[CategorySeoEditor] Failed to load global SEO:', error);
      }
    }
    loadGlobalSeo();
  }, []);

  // Load existing SEO override for this route
  useEffect(() => {
    async function loadRouteSeo() {
      try {
        const response = await fetch(`/api/admin/seo/route?routePath=${encodeURIComponent(routePath)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            setLocalSeo(data.config);
            onSeoChange(data.config);
          }
        }
      } catch (error) {
        // Non-blocking: if route SEO can't load, use prop value
        console.warn('[CategorySeoEditor] Failed to load route SEO:', error);
      }
    }
    loadRouteSeo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath]);

  // Update local state when prop changes
  useEffect(() => {
    setLocalSeo(seoOverride || {});
  }, [seoOverride]);

  const updateField = <K extends keyof SeoRouteConfig>(field: K, value: SeoRouteConfig[K]) => {
    const updated = { ...localSeo, [field]: value || undefined };
    setLocalSeo(updated);
    onSeoChange(Object.keys(updated).length > 0 ? updated : null);
  };

  const clearOverride = (field: keyof SeoRouteConfig) => {
    const updated = { ...localSeo };
    delete updated[field];
    setLocalSeo(updated);
    onSeoChange(Object.keys(updated).length > 0 ? updated : null);
  };

  const handleSave = async () => {
    onSetLoading(true);
    onSaveMessage(null);

    try {
      const response = await fetch('/api/admin/seo/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routePath,
          seoConfig: localSeo,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onSaveMessage({ type: 'success', text: 'SEO overrides saved successfully!' });
      } else {
        onSaveMessage({
          type: 'error',
          text: data.error || 'Failed to save SEO overrides',
        });
      }
    } catch (error) {
      onSaveMessage({
        type: 'error',
        text: 'Network error. Please try again.',
      });
    } finally {
      onSetLoading(false);
    }
  };

  // Determine status
  const hasOverrides = Object.keys(localSeo).length > 0;
  const isNoindex = localSeo.noindex === true;
  const status = isNoindex ? 'Noindex' : hasOverrides ? 'Overridden' : 'Inheriting';

  return (
    <div className="mt-4 space-y-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h5 className="text-sm font-semibold text-gray-800">SEO Overrides</h5>
          <span
            className={`text-xs px-2 py-1 rounded ${
              status === 'Noindex'
                ? 'bg-red-100 text-red-800'
                : status === 'Overridden'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-green-100 text-green-800'
            }`}
          >
            {status}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save SEO'}
        </button>
      </div>

      {saveMessage && (
        <div
          className={`p-2 rounded text-xs ${
            saveMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      <div className="space-y-3">
        {/* Title Override */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">Title</label>
            {localSeo.title && (
              <button
                type="button"
                onClick={() => clearOverride('title')}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Inherit
              </button>
            )}
          </div>
          <input
            type="text"
            value={localSeo.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder={globalSeo?.defaultTitle || 'Inherited from global'}
            maxLength={70}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-0.5">
            {(localSeo.title || '').length}/70 {localSeo.title ? '' : `(inherited: ${globalSeo?.defaultTitle || 'N/A'})`}
          </p>
        </div>

        {/* Description Override */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">Description</label>
            {localSeo.description && (
              <button
                type="button"
                onClick={() => clearOverride('description')}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Inherit
              </button>
            )}
          </div>
          <textarea
            value={localSeo.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder={globalSeo?.defaultDescription || 'Inherited from global'}
            rows={2}
            maxLength={160}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-0.5">
            {(localSeo.description || '').length}/160 {localSeo.description ? '' : `(inherited: ${globalSeo?.defaultDescription?.substring(0, 50) || 'N/A'}...)`}
          </p>
        </div>

        {/* Canonical Override */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">Canonical URL</label>
            {localSeo.canonical && (
              <button
                type="button"
                onClick={() => clearOverride('canonical')}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Inherit
              </button>
            )}
          </div>
          <input
            type="url"
            value={localSeo.canonical || ''}
            onChange={(e) => updateField('canonical', e.target.value)}
            placeholder={`Inherited: ${globalSeo?.canonicalBase || ''}${routePath}`}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Noindex Toggle */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={localSeo.noindex === true}
              onChange={(e) => updateField('noindex', e.target.checked ? true : undefined)}
              className="mr-2 h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-xs text-gray-700">Noindex (prevent search engine indexing)</span>
          </label>
        </div>

        {/* OG Image Override */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700">OG Image</label>
            {localSeo.og?.image && (
              <button
                type="button"
                onClick={() => {
                  const updated = { ...localSeo };
                  if (updated.og) {
                    delete updated.og.image;
                    if (Object.keys(updated.og).length === 0) {
                      delete updated.og;
                    }
                  }
                  setLocalSeo(updated);
                  onSeoChange(Object.keys(updated).length > 0 ? updated : null);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Inherit
              </button>
            )}
          </div>
          <input
            type="url"
            value={localSeo.og?.image || ''}
            onChange={(e) => {
              const imageValue = e.target.value || undefined;
              const updatedOg = imageValue
                ? {
                    ...localSeo.og,
                    image: imageValue,
                  }
                : localSeo.og && Object.keys(localSeo.og).filter(k => k !== 'image').length > 0
                ? {
                    ...localSeo.og,
                    image: undefined,
                  }
                : undefined;
              
              const updated: SeoRouteConfig = {
                ...localSeo,
                og: updatedOg,
              };
              setLocalSeo(updated);
              onSeoChange(Object.keys(updated).filter(k => updated[k as keyof SeoRouteConfig] !== undefined).length > 0 ? updated : null);
            }}
            placeholder={globalSeo?.ogImage || 'Inherited from global'}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
