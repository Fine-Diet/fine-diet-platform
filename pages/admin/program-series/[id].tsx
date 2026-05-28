/**
 * Admin Page: Program Series editor (Packet 23)
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  ProgramSeriesItemRow,
  ProgramSeriesRow,
  ProgramSeriesStatus,
} from '@/lib/programs/programSeriesAdminServerService';

interface Props {
  user: AuthenticatedUser;
  seriesId: string;
}

const STATUSES: ProgramSeriesStatus[] = ['draft', 'published', 'archived'];

const LIGHT_CONTROL_CLASS =
  'w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

const LIGHT_CONTROL_COMPACT_CLASS =
  'rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

function parseMetadata(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Metadata must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function jsonText(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function SeriesDetails({
  series,
  onSaved,
}: {
  series: ProgramSeriesRow;
  onSaved: (series: ProgramSeriesRow) => void;
}) {
  const [title, setTitle] = useState(series.title);
  const [subtitle, setSubtitle] = useState(series.subtitle ?? '');
  const [description, setDescription] = useState(series.description ?? '');
  const [category, setCategory] = useState(series.category ?? '');
  const [heroImageUrl, setHeroImageUrl] = useState(series.hero_image_url ?? '');
  const [status, setStatus] = useState<ProgramSeriesStatus>(series.status);
  const [displayOrder, setDisplayOrder] = useState(String(series.display_order));
  const [primaryCtaLabel, setPrimaryCtaLabel] = useState(
    series.primary_cta_label ?? '',
  );
  const [primaryCtaHref, setPrimaryCtaHref] = useState(
    series.primary_cta_href ?? '',
  );
  const [secondaryCtaLabel, setSecondaryCtaLabel] = useState(
    series.secondary_cta_label ?? '',
  );
  const [secondaryCtaHref, setSecondaryCtaHref] = useState(
    series.secondary_cta_href ?? '',
  );
  const [metadata, setMetadata] = useState(jsonText(series.metadata));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series/${series.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          category: category.trim() || null,
          hero_image_url: heroImageUrl.trim() || null,
          status,
          display_order: Number.parseInt(displayOrder, 10) || 0,
          primary_cta_label: primaryCtaLabel.trim() || null,
          primary_cta_href: primaryCtaHref.trim() || null,
          secondary_cta_label: secondaryCtaLabel.trim() || null,
          secondary_cta_href: secondaryCtaHref.trim() || null,
          metadata: parseMetadata(metadata),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Save failed.');
      }
      onSaved((await resp.json()) as ProgramSeriesRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-gray-500">{series.slug}</p>
          <h2 className="text-xl font-semibold text-gray-900">Series details</h2>
        </div>
        <Link
          href={`/programs/${series.slug}`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Public page
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium text-gray-700">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Status
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ProgramSeriesStatus)
            }
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-700 md:col-span-2">
          Subtitle / tagline
          <input
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 md:col-span-2">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Category
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="dietary"
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Display order
          <input
            type="number"
            min={0}
            value={displayOrder}
            onChange={(event) => setDisplayOrder(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 md:col-span-2">
          Hero image URL
          <input
            value={heroImageUrl}
            onChange={(event) => setHeroImageUrl(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS} font-mono`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Primary CTA label
          <input
            value={primaryCtaLabel}
            onChange={(event) => setPrimaryCtaLabel(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Primary CTA href
          <input
            value={primaryCtaHref}
            onChange={(event) => setPrimaryCtaHref(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS} font-mono`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Secondary CTA label
          <input
            value={secondaryCtaLabel}
            onChange={(event) => setSecondaryCtaLabel(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Secondary CTA href
          <input
            value={secondaryCtaHref}
            onChange={(event) => setSecondaryCtaHref(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS} font-mono`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 md:col-span-2">
          Metadata JSON
          <textarea
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            rows={8}
            className={`mt-1 ${LIGHT_CONTROL_CLASS} font-mono text-xs`}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

function SeriesItems({ seriesId }: { seriesId: string }) {
  const [items, setItems] = useState<ProgramSeriesItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programSlug, setProgramSlug] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [descriptionOverride, setDescriptionOverride] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series/${seriesId}/items`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load items.');
      }
      setItems((await resp.json()) as ProgramSeriesItemRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series/${seriesId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_slug: programSlug.trim(),
          title_override: titleOverride.trim() || null,
          description_override: descriptionOverride.trim() || null,
          status: 'published',
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Add item failed.');
      }
      setProgramSlug('');
      setTitleOverride('');
      setDescriptionOverride('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add item failed.');
    } finally {
      setAdding(false);
    }
  };

  const patchItem = async (
    item: ProgramSeriesItemRow,
    patch: Partial<ProgramSeriesItemRow>,
  ) => {
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Update failed.');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const archiveItem = async (item: ProgramSeriesItemRow) => {
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series-items/${item.id}`, {
        method: 'DELETE',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Archive failed.');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed.');
    }
  };

  const reorder = async (fromIndex: number, toIndex: number) => {
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/program-series/${seriesId}/items-reorder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordered_ids: next.map((item) => item.id) }),
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Reorder failed.');
      }
      setItems((await resp.json()) as ProgramSeriesItemRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed.');
      await refresh();
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-xl font-semibold text-gray-900">Series programs</h2>
      <p className="mt-1 text-sm text-gray-600">
        Add published program slugs in display order. Public pages enrich known
        slugs from the existing code-owned catalogue and apply overrides here.
      </p>

      <form
        onSubmit={addItem}
        className="mt-4 grid grid-cols-1 gap-3 rounded border border-gray-200 bg-gray-50 p-3 md:grid-cols-4"
      >
        <label className="block text-xs font-medium text-gray-700">
          Program slug
          <input
            value={programSlug}
            onChange={(event) => setProgramSlug(event.target.value)}
            placeholder="baseline"
            className={`mt-1 ${LIGHT_CONTROL_CLASS} font-mono`}
            required
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Title override
          <input
            value={titleOverride}
            onChange={(event) => setTitleOverride(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          Description override
          <input
            value={descriptionOverride}
            onChange={(event) => setDescriptionOverride(event.target.value)}
            className={`mt-1 ${LIGHT_CONTROL_CLASS}`}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={adding}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
          >
            {adding ? 'Adding…' : 'Add program'}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 overflow-hidden rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Program slug</th>
              <th className="px-3 py-2 text-left">Overrides</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No programs in this series yet.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item, index) => (
                <tr key={item.id} className="border-t border-gray-200">
                  <td className="px-3 py-2 text-gray-600">
                    <div className="flex items-center gap-2">
                      <span>{item.display_order}</span>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void reorder(index, index - 1)}
                        className="text-xs text-blue-700 disabled:text-gray-300"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === items.length - 1}
                        onClick={() => void reorder(index, index + 1)}
                        className="text-xs text-blue-700 disabled:text-gray-300"
                      >
                        Down
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.program_slug}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    <p>{item.title_override || 'No title override'}</p>
                    <p className="text-xs text-gray-500">
                      {item.description_override || 'No description override'}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.status}
                      onChange={(event) =>
                        void patchItem(item, {
                          status: event.target.value as ProgramSeriesStatus,
                        })
                      }
                      className={LIGHT_CONTROL_COMPACT_CLASS}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void archiveItem(item)}
                      className="text-xs font-medium text-red-700 hover:underline"
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminProgramSeriesEditorPage({
  user: _user,
  seriesId,
}: Props) {
  const [series, setSeries] = useState<ProgramSeriesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/program-series/${seriesId}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load series.');
      }
      setSeries((await resp.json()) as ProgramSeriesRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series.');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <Head>
        <title>Program Series Editor · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pb-10">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/admin/program-series"
              className="mb-3 inline-block text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to Program Series
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              Program Series Editor
            </h1>
          </div>

          {loading && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-500">
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}
          {!loading && series && (
            <>
              <SeriesDetails series={series} onSaved={setSeries} />
              <SeriesItems seriesId={series.id} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/program-series',
        permanent: false,
      },
    };
  }

  const rawId = context.params?.id;
  const seriesId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!seriesId) return { notFound: true };

  return { props: { user, seriesId } };
};
