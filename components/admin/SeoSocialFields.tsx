/**
 * SeoSocialFields — shared admin/editor component for the social preview
 * metadata block.
 *
 * Renders one canonical set of fields (SEO title/description, canonical,
 * robots/noindex, Open Graph, Twitter) reused by every authoring surface that
 * owns a shareable marketing page: Start Pages, Integrative Care product
 * records, and Programs marketing product records. Persisted as the `seo`
 * block on each record/config, then merged into `getSeoForRoute` as a
 * `pageOverride` at render time.
 *
 * Display metadata only. No redirects, no scriptable values, no billing /
 * entitlement / grant fields. Image fields use the existing
 * `ImageFieldWithPicker` pattern.
 */

import { ImageFieldWithPicker } from './ImageFieldWithPicker';
import type { SeoSocialFields } from '@/lib/seo/seoSocialFields';

/** Editor-facing value type — the non-null `seo` block. */
export type SeoSocialFieldsValue = NonNullable<SeoSocialFields>;

export interface SeoSocialFieldsEditorProps {
  value: SeoSocialFieldsValue;
  onChange: (next: SeoSocialFieldsValue) => void;
  /**
   * Hint for the canonical path placeholder, e.g. "/start/launch". Helps the
   * editor pick the right relative path without guessing the route shape.
   */
  canonicalPathHint?: string;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

/** Trim to undefined when empty so config never overrides a default with ''. */
function clean(value: string | undefined | null): string | undefined {
  const t = (value ?? '').trim();
  return t === '' ? undefined : t;
}

export function SeoSocialFieldsEditor({
  value,
  onChange,
  canonicalPathHint,
}: SeoSocialFieldsEditorProps) {
  function patch(next: Partial<NonNullable<SeoSocialFields>>) {
    onChange({ ...value, ...next });
  }

  function patchOg(next: Partial<SeoSocialFieldsValue['og']>) {
    onChange({ ...value, og: { ...(value.og ?? {}), ...next } });
  }

  function patchTwitter(next: Partial<SeoSocialFieldsValue['twitter']>) {
    onChange({ ...value, twitter: { ...(value.twitter ?? {}), ...next } });
  }

  const og = value.og ?? {};
  const twitter = value.twitter ?? {};

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        These control how this page appears in search results and when shared on
        social platforms. Leave any field blank to fall back to the route-level
        SEO record, then the global default.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={labelClass}>SEO title</label>
          <input
            className={inputClass}
            value={value.title ?? ''}
            onChange={(e) => patch({ title: clean(e.target.value) })}
            maxLength={160}
            placeholder="Overrides the global title template"
          />
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>SEO description</label>
          <textarea
            className={inputClass}
            rows={2}
            value={value.description ?? ''}
            onChange={(e) => patch({ description: clean(e.target.value) })}
            maxLength={320}
          />
        </div>

        <div>
          <label className={labelClass}>Canonical path</label>
          <input
            className={inputClass}
            value={value.canonicalPath ?? ''}
            onChange={(e) => patch({ canonicalPath: clean(e.target.value) })}
            placeholder={canonicalPathHint ?? '/start'}
          />
          <p className="mt-1 text-xs text-gray-400">
            Relative path resolved against the global canonical base.
          </p>
        </div>

        <div>
          <label className={labelClass}>Canonical URL (absolute, optional)</label>
          <input
            className={inputClass}
            value={value.canonical ?? ''}
            onChange={(e) => patch({ canonical: clean(e.target.value) })}
            placeholder="https://myfinediet.com/..."
          />
          <p className="mt-1 text-xs text-gray-400">Overrides the canonical path when set.</p>
        </div>

        <div>
          <label className={labelClass}>Robots</label>
          <input
            className={inputClass}
            value={value.robots ?? ''}
            onChange={(e) => patch({ robots: clean(e.target.value) })}
            placeholder="index,follow"
          />
        </div>

        <div>
          <label className={labelClass}>Noindex</label>
          <select
            className={inputClass}
            value={value.noindex ? 'true' : 'false'}
            onChange={(e) => patch({ noindex: e.target.value === 'true' })}
          >
            <option value="false">Allow indexing (default)</option>
            <option value="true">Hide from search engines (noindex,follow)</option>
          </select>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Open Graph (Facebook / LinkedIn)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>OG title</label>
            <input
              className={inputClass}
              value={og.title ?? ''}
              onChange={(e) => patchOg({ title: clean(e.target.value) })}
              placeholder="Defaults to the SEO title"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>OG description</label>
            <textarea
              className={inputClass}
              rows={2}
              value={og.description ?? ''}
              onChange={(e) => patchOg({ description: clean(e.target.value) })}
              placeholder="Defaults to the SEO description"
            />
          </div>
          <div>
            <label className={labelClass}>OG type</label>
            <input
              className={inputClass}
              value={og.type ?? ''}
              onChange={(e) => patchOg({ type: clean(e.target.value) })}
              placeholder="website"
            />
          </div>
          <div className="md:col-span-2">
            <ImageFieldWithPicker
              label="OG image"
              value={og.image ?? ''}
              onChange={(url) => patchOg({ image: clean(url) })}
              placeholder="/images/... or https://..."
              spec="1200×630 · 1.91:1 · JPG/PNG"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Twitter / X card</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Twitter card type</label>
            <select
              className={inputClass}
              value={twitter.card ?? ''}
              onChange={(e) =>
                patchTwitter({
                  card: (e.target.value || undefined) as
                    | 'summary'
                    | 'summary_large_image'
                    | undefined,
                })
              }
            >
              <option value="">Default (summary_large_image)</option>
              <option value="summary">Summary</option>
              <option value="summary_large_image">Summary large image</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Twitter title</label>
            <input
              className={inputClass}
              value={twitter.title ?? ''}
              onChange={(e) => patchTwitter({ title: clean(e.target.value) })}
              placeholder="Defaults to the SEO / OG title"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Twitter description</label>
            <textarea
              className={inputClass}
              rows={2}
              value={twitter.description ?? ''}
              onChange={(e) => patchTwitter({ description: clean(e.target.value) })}
              placeholder="Defaults to the SEO / OG description"
            />
          </div>
          <div className="md:col-span-2">
            <ImageFieldWithPicker
              label="Twitter image"
              value={twitter.image ?? ''}
              onChange={(url) => patchTwitter({ image: clean(url) })}
              placeholder="/images/... or https://..."
              spec="1200×630 · 1.91:1 · JPG/PNG"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Build an empty (all-blank) `SeoSocialFields` value for editor state seeding.
 * Returned as a non-null object so the editor always has a stable shape to
 * patch; empty fields are stripped to `undefined` on save.
 */
export function emptySeoSocialFields(): SeoSocialFieldsValue {
  return {};
}
