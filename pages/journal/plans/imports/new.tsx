'use client';

/**
 * /journal/plans/imports/new — Phase 4 recipe/meal import entry point.
 *
 * Captures either pasted recipe text, a recipe URL, or both. Submits
 * to POST /api/journal/plans/ai/import-recipe, which runs the stub
 * parser, persists an imported_meals draft row (structure, nutrition
 * estimate, meal-level NDS), and returns its ID. The user is then
 * forwarded to the detail/review surface at /journal/plans/imports/[id]
 * to edit, save (promote to a template), and/or attach to a plan slot.
 *
 * Copy is deliberate:
 *   - "Imported recipe draft" is surfaced clearly; we do not imply the
 *     estimate is trusted just because it was structured.
 *   - Video / social URLs are accepted as capture-only input and will
 *     land in `manual_review` on the server — the UI signals this up
 *     front so users are not surprised.
 */

import { useRouter } from 'next/router';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { planService, type ImportedMeal } from '@/lib/plans';

const VIDEO_HOST_RE =
  /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|vimeo\.com)/i;

// Platforms where we currently have no reliable automatic transcript
// path — assisted-caption input is the primary path (Packet 21).
const UNSUPPORTED_TRANSCRIPT_HOST_RE =
  /(tiktok\.com|instagram\.com|facebook\.com|fb\.watch)/i;

function detectVideoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return VIDEO_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

function detectUnsupportedTranscriptUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return UNSUPPORTED_TRANSCRIPT_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export default function ImportNewRecipePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [onscreenText, setOnscreenText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = useMemo(
    () => url.length > 0 && detectVideoUrl(url.trim()),
    [url],
  );
  const isUnsupportedVideo = useMemo(
    () => url.length > 0 && detectUnsupportedTranscriptUrl(url.trim()),
    [url],
  );
  const canSubmit = mode === 'text' ? text.trim().length > 0 : url.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: {
        text?: string | null;
        url?: string | null;
        assisted_text?: string | null;
        onscreen_text?: string | null;
      } = {};
      if (mode === 'text' && text.trim().length > 0) payload.text = text.trim();
      if (mode === 'url' && url.trim().length > 0) payload.url = url.trim();
      if (mode === 'url' && text.trim().length > 0) {
        // Packet 21 — when the user pastes caption/recipe text
        // alongside a social/video URL, submit it as `assisted_text`
        // so the server audits this as a user-assisted acquisition.
        // For non-video URLs we send it as plain `text` (no
        // acquisition audit row is needed in that case).
        if (isVideo) {
          payload.assisted_text = text.trim();
        } else {
          payload.text = text.trim();
        }
      }
      // Packet 22 — optional on-screen visible text (only offered
      // to the user when the URL is video-ish).
      if (mode === 'url' && isVideo && onscreenText.trim().length > 0) {
        payload.onscreen_text = onscreenText.trim();
      }
      const result = await planService.importRecipe(payload);
      const imported: ImportedMeal = result.imported_meal;
      await router.push(`/journal/plans/imports/${imported.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import recipe.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold antialiased">Import recipe</h1>
            <Link
              href="/journal/plans"
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              ← Plans
            </Link>
          </div>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            Paste a recipe or a link. We&apos;ll structure it into a draft you can
            review, save as a meal, or drop into a slot.
          </p>
          <Link
            href="/journal/plans/imports/social/new"
            className="inline-block mt-3 text-xs text-denim-200 hover:text-denim-100 antialiased"
          >
            Import from social video evidence
          </Link>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6 space-y-4">
          <div className="flex gap-1 rounded-full bg-white/[0.04] p-1 w-fit">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium antialiased transition-colors ${
                mode === 'text'
                  ? 'bg-denim-500/20 text-denim-200'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium antialiased transition-colors ${
                mode === 'url'
                  ? 'bg-denim-500/20 text-denim-200'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Paste URL
            </button>
          </div>

          {mode === 'text' ? (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                Recipe text
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Greek Yogurt Bowl\n\nServes 2\n\nIngredients\n1 cup Greek yogurt\n1/2 cup blueberries\n2 tbsp honey\n1/4 cup walnuts\n\nInstructions\n1. Layer yogurt in a bowl.\n2. Top with blueberries, honey, and walnuts.`}
                rows={14}
                className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
              />
              <p className="text-[11px] text-white/40 antialiased mt-1">
                Tip: include a title, servings, an &quot;Ingredients&quot; header,
                and an &quot;Instructions&quot; header for the cleanest parse.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                  Recipe URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                />
              </div>
              {isVideo && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs text-amber-200 antialiased">
                    {isUnsupportedVideo
                      ? "We can't automatically read captions from this platform. Paste the caption or recipe text below and we'll structure it into a draft."
                      : "We couldn't guarantee we'll auto-read this video. You can paste the caption or recipe text below to make sure nothing is lost."}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                  {isVideo ? 'Caption or recipe text' : 'Recipe text (optional)'}
                  {isVideo && !isUnsupportedVideo && (
                    <span className="normal-case tracking-normal text-white/30">
                      {' '}(optional)
                    </span>
                  )}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    isVideo
                      ? 'Paste the caption, description, or the recipe text from the video here.'
                      : 'Paste the recipe here to improve the parse.'
                  }
                  rows={8}
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                />
                <p className="text-[11px] text-white/40 antialiased mt-1">
                  {isVideo
                    ? "Supplied text is routed through the same draft pipeline and labeled as user-assisted in your import history."
                    : "We don't scrape remote pages yet. Pasting the recipe text alongside the URL gives you a fully structured draft."}
                </p>
              </div>
              {isVideo && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
                    On-screen text{' '}
                    <span className="normal-case tracking-normal text-white/30">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={onscreenText}
                    onChange={(e) => setOnscreenText(e.target.value)}
                    placeholder="Paste any visible instructions, ingredient overlays, or on-screen recipe cards you saw in the video."
                    rows={5}
                    className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
                  />
                  <p className="text-[11px] text-white/40 antialiased mt-1">
                    Used as a secondary assist — merged with the caption
                    above and clearly tagged on the resulting draft.
                    It never creates trusted ingredients by itself.
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex-1 py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
            >
              {submitting ? 'Importing…' : 'Create draft'}
            </button>
            <Link
              href="/journal/plans"
              className="px-4 py-3 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-sm text-white/70 antialiased"
            >
              Cancel
            </Link>
          </div>

          <p className="text-[11px] text-white/40 antialiased">
            Drafts are private to you. Imports are not auto-trusted:
            ingredient confidence and NDS confidence are shown separately
            on the review screen.
          </p>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
