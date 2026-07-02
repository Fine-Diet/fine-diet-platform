/**
 * Admin: /admin/start-pages/[slug]
 *
 * Edit one Start Page draft: metadata, SEO, approved price option selection,
 * section visibility, presentation copy, and controlled runtime-module zones.
 *
 * PRESENTATION ONLY. There are no controls here for billing models, Stripe
 * price IDs, trial enforcement, entitlement mappings, or grants — those live in
 * Offers & Bundles. Price options are chosen from already-approved keys.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

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
import {
  START_RUNTIME_MODULE_TYPE_KEYS,
  START_RUNTIME_MODULE_ZONE_KEYS,
} from '@/lib/startPages/startRuntimeModules';

interface Props {
  record: StartPageRecord;
  priceOptions: SafePriceOption[];
  validation: StartPageSelectionValidation;
  hasPublished: boolean;
}

type SystemCardInput = {
  id: string;
  eyebrow: string;
  headline: string;
  description: string;
  image: string;
};

type TrialStepInput = {
  number: string;
  title: string;
  body: string;
};

type FaqItemInput = {
  id: string;
  question: string;
  answer: string;
};

const SECTION_LABELS: Record<StartSectionKey, string> = {
  hero: 'Hero',
  heroRail: 'Hero rail (marquee)',
  systemCards: 'System cards',
  trial: 'Trial / process',
  pricing: 'Pricing',
  faq: 'FAQ',
  finalCta: 'Final CTA',
};

const RUNTIME_MODULE_EXAMPLE = JSON.stringify(
  {
    beforePricing: [
      {
        id: 'start-comparison',
        type: 'comparison.table.v1',
        content: {
          heading: 'A clearer way to choose your nutrition path',
          columns: { left: 'Fine Diet', right: 'Generic tracking' },
          rows: [
            {
              label: 'Starting point',
              left: 'Uses your logs, rhythm, and real life.',
              right: 'Starts from a generic template.',
            },
          ],
        },
      },
    ],
  },
  null,
  2,
);

/** Trim a value to undefined when empty so config never overrides a default with ''. */
function clean(value: string): string | undefined {
  const t = value.trim();
  return t === '' ? undefined : t;
}

function hasContent(values: string[]): boolean {
  return values.some((value) => value.trim() !== '');
}

function moveListItem<T>(
  setter: Dispatch<SetStateAction<T[]>>,
  index: number,
  direction: 'up' | 'down',
) {
  setter((prev) => {
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= prev.length) return prev;
    const next = [...prev];
    [next[index], next[swap]] = [next[swap], next[index]];
    return next;
  });
}

function removeListItem<T>(setter: Dispatch<SetStateAction<T[]>>, index: number) {
  setter((prev) => prev.filter((_, i) => i !== index));
}

function newSystemCard(index: number): SystemCardInput {
  return { id: `system-card-${index + 1}`, eyebrow: '', headline: '', description: '', image: '' };
}

function newTrialStep(index: number): TrialStepInput {
  return { number: String(index + 1), title: '', body: '' };
}

function newFaqItem(index: number): FaqItemInput {
  return { id: `faq-${index + 1}`, question: '', answer: '' };
}

