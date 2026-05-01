'use client';

/**
 * Social Recipe Evidence Importer v1 entry point.
 *
 * New-build flow for social video/post evidence recovery. This page does
 * not send social URLs to the deterministic recipe paste parser.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { planService } from '@/lib/plans';

const SUPPORTED_HOST_RE =
  /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)/i;
const LATER_HOST_RE = /(threads\.net|x\.com|twitter\.com)/i;

function platformHint(url: string): string {
  if (!url.trim()) return 'Paste a YouTube, TikTok, Instagram, or Facebook link.';
  try {
    const host = new URL(url.trim()).hostname;
    if (SUPPORTED_HOST_RE.test(host)) return 'Supported social source.';
    if (LATER_HOST_RE.test(host)) {
      return 'Threads and X are planned for later support. Add assisted text for now.';
    }
    return 'This source is not in the v1 social importer scope.';
  } catch {
    return 'Enter a valid URL or use assisted text without a URL.';
  }
}

export default function NewSocialImportPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [assistedText, setAssistedText] = useState('');
  const [onscreenText, setOnscreenText] = useState('');
  const [userHint, setUserHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    url.trim().length > 0 ||
    assistedText.trim().length > 0 ||
    onscreenText.trim().length > 0 ||
    userHint.trim().length > 0;
  const hint = useMemo(() => platformHint(url), [url]);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const detail = await planService.createSocialImport({
        url: url.trim() || null,
        assisted_text: assistedText.trim() || null,
        onscreen_text: onscreenText.trim() || null,
        user_hint: userHint.trim() || null,
      });
      await router.push(`/journal/plans/imports/social/${detail.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create social import.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[700px] mx-auto px-5 pt-14 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold antialiased">
              Import from social evidence
            </h1>
            <Link
              href="/journal/plans/imports/new"
              className="text-xs text-white/60 hover:text-white/80 antialiased"
            >
              Back to imports
            </Link>
          </div>
          <p className="text-sm text-white/50 antialiased mt-1">
            Recover recipe or meal-plan details from YouTube, TikTok,
            Instagram, or Facebook evidence without inventing missing facts.
          </p>
        </div>

        <div className="w-full max-w-[700px] mx-auto px-5 mt-6 space-y-4">
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
            <p className="text-xs font-semibold text-white/80 antialiased">
              Evidence first, draft second
            </p>
            <p className="text-[11px] text-white/50 antialiased mt-1 leading-snug">
              The importer classifies the content, keeps evidence sources
              separate, extracts only supported claims, and shows review items
              for vague quantities, missing servings, conflicts, or weak source
              coverage.
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              Social URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
            />
            <p className="text-[11px] text-white/40 antialiased mt-1">{hint}</p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              Caption, transcript, or recipe text
            </label>
            <textarea
              value={assistedText}
              onChange={(event) => setAssistedText(event.target.value)}
              placeholder="Paste creator caption, transcript, or any recipe text from the post."
              rows={7}
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              On-screen text
            </label>
            <textarea
              value={onscreenText}
              onChange={(event) => setOnscreenText(event.target.value)}
              placeholder="Paste visible ingredient overlays, recipe cards, or step text shown in the video."
              rows={5}
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              User hint
            </label>
            <textarea
              value={userHint}
              onChange={(event) => setUserHint(event.target.value)}
              placeholder="Optional: tell us what you think this is, such as meal prep, single recipe, weekly plan, or grocery haul."
              rows={3}
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400 placeholder:text-white/30"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
          >
            {submitting ? 'Recovering evidence...' : 'Create social evidence import'}
          </button>
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
