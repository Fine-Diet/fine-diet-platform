/**
 * Admin: /admin/start-pages/[slug]
 *
 * Edit one Start Page draft: metadata, SEO, approved price option selection,
 * section visibility, and presentation copy (StartTemplateConfig).
 *
 * PRESENTATION ONLY. There are no controls here for billing models, Stripe
 * price IDs, trial enforcement, entitlement mappings, or grants — those live in
 * Offers & Bundles. Price options are chosen from already-approved keys.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getStartPageBySlug } from '@/lib/startPages/startPageApi';
import {
  listSafePriceOptionsForOffer,
  validateStartPageSelection,
  type SafePriceOption,
  type StartPageSelectionValidation,
} from '@/lib/startPages/startPageValidation';
import {
  START_SECTION_KEYS,
  routePathForSlug,
  type StartPageRecord,
  type StartSectionKey,
  type StartTemplateConfig,
} from '@/lib/startPages/startPageSchema';

interface Props {
  record: StartPageRecord;
  priceOptions: SafePriceOption[];
  validation: StartPageSelectionValidation;
  hasPublished: boolean;
}

const SECTION_LABELS: Record<StartSectionKey, string> = {
  hero: 'Hero',
  heroRail: 'Hero rail (marquee)',
  systemCards: 'System cards',
  trial: 'Trial / process',
  pricing: 'Pricing',
  faq: 'FAQ',
  finalCta: 'Final CTA',
};

/** Trim a value to undefined when empty so config never overrides a default with ''. */
function clean(value: string): string | undefined {
  const t = value.trim();
  return t === '' ? undefined : t;
}