export default function StartPageEditor({
  record,
  priceOptions,
  validation: initialValidation,
  hasPublished: initialHasPublished,
}: Props) {
  const cfg = record.config ?? {};

  const [primaryOfferKey, setPrimaryOfferKey] = useState(record.primaryOfferKey);
  const [seoTitle, setSeoTitle] = useState(record.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(record.seoDescription ?? '');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(record.priceOptionKeys);

  const [sections, setSections] = useState<Record<StartSectionKey, boolean>>(() => {
    const base = {} as Record<StartSectionKey, boolean>;
    for (const key of START_SECTION_KEYS) base[key] = cfg.sections?.[key] !== false;
    return base;
  });

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

  const [railItems, setRailItems] = useState<string[]>(() => cfg.heroRail?.items ?? []);
  const [systemCards, setSystemCards] = useState<SystemCardInput[]>(() =>
    (cfg.systemCards?.cards ?? []).map((card, index) => ({
      id: card.id ?? `system-card-${index + 1}`,
      eyebrow: card.eyebrow ?? '',
      headline: card.headline ?? '',
      description: card.description ?? '',
      image: card.image ?? '',
    })),
  );
  const [trialSteps, setTrialSteps] = useState<TrialStepInput[]>(() =>
    (cfg.trial?.steps ?? []).map((step, index) => ({
      number: step.number ?? String(index + 1),
      title: step.title ?? '',
      body: step.body ?? '',
    })),
  );
  const [faqItems, setFaqItems] = useState<FaqItemInput[]>(() =>
    (cfg.faq?.items ?? []).map((item, index) => ({
      id: item.id ?? `faq-${index + 1}`,
      question: item.question ?? '',
      answer: item.answer ?? '',
    })),
  );
  const [runtimeModulesJson, setRuntimeModulesJson] = useState(
    cfg.runtimeModules ? JSON.stringify(cfg.runtimeModules, null, 2) : '',
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

  function updateSystemCard(index: number, patch: Partial<SystemCardInput>) {
    setSystemCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  function updateTrialStep(index: number, patch: Partial<TrialStepInput>) {
    setTrialSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function updateFaqItem(index: number, patch: Partial<FaqItemInput>) {
    setFaqItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function buildConfig(): StartTemplateConfig {
    const parseObject = (label: string, raw: string): unknown | undefined => {
      const t = raw.trim();
      if (t === '') return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(t);
      } catch {
        throw new Error(`${label}: invalid JSON`);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label}: must be a JSON object`);
      }
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

    const filteredRailItems = railItems.map((item) => item.trim()).filter(Boolean);
    const filteredSystemCards = systemCards
      .filter((card) => hasContent([card.id, card.eyebrow, card.headline, card.description, card.image]))
      .map((card, index) => ({
        id: clean(card.id) ?? `system-card-${index + 1}`,
        eyebrow: clean(card.eyebrow),
        headline: clean(card.headline) ?? '',
        description: clean(card.description) ?? '',
        image: clean(card.image) ?? '',
      }));
    const filteredTrialSteps = trialSteps
      .filter((step) => hasContent([step.number, step.title, step.body]))
      .map((step, index) => ({
        number: clean(step.number) ?? String(index + 1),
        title: clean(step.title) ?? '',
        body: clean(step.body) ?? '',
      }));
    const filteredFaqItems = faqItems
      .filter((item) => hasContent([item.id, item.question, item.answer]))
      .map((item, index) => ({
        id: clean(item.id) ?? `faq-${index + 1}`,
        question: clean(item.question) ?? '',
        answer: clean(item.answer) ?? '',
      }));
    const runtimeModules = parseObject('Runtime module zones', runtimeModulesJson) as
      | StartTemplateConfig['runtimeModules']
      | undefined;

    const systemCardsObj = {
      heading: clean(systemHeading),
      intro: clean(systemIntro),
      cards: filteredSystemCards.length > 0 ? filteredSystemCards : undefined,
    };
    const trialObj = {
      eyebrow: clean(trialEyebrow),
      heading: clean(trialHeading),
      intro: clean(trialIntro),
      steps: filteredTrialSteps.length > 0 ? filteredTrialSteps : undefined,
    };
    const pricingObj = { heading: clean(pricingHeading), intro: clean(pricingIntro) };
    const faqObj = {
      title: clean(faqTitle),
      items: filteredFaqItems.length > 0 ? filteredFaqItems : undefined,
    };
    const finalCtaObj = { heading: clean(finalCtaHeading), note: clean(finalCtaNote) };
    const defined = (obj: Record<string, unknown>) =>
      Object.values(obj).some((v) => v !== undefined);

    const config: Record<string, unknown> = {
      sections: { ...sections },
    };
    if (heroDefined) config.hero = hero;
    if (filteredRailItems.length > 0) config.heroRail = { items: filteredRailItems };
    if (defined(systemCardsObj)) config.systemCards = systemCardsObj;
    if (defined(trialObj)) config.trial = trialObj;
    if (defined(pricingObj)) config.pricing = pricingObj;
    if (defined(faqObj)) config.faq = faqObj;
    if (defined(finalCtaObj)) config.finalCta = finalCtaObj;
    if (runtimeModules) config.runtimeModules = runtimeModules;

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

    const orderedKeys = priceOptions
      .map((o) => o.priceOptionKey)
      .filter((k) => selectedKeys.includes(k));
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
  const secondaryButtonClass =
    'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40';
  const dangerButtonClass = 'text-xs font-medium text-red-500 hover:text-red-700';

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
              href={`/admin/start-pages/${record.slug}/modules`}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Runtime modules
            </Link>
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

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Price options</h2>
          <p className="text-sm text-gray-500 mb-4">
            Choose which approved price options render. Selecting keys here does not change billing.
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

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Hero rail items</h2>
              <p className="mt-1 text-sm text-gray-500">Short rotating marquee labels below or near the hero.</p>
            </div>
            <button
              type="button"
              onClick={() => setRailItems((prev) => [...prev, ''])}
              className={secondaryButtonClass}
            >
              Add item
            </button>
          </div>
          {railItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              No custom hero rail items. Template defaults will render.
            </p>
          ) : (
            <div className="space-y-3">
              {railItems.map((item, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <div>
                    <label className={labelClass}>Item {index + 1}</label>
                    <input
                      className={inputClass}
                      value={item}
                      onChange={(e) => setRailItems((prev) => prev.map((value, i) => (i === index ? e.target.value : value)))}
                      placeholder="Food clarity"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="button" className={secondaryButtonClass} disabled={index === 0} onClick={() => moveListItem(setRailItems, index, 'up')}>Up</button>
                    <button type="button" className={secondaryButtonClass} disabled={index === railItems.length - 1} onClick={() => moveListItem(setRailItems, index, 'down')}>Down</button>
                    <button type="button" className={dangerButtonClass} onClick={() => removeListItem(setRailItems, index)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">System card inputs</h2>
              <p className="mt-1 text-sm text-gray-500">Cards used by the Start system section. Blank cards are ignored on save.</p>
            </div>
            <button
              type="button"
              onClick={() => setSystemCards((prev) => [...prev, newSystemCard(prev.length)])}
              className={secondaryButtonClass}
            >
              Add card
            </button>
          </div>
          {systemCards.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              No custom system cards. Template defaults will render.
            </p>
          ) : (
            <div className="space-y-4">
              {systemCards.map((card, index) => (
                <div key={index} className="rounded-md border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-800">Card {index + 1}</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" className={secondaryButtonClass} disabled={index === 0} onClick={() => moveListItem(setSystemCards, index, 'up')}>Up</button>
                      <button type="button" className={secondaryButtonClass} disabled={index === systemCards.length - 1} onClick={() => moveListItem(setSystemCards, index, 'down')}>Down</button>
                      <button type="button" className={dangerButtonClass} onClick={() => removeListItem(setSystemCards, index)}>Remove</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={labelClass}>ID</label><input className={inputClass} value={card.id} onChange={(e) => updateSystemCard(index, { id: e.target.value })} placeholder="system-card-1" /></div>
                    <div><label className={labelClass}>Eyebrow</label><input className={inputClass} value={card.eyebrow} onChange={(e) => updateSystemCard(index, { eyebrow: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={labelClass}>Headline</label><input className={inputClass} value={card.headline} onChange={(e) => updateSystemCard(index, { headline: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={labelClass}>Description</label><textarea className={inputClass} rows={2} value={card.description} onChange={(e) => updateSystemCard(index, { description: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={labelClass}>Image URL</label><input className={inputClass} value={card.image} onChange={(e) => updateSystemCard(index, { image: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Trial / process steps</h2>
              <p className="mt-1 text-sm text-gray-500">Step-by-step process copy. Blank steps are ignored on save.</p>
            </div>
            <button
              type="button"
              onClick={() => setTrialSteps((prev) => [...prev, newTrialStep(prev.length)])}
              className={secondaryButtonClass}
            >
              Add step
            </button>
          </div>
          {trialSteps.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              No custom process steps. Template defaults will render.
            </p>
          ) : (
            <div className="space-y-4">
              {trialSteps.map((step, index) => (
                <div key={index} className="rounded-md border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-800">Step {index + 1}</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" className={secondaryButtonClass} disabled={index === 0} onClick={() => moveListItem(setTrialSteps, index, 'up')}>Up</button>
                      <button type="button" className={secondaryButtonClass} disabled={index === trialSteps.length - 1} onClick={() => moveListItem(setTrialSteps, index, 'down')}>Down</button>
                      <button type="button" className={dangerButtonClass} onClick={() => removeListItem(setTrialSteps, index)}>Remove</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4">
                    <div><label className={labelClass}>Number</label><input className={inputClass} value={step.number} onChange={(e) => updateTrialStep(index, { number: e.target.value })} /></div>
                    <div><label className={labelClass}>Title</label><input className={inputClass} value={step.title} onChange={(e) => updateTrialStep(index, { title: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={labelClass}>Body</label><textarea className={inputClass} rows={2} value={step.body} onChange={(e) => updateTrialStep(index, { body: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">FAQ items</h2>
              <p className="mt-1 text-sm text-gray-500">Questions and answers shown in the Start FAQ section.</p>
            </div>
            <button
              type="button"
              onClick={() => setFaqItems((prev) => [...prev, newFaqItem(prev.length)])}
              className={secondaryButtonClass}
            >
              Add FAQ
            </button>
          </div>
          {faqItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              No custom FAQs. Template defaults will render.
            </p>
          ) : (
            <div className="space-y-4">
              {faqItems.map((item, index) => (
                <div key={index} className="rounded-md border border-gray-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-800">FAQ {index + 1}</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" className={secondaryButtonClass} disabled={index === 0} onClick={() => moveListItem(setFaqItems, index, 'up')}>Up</button>
                      <button type="button" className={secondaryButtonClass} disabled={index === faqItems.length - 1} onClick={() => moveListItem(setFaqItems, index, 'down')}>Down</button>
                      <button type="button" className={dangerButtonClass} onClick={() => removeListItem(setFaqItems, index)}>Remove</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={labelClass}>ID</label><input className={inputClass} value={item.id} onChange={(e) => updateFaqItem(index, { id: e.target.value })} placeholder="faq-1" /></div>
                    <div><label className={labelClass}>Question</label><input className={inputClass} value={item.question} onChange={(e) => updateFaqItem(index, { question: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={labelClass}>Answer</label><textarea className={inputClass} rows={3} value={item.answer} onChange={(e) => updateFaqItem(index, { answer: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Runtime module zones</h2>
            <Link
              href={`/admin/start-pages/${record.slug}/modules`}
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Open visual builder
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Optional Start/Launch module zones. Use the visual builder for normal edits; JSON remains only as an advanced fallback.
          </p>
          <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Advanced runtime modules JSON fallback</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">Allowed zones</p>
                <p className="mt-1 font-mono text-xs leading-5 text-gray-500">{START_RUNTIME_MODULE_ZONE_KEYS.join(', ')}</p>
              </div>
              <div className="rounded-md bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">Allowed module types</p>
                <p className="mt-1 font-mono text-xs leading-5 text-gray-500">{START_RUNTIME_MODULE_TYPE_KEYS.join(', ')}</p>
              </div>
            </div>
            <label className={`${labelClass} mt-4`}>Runtime modules JSON</label>
            <textarea
              className={`${inputClass} font-mono text-xs`}
              rows={14}
              value={runtimeModulesJson}
              onChange={(e) => setRuntimeModulesJson(e.target.value)}
              placeholder={RUNTIME_MODULE_EXAMPLE}
            />
          </details>
        </section>

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

  const draftRecord: StartPageRecord = { ...record, status: 'draft' };
  const priceOptions = await listSafePriceOptionsForOffer(record.primaryOfferKey);
  const validation = await validateStartPageSelection(record.primaryOfferKey, record.priceOptionKeys);
  const hasPublished = Boolean(await getStartPageBySlug(slug, 'published'));

  return { props: { record: draftRecord, priceOptions, validation, hasPublished } };
};