/**
 * Admin: /admin/app-settings/onboarding
 *
 * Authoring surface for the single v1 onboarding flow (flow_key='default').
 * Editors/admins can manage:
 *   - flow title
 *   - the page sequence (one primary question per page by default): page
 *     titles, helper text, visibility, ordering, add/remove pages — all
 *     constrained to known question ids
 *   - per-question prompt/hint/required/visible and option labels + ordering
 *
 * Everything stays within the code-owned known-question allowlist. No arbitrary
 * profile-target or metadata-key configuration is possible here; grouped
 * (multi-question) pages are not creatable in this UI (only the code-owned
 * allowlisted groupings, applied via the API/seed, validate).
 *
 * Safety:
 *   - Save draft validates structurally + semantically; malformed drafts are
 *     rejected.
 *   - Publish strictly validates; invalid config cannot publish.
 *   - Saving/publishing never mutates `people.metadata`.
 *
 * SSR loads the current draft + published state; mutations go through
 * /api/admin/onboarding and /api/admin/onboarding/publish.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import {
  getDraftFlow,
  getPublishedFlow,
} from '@/lib/onboarding/onboardingFlowServerService';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_FLOW_KEY,
  DEFAULT_ONBOARDING_FLOW_TITLE,
  DEFAULT_PAGE_TITLES,
  KNOWN_QUESTIONS,
  KNOWN_QUESTION_IDS,
  KNOWN_QUESTION_MAP,
  deriveDefaultOnboardingPages,
  type OnboardingFlowConfig,
  type OnboardingFlowRecord,
  type OnboardingPageConfig,
  type OnboardingQuestionOverride,
} from '@/lib/onboarding/onboardingFlowTypes';
import { validateOnboardingFlowConfig, type ValidationIssue } from '@/lib/onboarding/onboardingFlowValidation';
import {
  ALLERGY_OPTS,
  BUDGET_OPTS,
  COOKING_CONFIDENCE_OPTS,
  DIETARY_STYLE_OPTS,
  DINING_OUT_OPTS,
  EATING_WINDOW_OPTS,
  GOAL_STATE_OPTS,
  INTENT_OPTS,
  KITCHEN_OPTS,
  LEFTOVERS_OPTS,
  MEAL_SLOT_OPTION_KEYS,
  PRIMARY_GOAL_OPTS,
  PRIORITY_OPTS,
  PROTEIN_OPTS,
  SEX_OPTS,
  SHOPPING_OPTS,
  SUPPORT_OPTS,
  WEEKDAY_OPTS,
} from '@/lib/onboarding/defaultOnboardingFlow';
import { MEAL_SLOT_DEFAULT_LABELS } from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
  initialDraft: OnboardingFlowRecord | null;
  initialPublished: OnboardingFlowRecord | null;
}

type Opt = { value: string; label: string };

const mealSlotOpts: Opt[] = MEAL_SLOT_OPTION_KEYS.map((k) => ({
  value: k,
  label: MEAL_SLOT_DEFAULT_LABELS[k],
}));

const QUESTION_OPTIONS: Record<string, Opt[]> = {
  primary_goal: PRIMARY_GOAL_OPTS,
  priority: PRIORITY_OPTS,
  support_level: SUPPORT_OPTS,
  intents: INTENT_OPTS,
  sex: SEX_OPTS,
  goal_state: GOAL_STATE_OPTS,
  meal_slots: mealSlotOpts,
  eating_window: EATING_WINDOW_OPTS,
  skipped_meals: mealSlotOpts,
  dining_out_frequency: DINING_OUT_OPTS,
  dietary_style: DIETARY_STYLE_OPTS,
  allergies: ALLERGY_OPTS,
  preferred_proteins: PROTEIN_OPTS,
  cooking_confidence: COOKING_CONFIDENCE_OPTS,
  kitchen_access: KITCHEN_OPTS,
  shopping_mode_preference: SHOPPING_OPTS,
  cooking_days: WEEKDAY_OPTS,
  prep_days: WEEKDAY_OPTS,
  leftovers_tolerance: LEFTOVERS_OPTS,
  budget_sensitivity: BUDGET_OPTS,
};

interface ApiGetResponse {
  draft: OnboardingFlowRecord | null;
  published: OnboardingFlowRecord | null;
  hasDraft: boolean;
  hasPublished: boolean;
  seed: { flowKey: string; title: string; config: OnboardingFlowConfig };
}

function toConfig(record: OnboardingFlowRecord | null): OnboardingFlowConfig {
  return record?.config ?? DEFAULT_ONBOARDING_FLOW_CONFIG;
}

function toTitle(record: OnboardingFlowRecord | null): string {
  return record?.title ?? DEFAULT_ONBOARDING_FLOW_TITLE;
}

export default function OnboardingAuthoring({
  user,
  initialDraft,
  initialPublished,
}: Props) {
  const [title, setTitle] = useState(toTitle(initialDraft ?? initialPublished));
  const [config, setConfig] = useState<OnboardingFlowConfig>(toConfig(initialDraft ?? initialPublished));
  const [hasDraft, setHasDraft] = useState(Boolean(initialDraft));
  const [hasPublished, setHasPublished] = useState(Boolean(initialPublished));
  const [publishedAt, setPublishedAt] = useState<string | null>(initialPublished?.publishedAt ?? null);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const liveValidation = useMemo(() => validateOnboardingFlowConfig(config), [config]);

  async function refreshState() {
    try {
      const res = await fetch('/api/admin/onboarding', { headers: { 'Cache-Control': 'no-store' } });
      if (!res.ok) return;
      const json = (await res.json()) as ApiGetResponse;
      setHasDraft(json.hasDraft);
      setHasPublished(json.hasPublished);
      setPublishedAt(json.published?.publishedAt ?? null);
      // Don't clobber in-progress edits; only refresh published status flags here.
    } catch {
      // ignore — status flags will refresh on next full load
    }
  }

  const getOverride = useCallback(
    (qid: string): OnboardingQuestionOverride => config.questions[qid as keyof typeof config.questions] ?? {},
    [config],
  );

  const updateOverride = useCallback(
    (qid: string, patch: Partial<OnboardingQuestionOverride>) => {
      setConfig((prev) => {
        const current = (prev.questions[qid as keyof typeof prev.questions] ?? {}) as OnboardingQuestionOverride;
        const next = { ...current, ...patch };
        // Drop empty optionLabels/optionOrder to keep the blob small.
        if (next.optionLabels && Object.keys(next.optionLabels).length === 0) delete next.optionLabels;
        if (next.optionOrder && next.optionOrder.length === 0) delete next.optionOrder;
        const questions = { ...prev.questions, [qid]: next } as OnboardingFlowConfig['questions'];
        // Keep single-question pages in sync with their question's visibility,
        // so hiding a question never leaves an empty (invalid) page behind.
        let pages = prev.pages;
        if (patch.visible !== undefined && prev.pages && prev.pages.length > 0) {
          pages = prev.pages.map((p) =>
            p.questionIds.length === 1 && p.questionIds[0] === qid ? { ...p, visible: patch.visible } : p,
          );
        }
        return { ...prev, questions, pages };
      });
    },
    [],
  );

  /* ---- page-sequence editing ---- */
  const effectivePages = useMemo<OnboardingPageConfig[]>(
    () => (config.pages && config.pages.length > 0 ? config.pages : deriveDefaultOnboardingPages()),
    [config.pages],
  );

  const setPages = useCallback((next: OnboardingPageConfig[]) => {
    setConfig((prev) => ({ ...prev, pages: next }));
  }, []);

  const updatePage = useCallback(
    (index: number, patch: Partial<OnboardingPageConfig>) => {
      setPages(effectivePages.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    },
    [effectivePages, setPages],
  );

  const movePage = useCallback(
    (index: number, dir: -1 | 1) => {
      const to = index + dir;
      if (to < 0 || to >= effectivePages.length) return;
      const next = [...effectivePages];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved);
      setPages(next);
    },
    [effectivePages, setPages],
  );

  const removePage = useCallback(
    (index: number) => {
      setPages(effectivePages.filter((_, i) => i !== index));
    },
    [effectivePages, setPages],
  );

  const usedQuestionIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of effectivePages) for (const qid of p.questionIds) s.add(qid);
    return s;
  }, [effectivePages]);

  const availableQuestionIds = useMemo(
    () => KNOWN_QUESTION_IDS.filter((id) => !usedQuestionIds.has(id)),
    [usedQuestionIds],
  );

  const addPage = useCallback(
    (questionId: string) => {
      if (!KNOWN_QUESTION_MAP.has(questionId)) return;
      setPages([
        ...effectivePages,
        {
          id: questionId,
          title: DEFAULT_PAGE_TITLES[questionId] ?? questionId,
          questionIds: [questionId],
        },
      ]);
    },
    [effectivePages, setPages],
  );

  const moveOption = useCallback((qid: string, from: number, to: number) => {
    const order = orderedOptionsFor(qid, getOverride(qid));
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateOverride(qid, { optionOrder: next.map((o) => o.value) });
  }, [getOverride, updateOverride]);

  const hideOption = useCallback((qid: string, value: string) => {
    const order = orderedOptionsFor(qid, getOverride(qid));
    updateOverride(qid, { optionOrder: order.filter((o) => o.value !== value).map((o) => o.value) });
  }, [getOverride, updateOverride]);

  const restoreOptions = useCallback((qid: string) => {
    updateOverride(qid, { optionOrder: undefined });
  }, [updateOverride]);

  const setOptionLabel = useCallback((qid: string, value: string, label: string) => {
    const override = getOverride(qid);
    const nextLabels = { ...(override.optionLabels ?? {}) };
    if (label.trim() === '') {
      delete nextLabels[value];
    } else {
      nextLabels[value] = label;
    }
    updateOverride(qid, { optionLabels: nextLabels });
  }, [getOverride, updateOverride]);

  async function handleSaveDraft() {
    setSaving(true); setBusy(true); setError(null); setNotice(null); setIssues([]);
    try {
      const res = await fetch('/api/admin/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, config }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not save draft.');
        if (json.validation?.issues) setIssues(json.validation.issues as ValidationIssue[]);
        return;
      }
      setHasDraft(true);
      setNotice('Draft saved. Live onboarding is unchanged until you publish.');
      void refreshState();
    } catch {
      setError('Network error — could not save draft.');
    } finally {
      setSaving(false); setBusy(false);
    }
  }

  async function handlePublish() {
    if (!liveValidation.ok) {
      setError('Resolve validation issues before publishing.');
      setIssues(liveValidation.issues);
      return;
    }
    setPublishing(true); setBusy(true); setError(null); setNotice(null); setIssues([]);
    try {
      // Ensure a draft exists for the current edits before publishing.
      if (!hasDraft) {
        const saveRes = await fetch('/api/admin/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, config }),
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok || !saveJson.success) {
          setError(saveJson.error ?? 'Could not save draft before publishing.');
          return;
        }
        setHasDraft(true);
      }
      const res = await fetch('/api/admin/onboarding/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not publish.');
        return;
      }
      setHasPublished(true);
      setPublishedAt(json.record?.publishedAt ?? new Date().toISOString());
      setNotice('Published. Live /app/onboarding now uses this config.');
      void refreshState();
    } catch {
      setError('Network error — could not publish.');
    } finally {
      setPublishing(false); setBusy(false);
    }
  }

  async function handleUnpublish() {
    if (!hasPublished) return;
    if (!confirm('Unpublish? Live onboarding will fall back to the default flow.')) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch('/api/admin/onboarding/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpublish' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not unpublish.');
        return;
      }
      setHasPublished(false);
      setPublishedAt(null);
      setNotice('Unpublished. Live onboarding now uses the default flow.');
    } catch {
      setError('Network error — could not unpublish.');
    } finally {
      setBusy(false);
    }
  }

  const previewHref = `/admin/app-settings/onboarding/preview?source=draft`;

  const renderQuestionEditor = (qid: string) => {
    const override = getOverride(qid);
    const opts = QUESTION_OPTIONS[qid];
    const ordered = opts ? orderedOptionsFor(qid, override) : [];
    const hiddenCount = opts ? opts.length - ordered.length : 0;
    return (
      <div key={qid} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <code className="text-xs bg-gray-100 px-1 rounded">{qid}</code>
            <span className="ml-2 text-xs text-gray-500">{KNOWN_QUESTION_MAP.get(qid)?.type}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={override.required ?? false}
                onChange={(e) => updateOverride(qid, { required: e.target.checked })}
              />
              Required
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={override.visible ?? true}
                onChange={(e) => updateOverride(qid, { visible: e.target.checked })}
              />
              Visible
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <input
            type="text"
            value={override.prompt ?? ''}
            onChange={(e) => updateOverride(qid, { prompt: e.target.value || undefined })}
            placeholder={`Prompt (default used when empty)`}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            maxLength={280}
          />
          <input
            type="text"
            value={override.hint ?? ''}
            onChange={(e) => updateOverride(qid, { hint: e.target.value || undefined })}
            placeholder={`Hint (optional)`}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            maxLength={280}
          />
        </div>

        {opts && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-600 mb-2">Options</div>
            <div className="space-y-2">
              {ordered.map((opt, idx) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveOption(qid, idx, idx - 1)} className="text-xs text-gray-500 hover:text-gray-900 leading-none disabled:opacity-30" disabled={idx === 0}>▲</button>
                    <button type="button" onClick={() => moveOption(qid, idx, idx + 1)} className="text-xs text-gray-500 hover:text-gray-900 leading-none disabled:opacity-30" disabled={idx === ordered.length - 1}>▼</button>
                  </div>
                  <code className="text-xs text-gray-400 w-28 truncate" title={opt.value}>{opt.value}</code>
                  <input
                    type="text"
                    value={override.optionLabels?.[opt.value] ?? ''}
                    onChange={(e) => setOptionLabel(qid, opt.value, e.target.value)}
                    placeholder={opt.label}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    maxLength={140}
                  />
                  <button type="button" onClick={() => hideOption(qid, opt.value)} className="text-xs text-red-500 hover:text-red-700">Hide</button>
                </div>
              ))}
            </div>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => restoreOptions(qid)} className="mt-2 text-xs text-blue-600 hover:underline">
                Restore {hiddenCount} hidden option{hiddenCount > 1 ? 's' : ''} (reset ordering)
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Onboarding Authoring • Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link href="/admin/app-settings" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to App Settings
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Onboarding Authoring</h1>
              <p className="text-sm text-gray-600">
                Flow <code className="bg-gray-200 px-1 rounded">{DEFAULT_ONBOARDING_FLOW_KEY}</code> — presentation only.
                One primary question per page. No profile metadata, billing, or entitlement changes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded ${hasDraft ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                {hasDraft ? 'Draft' : 'No draft'}
              </span>
              <span className={`px-2 py-1 text-xs rounded ${hasPublished ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                {hasPublished ? 'Published' : 'Not published'}
              </span>
            </div>
          </div>

          {/* Action bar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={busy}
              className="px-4 py-2 bg-gray-800 text-white rounded-md text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy || !liveValidation.ok}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              title={liveValidation.ok ? 'Publish the current draft to live' : 'Resolve validation issues first'}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
            {hasPublished && (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Unpublish
              </button>
            )}
            <Link
              href={previewHref}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Preview draft →
            </Link>
            <div className="ml-auto text-xs text-gray-500">
              {publishedAt ? `Last published ${new Date(publishedAt).toLocaleString()}` : 'Never published'}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
              {notice}
            </div>
          )}
          {(issues.length > 0 || !liveValidation.ok) && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold mb-1">Validation issues</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {(issues.length ? issues : liveValidation.issues).map((iss, i) => (
                  <li key={i}>
                    <code>{iss.path}</code>: {iss.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Flow title */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Flow title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none"
              maxLength={160}
            />
          </div>

          {/* Page structure */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Page structure</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  One primary question per page. Reorder, rename, hide, or remove pages. Question ids are code-owned.
                </p>
              </div>
              <span className="text-xs text-gray-500">{effectivePages.length} pages</span>
            </div>

            <div className="space-y-3">
              {effectivePages.map((page, index) => (
                <div key={`${page.id}:${index}`} className="rounded-md border border-gray-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col pt-1">
                      <button type="button" onClick={() => movePage(index, -1)} className="text-xs text-gray-500 hover:text-gray-900 leading-none disabled:opacity-30" disabled={index === 0}>▲</button>
                      <button type="button" onClick={() => movePage(index, 1)} className="text-xs text-gray-500 hover:text-gray-900 leading-none disabled:opacity-30" disabled={index === effectivePages.length - 1}>▼</button>
                    </div>
                    <div className="w-8 text-sm text-gray-400 pt-1">{index + 1}</div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-1 rounded" title="Page id">{page.id}</code>
                        {page.questionIds.length > 1 && (
                          <span className="text-[11px] rounded bg-blue-50 text-blue-700 px-1.5 py-0.5">
                            grouped{page.groupingReason ? `: ${page.groupingReason}` : ''}
                          </span>
                        )}
                        <label className="ml-auto flex items-center gap-1 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={page.visible ?? true}
                            onChange={(e) => updatePage(index, { visible: e.target.checked })}
                          />
                          Visible
                        </label>
                        <button
                          type="button"
                          onClick={() => removePage(index)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={page.title}
                        onChange={(e) => updatePage(index, { title: e.target.value })}
                        placeholder="Page title"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        maxLength={120}
                      />
                      <input
                        type="text"
                        value={page.helperText ?? ''}
                        onChange={(e) => updatePage(index, { helperText: e.target.value || undefined })}
                        placeholder="Helper text (optional)"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                        maxLength={280}
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {page.questionIds.map((qid) => (
                          <span key={qid} className="text-[11px] rounded bg-gray-100 text-gray-700 px-2 py-0.5">
                            {qid}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {availableQuestionIds.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-gray-600">Add page:</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addPage(e.target.value);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select a question…</option>
                  {availableQuestionIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">
                  Only code-owned known question ids; each appears on at most one page.
                </span>
              </div>
            )}
          </div>

          {/* Per-question presentation editors, grouped by page */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Question copy &amp; options</h2>
            <p className="text-xs text-gray-500 mb-4">
              Presentation overrides per question, grouped by the page they appear on. Hidden pages/questions still
              validate but won&apos;t render.
            </p>

            {effectivePages.map((page, index) => (
              <div key={`qpe-${page.id}:${index}`} className="mb-6 last:mb-0">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  Page {index + 1} — <span className="text-gray-500">{page.title}</span>
                </div>
                <div className="space-y-6">
                  {page.questionIds.map((qid) => renderQuestionEditor(qid))}
                </div>
              </div>
            ))}

            {(() => {
              const unused = KNOWN_QUESTIONS.filter((q) => !usedQuestionIds.has(q.id));
              if (unused.length === 0) return null;
              return (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    Unused questions (not on any page — won&apos;t render)
                  </div>
                  <div className="space-y-6">
                    {unused.map((q) => renderQuestionEditor(q.id))}
                  </div>
                </div>
              );
            })()}
          </div>

          <p className="text-xs text-gray-500">
            Signed in as {user.email} ({user.role}). Authoring is presentation-only; profile metadata targets are
            code-owned and not editable here.
          </p>
        </div>
      </div>
    </>
  );
}

/** Resolve the ordered, visible option list for a question given its override. */
function orderedOptionsFor(qid: string, override: OnboardingQuestionOverride): Opt[] {
  const all = QUESTION_OPTIONS[qid];
  if (!all) return [];
  if (!override.optionOrder || override.optionOrder.length === 0) return all;
  const byValue = new Map(all.map((o) => [o.value, o]));
  const kept: Opt[] = [];
  for (const v of override.optionOrder) {
    const opt = byValue.get(v);
    if (opt) kept.push(opt);
  }
  return kept;
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const [draft, published] = await Promise.all([
    getDraftFlow(DEFAULT_ONBOARDING_FLOW_KEY),
    getPublishedFlow(DEFAULT_ONBOARDING_FLOW_KEY),
  ]);

  return {
    props: {
      user,
      initialDraft: draft,
      initialPublished: published,
    },
  };
};
