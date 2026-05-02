'use client';

/**
 * Social Recipe Evidence Importer v1 review surface.
 *
 * Shows separated evidence, narrative extraction output, review items,
 * and the linked editable imported_meals draft when one is created.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  planService,
  type SocialImportDetail,
  type SocialImportReviewItem,
} from '@/lib/plans';
import type {
  SocialEvidenceReference,
  SocialImportEvidenceSource,
} from '@/lib/plans/socialEvidenceImport/types';

function statusStyle(status: string): string {
  switch (status) {
    case 'draft_created':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
    case 'manual_review':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    case 'failed':
      return 'bg-red-500/15 text-red-200 border-red-500/30';
    default:
      return 'bg-white/[0.08] text-white/70 border-white/10';
  }
}

function severityStyle(severity: SocialImportReviewItem['severity']): string {
  switch (severity) {
    case 'blocker':
      return 'bg-red-500/10 text-red-200 border-red-500/30';
    case 'warning':
      return 'bg-amber-500/10 text-amber-200 border-amber-500/30';
    default:
      return 'bg-white/[0.05] text-white/60 border-white/10';
  }
}

function dedupeReviewItems(items: SocialImportReviewItem[]): SocialImportReviewItem[] {
  const seen = new Set<string>();
  const out: SocialImportReviewItem[] = [];
  for (const item of items) {
    const key = `${item.code}:${item.severity}:${item.message.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function humanizeYoutubeTranscriptSource(source: string): string {
  switch (source) {
    case 'youtube_timedtext':
      return 'captions (timed text)';
    case 'youtube_timedtext_asr':
      return 'auto captions (ASR)';
    case 'youtube_description':
      return 'description body (same as public page when deduplicated)';
    case 'youtube_title_only':
      return 'title only';
    case 'external_provider':
      return 'external provider';
    default:
      return source.replace(/_/g, ' ');
  }
}

function automaticAcquisitionLinesFromSources(
  sources: SocialImportEvidenceSource[],
): string[] {
  const lines: string[] = [];
  for (const source of sources) {
    const meta = source.metadata_json ?? {};
    const method = meta.acquisition_method;
    const field = meta.field;
    if (method === 'youtube_watch_page_html') {
      if (field === 'title') {
        lines.push('Fetched the YouTube video title from the public watch page.');
      } else if (field === 'description') {
        lines.push('Fetched the YouTube video description from the public watch page.');
      } else {
        const status = String(meta.acquisition_status ?? 'unavailable');
        const error =
          typeof meta.page_fetch_error === 'string' && meta.page_fetch_error.length > 0
            ? `: ${meta.page_fetch_error}`
            : '';
        lines.push(`Tried YouTube public page metadata (${status})${error}.`);
      }
    } else if (method === 'tiktok_oembed') {
      if (source.source_kind === 'creator_caption') {
        lines.push('Fetched TikTok caption text via the public oEmbed endpoint.');
      } else {
        const status = String(
          meta.oembed_status ?? meta.acquisition_status ?? 'unavailable',
        );
        const error =
          typeof meta.oembed_error === 'string' && meta.oembed_error.length > 0
            ? `: ${meta.oembed_error}`
            : '';
        lines.push(`Tried TikTok oEmbed caption fetch (${status})${error}.`);
      }
    } else if (typeof method === 'string' && method.startsWith('youtube_transcript:')) {
      const src = method.slice('youtube_transcript:'.length);
      lines.push(
        `Recorded transcript / caption acquisition: ${humanizeYoutubeTranscriptSource(src)}.`,
      );
    }
  }
  return Array.from(new Set(lines));
}

function ProvenanceList({
  refs,
  sourceById,
}: {
  refs: SocialEvidenceReference[];
  sourceById: Map<string, SocialImportEvidenceSource>;
}) {
  if (refs.length === 0) {
    return (
      <p className="text-[10px] text-white/35 antialiased mt-1">
        No claim-level evidence reference.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1">
      {refs.map((ref, idx) => {
        const source = sourceById.get(ref.evidence_source_id);
        return (
          <div
            key={`${ref.evidence_source_id}-${idx}`}
            className="rounded-md bg-white/[0.04] border border-white/10 px-2 py-1.5"
          >
            <p className="text-[10px] text-white/55 antialiased">
              {source?.source_label ?? source?.source_kind ?? 'Evidence source'}
              {source ? ` · ${source.source_kind}` : ''}
            </p>
            {ref.quote && (
              <p className="text-[11px] text-white/70 antialiased mt-0.5">
                “{ref.quote}”
              </p>
            )}
            <p className="text-[9px] text-white/30 antialiased mt-0.5 break-all">
              {ref.evidence_source_id}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function SocialImportDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const fetchedRef = useRef(false);
  const [detail, setDetail] = useState<SocialImportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistedText, setAssistedText] = useState('');
  const [onscreenText, setOnscreenText] = useState('');
  const [userHint, setUserHint] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await planService.getSocialImport(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load social import.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || fetchedRef.current) return;
    fetchedRef.current = true;
    void refresh();
  }, [id, refresh]);

  const reviewItems = useMemo(() => {
    const extractionItems = detail?.extraction?.output_json.review_items ?? [];
    const jobItems = detail?.job.review_summary_json ?? [];
    return dedupeReviewItems([...jobItems, ...extractionItems]);
  }, [detail]);

  const sourceById = useMemo(
    () =>
      new Map(
        (detail?.evidence_sources ?? []).map((source) => [source.id, source]),
      ),
    [detail],
  );

  const automaticAcquisitionLines = useMemo(
    () =>
      detail?.evidence_sources?.length
        ? automaticAcquisitionLinesFromSources(detail.evidence_sources)
        : [],
    [detail],
  );

  const modelNotes = useMemo(() => {
    const notes = [
      detail?.job.error_text,
      ...(detail?.extraction?.warnings_json ?? []),
      ...(detail?.extraction?.output_json.warnings ?? []),
    ].filter((note): note is string => Boolean(note?.trim()));
    return Array.from(new Set(notes));
  }, [detail]);

  async function handleRerun() {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await planService.rerunSocialImport(id, {
        assisted_text: assistedText.trim() || null,
        onscreen_text: onscreenText.trim() || null,
        user_hint: userHint.trim() || null,
      });
      setDetail(next);
      setAssistedText('');
      setOnscreenText('');
      setUserHint('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rerun extraction.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center">
        <p className="text-sm text-white/60 antialiased">Loading social import...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center px-5">
        <div className="max-w-md text-center">
          <p className="text-sm text-white/70 antialiased">
            {error ?? 'Social import not found.'}
          </p>
          <Link
            href="/journal/plans/imports/social/new"
            className="inline-block mt-4 text-sm text-denim-200"
          >
            Start another import
          </Link>
        </div>
      </div>
    );
  }

  const extraction = detail.extraction?.output_json ?? null;
  const firstRecipe = extraction?.recipes[0] ?? null;

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[820px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold antialiased">
                Social evidence import
              </h1>
              <p className="text-sm text-white/50 antialiased mt-1">
                Evidence and extraction remain visible before downstream food
                matching, nutrition estimates, or NDS are trusted.
              </p>
            </div>
            <Link
              href="/journal/plans/imports/social/new"
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              New import
            </Link>
          </div>
        </div>

        <div className="w-full max-w-[820px] mx-auto px-5 mt-6 space-y-4">
          <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] ${statusStyle(detail.job.status)}`}>
                {detail.job.status.replace(/_/g, ' ')}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-white/[0.06] text-white/70 text-[11px]">
                {detail.job.platform}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-white/[0.06] text-white/70 text-[11px]">
                {detail.job.content_type.replace(/_/g, ' ')}
              </span>
            </div>
            {detail.job.source_url && (
              <p className="text-[11px] text-white/40 antialiased mt-2 break-all">
                {detail.job.source_url}
              </p>
            )}
            {detail.imported_meal && (
              <Link
                href={`/journal/plans/imports/${detail.imported_meal.id}`}
                className="inline-block mt-3 text-xs text-denim-200 hover:text-denim-100"
              >
                Open editable recipe draft
              </Link>
            )}
          </section>

          {automaticAcquisitionLines.length > 0 && (
            <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-white/85 antialiased">
                Automatic acquisition
              </h2>
              <p className="text-[11px] text-white/45 antialiased mt-1">
                Steps the importer ran before extraction (provenance is also on
                each evidence source).
              </p>
              <ul className="mt-3 list-disc list-inside space-y-1.5 text-[11px] text-white/65 antialiased">
                {automaticAcquisitionLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {reviewItems.length > 0 && (
            <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-white/85 antialiased">
                Review items
              </h2>
              <div className="mt-3 space-y-2">
                {reviewItems.map((item, idx) => (
                  <div
                    key={`${item.code}-${idx}`}
                    className={`rounded-lg border px-3 py-2 ${severityStyle(item.severity)}`}
                  >
                    <p className="text-xs font-semibold antialiased">
                      {item.code.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] antialiased mt-0.5">{item.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {modelNotes.length > 0 && (
            <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-white/85 antialiased">
                Extraction notes
              </h2>
              <p className="text-[11px] text-white/45 antialiased mt-1">
                Model and fallback notes. Captured evidence remains saved for rerun.
              </p>
              <ul className="mt-3 list-disc list-inside space-y-1.5 text-[11px] text-white/65 antialiased">
                {modelNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/85 antialiased">
              Evidence sources
            </h2>
            <div className="mt-3 space-y-3">
              {detail.evidence_sources.length === 0 ? (
                <p className="text-xs text-white/45 antialiased">
                  No evidence sources recorded yet.
                </p>
              ) : (
                detail.evidence_sources.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-lg bg-black/15 border border-white/10 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-white/80">
                        {source.source_label ?? source.source_kind}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-white/35">
                        {source.quality}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/45 mt-1 break-all">
                      Source ID: {source.id}
                    </p>
                    {(source.normalized_text ?? source.raw_text) && (
                      <p className="text-xs text-white/65 antialiased mt-2 whitespace-pre-wrap line-clamp-6">
                        {source.normalized_text ?? source.raw_text}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {extraction && (
            <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-white/85 antialiased">
                Narrative extraction
              </h2>
              <p className="text-xs text-white/50 antialiased mt-1">
                {extraction.summary ?? 'No summary was extracted.'}
              </p>
              {firstRecipe ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-black/15 border border-white/10 p-3">
                    <p className="text-xs font-semibold text-white/80 antialiased">
                      Title and servings
                    </p>
                    <p className="text-xs text-white/70 antialiased mt-2">
                      {firstRecipe.title.value ?? extraction.title.value ?? 'Untitled'}
                    </p>
                    <ProvenanceList
                      refs={firstRecipe.title.evidence_refs}
                      sourceById={sourceById}
                    />
                    <p className="text-xs text-white/70 antialiased mt-3">
                      Servings:{' '}
                      {firstRecipe.servings.value != null
                        ? firstRecipe.servings.value
                        : 'unknown'}{' '}
                      <span className="text-white/35">
                        ({firstRecipe.servings.status})
                      </span>
                    </p>
                    <ProvenanceList
                      refs={firstRecipe.servings.evidence_refs}
                      sourceById={sourceById}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white/75 antialiased">
                      Ingredients
                    </h3>
                    <div className="mt-2 space-y-2">
                      {firstRecipe.ingredients.map((ingredient, idx) => (
                        <div
                          key={`${ingredient.name}-${idx}`}
                          className="rounded-lg bg-black/15 border border-white/10 p-2"
                        >
                          <p className="text-xs text-white/80 antialiased">
                            {ingredient.quantity_text
                              ? `${ingredient.quantity_text} ${ingredient.name}`
                              : ingredient.name}
                          </p>
                          <p className="text-[10px] text-white/35 uppercase tracking-wide">
                            {ingredient.quantity_status} / {ingredient.confidence}
                          </p>
                          <ProvenanceList
                            refs={ingredient.evidence_refs}
                            sourceById={sourceById}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white/75 antialiased">
                      Steps
                    </h3>
                    <div className="mt-2 space-y-2">
                      {firstRecipe.steps.map((step) => (
                        <div
                          key={step.order}
                          className="rounded-lg bg-black/15 border border-white/10 p-2"
                        >
                          <p className="text-xs text-white/80 antialiased">
                            {step.order}. {step.instruction}
                          </p>
                          <p className="text-[10px] text-white/35 uppercase tracking-wide">
                            {step.confidence}
                          </p>
                          <ProvenanceList
                            refs={step.evidence_refs}
                            sourceById={sourceById}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/45 antialiased mt-3">
                  No recipe draft was extracted. This may be a meal plan,
                  grocery haul, unsupported content type, or insufficient
                  evidence.
                </p>
              )}
            </section>
          )}

          <section className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/85 antialiased">
              Add evidence and rerun
            </h2>
            <div className="mt-3 space-y-3">
              <textarea
                value={assistedText}
                onChange={(event) => setAssistedText(event.target.value)}
                placeholder="Add or correct caption/transcript/recipe text."
                rows={5}
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
              />
              <textarea
                value={onscreenText}
                onChange={(event) => setOnscreenText(event.target.value)}
                placeholder="Add visible on-screen text from the video."
                rows={4}
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
              />
              <textarea
                value={userHint}
                onChange={(event) => setUserHint(event.target.value)}
                placeholder="Add a short hint about the content type or missing details."
                rows={3}
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
              />
              {error && <p className="text-xs text-red-200 antialiased">{error}</p>}
              <button
                type="button"
                onClick={handleRerun}
                disabled={busy}
                className="w-full py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
              >
                {busy ? 'Rerunning...' : 'Rerun extraction'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