export default function StartPageEditor({
  record,
  priceOptions,
  validation: initialValidation,
  hasPublished: initialHasPublished,
}: Props) {
  const router = useRouter();
  const cfg = record.config ?? {};

  // ── Metadata ──
  const [primaryOfferKey, setPrimaryOfferKey] = useState(record.primaryOfferKey);
  const [seoTitle, setSeoTitle] = useState(record.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(record.seoDescription ?? '');

  // ── Price option selection (ordered by price-option sortOrder) ──
  const [selectedKeys, setSelectedKeys] = useState<string[]>(record.priceOptionKeys);

  // ── Section visibility (default: visible unless explicitly false) ──
  const [sections, setSections] = useState<Record<StartSectionKey, boolean>>(() => {
    const base = {} as Record<StartSectionKey, boolean>;
    for (const key of START_SECTION_KEYS) {
      base[key] = cfg.sections?.[key] !== false;
    }
    return base;
  });

  // ── Scalar copy zones ──
  const [heroEyebrow, setHeroEyebrow] = useState(cfg.hero?.eyebrow ?? '');
  const [heroHeadline, setHeroHeadline] = useState(cfg.hero?.headline ?? '');
  const [heroSubheadline, setHeroSubheadline] = useState(cfg.hero?.subheadline ?? '');
  const [heroCtaNote, setHeroCtaNote] = useState(cfg.hero?.ctaNote ?? '');
  const [heroImage, setHeroImage] = useState(cfg.hero?.image ?? '');
  const [heroOverlay, setHeroOverlay] = useState<'' | 'light' | 'medium' | 'dark'>(
    cfg.hero?.overlay ?? '',
  );
  const [pricingHeading, setPricingHeading] = useState(cfg.pricing?.heading ?? '');
  const [pricingIntro, setPricingIntro] = useState(cfg.pricing?.intro ?? '');
  const [trialEyebrow, setTrialEyebrow] = useState(cfg.trial?.eyebrow ?? '');
  const [trialHeading, setTrialHeading] = useState(cfg.trial?.heading ?? '');
  const [trialIntro, setTrialIntro] = useState(cfg.trial?.intro ?? '');
  const [systemHeading, setSystemHeading] = useState(cfg.systemCards?.heading ?? '');
  const [systemIntro, setSystemIntro] = useState(cfg.systemCards?.intro ?? '');
  const [faqTitle, setFaqTitle] = useState(cfg.faq?.title ?? '');
  const [finalCtaHeading, setFinalCtaHeading] = useState(cfg.finalCta?.heading ?? '');
  const [finalCtaNote, setFinalCtaNote] = useState(cfg.finalCta?.note ?? '');

  // ── Array zones (JSON textareas — advanced) ──
  const [railItemsJson, setRailItemsJson] = useState(
    cfg.heroRail?.items ? JSON.stringify(cfg.heroRail.items, null, 2) : '',
  );
  const [systemCardsJson, setSystemCardsJson] = useState(
    cfg.systemCards?.cards ? JSON.stringify(cfg.systemCards.cards, null, 2) : '',
  );
  const [trialStepsJson, setTrialStepsJson] = useState(
    cfg.trial?.steps ? JSON.stringify(cfg.trial.steps, null, 2) : '',
  );
  const [faqItemsJson, setFaqItemsJson] = useState(
    cfg.faq?.items ? JSON.stringify(cfg.faq.items, null, 2) : '',
  );

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validation, setValidation] = useState<StartPageSelectionValidation>(initialValidation);
  const [hasPublished, setHasPublished] = useState(initialHasPublished);

  const issuesByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of validation.priceOptionIssues) map.set(issue.priceOptionKey, issue.reason);
    return map;
  }, [validation]);

  function toggleSection(key: StartSectionKey) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  /** Build config from form state, or throw with a friendly message on bad JSON. */
  function buildConfig(): StartTemplateConfig {
    const parseArray = (label: string, raw: string): unknown | undefined => {
      const t = raw.trim();
      if (t === '') return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(t);
      } catch {
        throw new Error(`${label}: invalid JSON`);
      }
      if (!Array.isArray(parsed)) throw new Error(`${label}: must be a JSON array`);
      return parsed;
    };

    const hero = {
      eyebrow: heroEyebrow.trim() === '' ? undefined : heroEyebrow.trim(),
      headline: clean(heroHeadline),
      subheadline: clean(heroSubheadline),
      ctaNote: clean(heroCtaNote),
      image: clean(heroImage),
      overlay: heroOverlay === '' ? undefined : heroOverlay,
    };
    const heroDefined = Object.values(hero).some((v) => v !== undefined);

    const railItems = parseArray('Hero rail items', railItemsJson) as string[] | undefined;
    const systemCards = parseArray('System cards', systemCardsJson) as unknown[] | undefined;
    const trialSteps = parseArray('Trial steps', trialStepsJson) as unknown[] | undefined;
    const faqItems = parseArray('FAQ items', faqItemsJson) as unknown[] | undefined;

    const systemCardsObj = {
      heading: clean(systemHeading),
      intro: clean(systemIntro),
      cards: systemCards,
    };
    const trialObj = {
      eyebrow: clean(trialEyebrow),
      heading: clean(trialHeading),
      intro: clean(trialIntro),
      steps: trialSteps,
    };
    const pricingObj = { heading: clean(pricingHeading), intro: clean(pricingIntro) };
    const faqObj = { title: clean(faqTitle), items: faqItems };
    const finalCtaObj = { heading: clean(finalCtaHeading), note: clean(finalCtaNote) };

    const defined = (obj: Record<string, unknown>) =>
      Object.values(obj).some((v) => v !== undefined);

    const config: Record<string, unknown> = {
      sections: { ...sections },
    };
    if (heroDefined) config.hero = hero;
    if (railItems) config.heroRail = { items: railItems };
    if (defined(systemCardsObj)) config.systemCards = systemCardsObj;
    if (defined(trialObj)) config.trial = trialObj;
    if (defined(pricingObj)) config.pricing = pricingObj;
    if (defined(faqObj)) config.faq = faqObj;
    if (defined(finalCtaObj)) config.finalCta = finalCtaObj;

    return config as StartTemplateConfig;
  }

  async function handleSave(): Promise<boolean> {
    setError('');
    setSuccess('');
    let config: StartTemplateConfig;
    try {
      config = buildConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid config');
      return false;
    }

    // Emit selected keys in price-option sortOrder for deterministic card order.
    const orderedKeys = priceOptions
      .map((o) => o.priceOptionKey)
      .filter((k) => selectedKeys.includes(k));
    // Preserve any selected keys not present in the current options list (e.g.
    // offer key changed before reload) at the end.
    for (const k of selectedKeys) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/start-pages/${record.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateKey: record.templateKey,
          primaryOfferKey: primaryOfferKey.trim(),
          priceOptionKeys: orderedKeys,
          seoTitle: clean(seoTitle) ?? null,
          seoDescription: clean(seoDescription) ?? null,
          config,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Save failed');
        return false;
      }
      if (json.validation) setValidation(json.validation);
      setSuccess('Draft saved.');
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const saved = await handleSave();
    if (!saved) return;
    if (!window.confirm(`Publish "${record.slug}" to ${routePathForSlug(record.slug)}?`)) return;
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/start-pages/${record.slug}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.validation) setValidation(json.validation);
        const detail =
          json.validation?.errors?.length > 0
            ? `\n\n- ${json.validation.errors.join('\n- ')}`
            : '';
        setError((json.error ?? 'Publish failed') + detail);
        return;
      }
      setHasPublished(true);
      setSuccess(`Published to ${routePathForSlug(record.slug)}.`);
    } finally {
      setPublishing(false);
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <>
      <Head>
        <title>Start Page · {record.slug} · Admin</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Start Page: {record.slug}</h1>
            <p className="mt-1 text-sm text-gray-500 font-mono">{routePathForSlug(record.slug)}</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/admin/start-pages/${record.slug}/preview`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Preview ↗
            </a>
            <Link
              href="/admin/start-pages"
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              &larr; All Start Pages
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          Presentation only. To change billing, trial length, entitlements, or grants, use{' '}
          <Link href="/admin/offers" className="underline font-medium">Offers &amp; Bundles</Link>.
          {hasPublished ? ' This page currently has a published version.' : ' Not yet published.'}
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        {/* Validation summary */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="mb-6 space-y-2">
            {validation.errors.map((msg) => (
              <div key={msg} className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {msg}
              </div>
            ))}
            {validation.warnings.map((msg) => (
              <div key={msg} className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {msg}
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata &amp; SEO</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Template</label>
              <input className={inputClass} value={record.templateKey} disabled />
            </div>
            <div>
              <label className={labelClass}>Primary offer key</label>
              <input
                className={inputClass}
                value={primaryOfferKey}
                onChange={(e) => setPrimaryOfferKey(e.target.value)}
                placeholder="fine-diet-method"
              />
              <p className="mt-1 text-xs text-gray-400">
                Save &amp; reload to refresh the price options for a changed offer key.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>SEO title</label>
              <input className={inputClass} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={160} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>SEO description</label>
              <textarea className={inputClass} rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={320} />
            </div>
          </div>
        </section>

        {/* Price options */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Price options</h2>
          <p className="text-sm text-gray-500 mb-4">
            Choose which approved price options render (in list order). Selecting keys here does not
            change billing — keys are validated against Offers &amp; Bundles.
          </p>
          {priceOptions.length === 0 ? (
            <p className="text-sm text-amber-700">
              No price options found for <code>{primaryOfferKey}</code>. Create/activate them in Offers &amp; Bundles.
            </p>
          ) : (
            <div className="space-y-2">
              {priceOptions.map((opt) => {
                const issue = issuesByKey.get(opt.priceOptionKey);
                return (
                  <label key={opt.priceOptionKey} className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(opt.priceOptionKey)}
                      onChange={() => toggleKey(opt.priceOptionKey)}
                    />
                    <span className="flex-1 text-sm text-gray-900">{opt.name}</span>
                    <span className="font-mono text-xs text-gray-500">{opt.priceOptionKey}</span>
                    {!opt.isActive && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">inactive</span>
                    )}
                    {issue && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">{issue}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Section visibility */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Section visibility</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {START_SECTION_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />
                {SECTION_LABELS[key]}
              </label>
            ))}
          </div>
        </section>

        {/* Copy zones */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Copy</h2>
          <p className="text-xs text-gray-400 mb-4">Leave a field blank to use the template default.</p>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">Hero</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div><label className={labelClass}>Eyebrow</label><input className={inputClass} value={heroEyebrow} onChange={(e) => setHeroEyebrow(e.target.value)} /></div>
            <div>
              <label className={labelClass}>Overlay</label>
              <select className={inputClass} value={heroOverlay} onChange={(e) => setHeroOverlay(e.target.value as typeof heroOverlay)}>
                <option value="">Default (dark)</option>
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="md:col-span-2"><label className={labelClass}>Headline</label><input className={inputClass} value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Subheadline</label><textarea className={inputClass} rows={2} value={heroSubheadline} onChange={(e) => setHeroSubheadline(e.target.value)} /></div>
            <div><label className={labelClass}>CTA note</label><input className={inputClass} value={heroCtaNote} onChange={(e) => setHeroCtaNote(e.target.value)} /></div>
            <div><label className={labelClass}>Hero image URL</label><input className={inputClass} value={heroImage} onChange={(e) => setHeroImage(e.target.value)} /></div>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">Pricing (copy only)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div><label className={labelClass}>Heading</label><input className={inputClass} value={pricingHeading} onChange={(e) => setPricingHeading(e.target.value)} /></div>
            <div><label className={labelClass}>Intro</label><input className={inputClass} value={pricingIntro} onChange={(e) => setPricingIntro(e.target.value)} /></div>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">Trial / process</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div><label className={labelClass}>Eyebrow</label><input className={inputClass} value={trialEyebrow} onChange={(e) => setTrialEyebrow(e.target.value)} /></div>
            <div><label className={labelClass}>Heading</label><input className={inputClass} value={trialHeading} onChange={(e) => setTrialHeading(e.target.value)} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Intro</label><textarea className={inputClass} rows={2} value={trialIntro} onChange={(e) => setTrialIntro(e.target.value)} /></div>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">System cards</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div><label className={labelClass}>Heading</label><input className={inputClass} value={systemHeading} onChange={(e) => setSystemHeading(e.target.value)} /></div>
            <div><label className={labelClass}>Intro</label><input className={inputClass} value={systemIntro} onChange={(e) => setSystemIntro(e.target.value)} /></div>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">FAQ &amp; Final CTA</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>FAQ title</label><input className={inputClass} value={faqTitle} onChange={(e) => setFaqTitle(e.target.value)} /></div>
            <div><label className={labelClass}>Final CTA heading</label><input className={inputClass} value={finalCtaHeading} onChange={(e) => setFinalCtaHeading(e.target.value)} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Final CTA note</label><input className={inputClass} value={finalCtaNote} onChange={(e) => setFinalCtaNote(e.target.value)} /></div>
          </div>
        </section>

        {/* Advanced array content */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Advanced content (JSON)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Repeating content as JSON arrays. Leave blank to use template defaults. Invalid JSON blocks save.
          </p>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Hero rail items <span className="text-gray-400">(string[])</span></label>
              <textarea className={`${inputClass} font-mono text-xs`} rows={4} value={railItemsJson} onChange={(e) => setRailItemsJson(e.target.value)} placeholder={'["Food clarity", "Body signals"]'} />
            </div>
            <div>
              <label className={labelClass}>System cards <span className="text-gray-400">({'{ id, headline, description, image }[]'})</span></label>
              <textarea className={`${inputClass} font-mono text-xs`} rows={6} value={systemCardsJson} onChange={(e) => setSystemCardsJson(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Trial steps <span className="text-gray-400">({'{ number, title, body }[]'})</span></label>
              <textarea className={`${inputClass} font-mono text-xs`} rows={6} value={trialStepsJson} onChange={(e) => setTrialStepsJson(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>FAQ items <span className="text-gray-400">({'{ question, answer }[]'})</span></label>
              <textarea className={`${inputClass} font-mono text-xs`} rows={6} value={faqItemsJson} onChange={(e) => setFaqItemsJson(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="sticky bottom-0 flex items-center gap-3 bg-white/90 backdrop-blur border-t border-gray-200 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || publishing}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving || publishing}
            className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-40"
          >
            {publishing ? 'Publishing…' : 'Save & publish'}
          </button>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = String(context.params?.slug ?? '').trim().toLowerCase();
  if (!slug) return { notFound: true };

  const record =
    (await getStartPageBySlug(slug, 'draft')) ??
    (await getStartPageBySlug(slug, 'published'));
  if (!record) return { notFound: true };

  // Editing always targets the draft copy.
  const draftRecord: StartPageRecord = { ...record, status: 'draft' };
  const priceOptions = await listSafePriceOptionsForOffer(record.primaryOfferKey);
  const validation = await validateStartPageSelection(record.primaryOfferKey, record.priceOptionKeys);
  const hasPublished = Boolean(await getStartPageBySlug(slug, 'published'));

  return { props: { record: draftRecord, priceOptions, validation, hasPublished } };
};
