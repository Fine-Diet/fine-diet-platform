/**
 * Admin Page: Offers & Bundles v1.1
 *
 * Manage offers, their entitlement mappings, and grant offers to people.
 * Protected by middleware and SSR guard (editor | admin).
 *
 * v1.1 additions:
 *   - Stripe config summary column (price IDs with copy, phase summary)
 *   - Entitlement mapping actions (deactivate, copy key)
 *   - Grant Preview panel (preview before confirming, success toast with link)
 *   - Duplicate/typo offer_key warning badge
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  ENTITLEMENT_KEY_OPTIONS,
  KNOWN_ENTITLEMENT_KEYS,
} from '@/lib/access/constants';
import CopyIdButton from '@/components/admin/CopyIdButton';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Offer {
  offer_key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  purchase_provider: string | null;
  provider_product_id: string | null;
  billing_model: string;
  stripe_price_id: string | null;
  stripe_phase_price_ids: string[] | null;
  stripe_phase_iterations: number[] | null;
  success_path: string | null;
  cancel_path: string | null;
  created_at: string;
}

interface OfferEntitlement {
  id: string;
  offer_key: string;
  entitlement_key: string;
  duration_days: number | null;
  is_active: boolean;
}

interface PersonResult {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

interface AdminOffersProps {
  user: AuthenticatedUser | null;
  initialOffers: Offer[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Levenshtein distance for typo detection */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Truncate a Stripe ID for display, keeping prefix visible */
function truncateId(id: string, maxLen = 20): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen - 3) + '...';
}

/** Build Stripe summary text for an offer */
function stripeSummary(offer: Offer): { label: string; detail: string | null; copyValue: string | null } {
  const model = offer.billing_model || 'one_time';

  if (model === 'installment') {
    const phases = offer.stripe_phase_price_ids?.length ?? 0;
    const iters = offer.stripe_phase_iterations?.join('/') ?? '';
    return {
      label: phases > 0 ? `${phases} phase${phases > 1 ? 's' : ''} (${iters})` : 'No phases',
      detail: offer.stripe_phase_price_ids?.join(', ') ?? null,
      copyValue: offer.stripe_phase_price_ids?.join(', ') ?? null,
    };
  }

  if (offer.stripe_price_id) {
    return {
      label: truncateId(offer.stripe_price_id),
      detail: offer.stripe_price_id,
      copyValue: offer.stripe_price_id,
    };
  }

  return { label: '—', detail: null, copyValue: null };
}

/* ------------------------------------------------------------------ */
/*  Person Search Hook                                                 */
/* ------------------------------------------------------------------ */

function usePersonSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/people-search?q=${encodeURIComponent(query)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.people || []);
        }
      } catch {
        /* swallow */
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return { query, setQuery, results, searching, clear: () => { setQuery(''); setResults([]); } };
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminOffers({ user, initialOffers }: AdminOffersProps) {
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* --- Upsert form state --- */
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formProvider, setFormProvider] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formBillingModel, setFormBillingModel] = useState('one_time');
  const [formStripePriceId, setFormStripePriceId] = useState('');
  const [formPhasePriceIds, setFormPhasePriceIds] = useState('');
  const [formPhaseIterations, setFormPhaseIterations] = useState('');
  const [formSuccessPath, setFormSuccessPath] = useState('');
  const [formCancelPath, setFormCancelPath] = useState('');
  const [saving, setSaving] = useState(false);

  /* --- Entitlement mappings state --- */
  const [expandedOffer, setExpandedOffer] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<OfferEntitlement[]>([]);
  const [entLoading, setEntLoading] = useState(false);
  const [newEntKey, setNewEntKey] = useState('');
  const [newEntKeyOpen, setNewEntKeyOpen] = useState(false);
  const newEntKeyRef = useRef<HTMLDivElement>(null);
  const [newEntDays, setNewEntDays] = useState('');

  /* --- Grant to person state --- */
  const [grantingOffer, setGrantingOffer] = useState<string | null>(null);
  const personSearch = usePersonSearch();
  const [granting, setGranting] = useState(false);

  /* --- Link generator state --- */
  const [linksOffer, setLinksOffer] = useState<string | null>(null);
  const [linksCopied, setLinksCopied] = useState<string | null>(null);

  /* --- Grant preview state --- */
  const [previewPerson, setPreviewPerson] = useState<PersonResult | null>(null);
  const [previewEntitlements, setPreviewEntitlements] = useState<OfferEntitlement[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  /* --- Stripe detail expand state --- */
  const [stripeDetailOffer, setStripeDetailOffer] = useState<string | null>(null);

  // Close entitlement key dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (newEntKeyRef.current && !newEntKeyRef.current.contains(e.target as Node)) {
        setNewEntKeyOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredEntKeyOptions = ENTITLEMENT_KEY_OPTIONS.filter(
    (opt) => !newEntKey || opt.key.includes(newEntKey.toLowerCase()) || opt.label.toLowerCase().includes(newEntKey.toLowerCase())
  );
  const isUnknownEntKey = newEntKey.trim() !== '' && !KNOWN_ENTITLEMENT_KEYS.includes(newEntKey.trim().toLowerCase());

  // Clear messages after 5s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  /* ---- Typo detection: for each offer, find similar keys ---- */
  const typoWarnings = useMemo(() => {
    const warnings: Record<string, string[]> = {};
    const keys = offers.map((o) => o.offer_key);
    for (let i = 0; i < keys.length; i++) {
      const similar: string[] = [];
      for (let j = 0; j < keys.length; j++) {
        if (i === j) continue;
        const dist = levenshtein(keys[i], keys[j]);
        // Flag if distance is 1 or 2 and both keys are at least 5 chars long
        if (dist <= 2 && keys[i].length >= 5 && keys[j].length >= 5) {
          similar.push(keys[j]);
        }
      }
      if (similar.length > 0) {
        warnings[keys[i]] = similar;
      }
    }
    return warnings;
  }, [offers]);

  /* ---- Load entitlement mappings for an offer (read-only, no side effects) ---- */
  const loadEntitlements = useCallback(async (offerKey: string) => {
    setEntLoading(true);
    try {
      const res = await fetch(`/api/admin/offers/list-entitlements?offer_key=${encodeURIComponent(offerKey)}`);
      if (res.ok) {
        const data = await res.json();
        setEntitlements(data.entitlements || []);
      }
    } catch { /* swallow */ }
    setEntLoading(false);
  }, []);

  /* ---- Toggle expanded offer row to show entitlements ---- */
  const handleExpand = async (offerKey: string) => {
    if (expandedOffer === offerKey) {
      setExpandedOffer(null);
      setEntitlements([]);
      return;
    }
    setExpandedOffer(offerKey);
    await loadEntitlements(offerKey);
  };

  /* ---- Create/Edit offer ---- */
  const handleUpsert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKey.trim() || !formName.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/offers/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_key: formKey.trim().toLowerCase(),
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          purchase_provider: formProvider.trim() || undefined,
          provider_product_id: formProductId.trim() || undefined,
          billing_model: formBillingModel,
          stripe_price_id: formStripePriceId.trim() || undefined,
          stripe_phase_price_ids: formPhasePriceIds.trim()
            ? formPhasePriceIds.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          stripe_phase_iterations: formPhaseIterations.trim()
            ? formPhaseIterations.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
            : undefined,
          success_path: formSuccessPath.trim() || undefined,
          cancel_path: formCancelPath.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save offer');
      }

      const data = await res.json();
      const updated = data.offer as Offer;

      setOffers((prev) => {
        const idx = prev.findIndex((o) => o.offer_key === updated.offer_key);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [updated, ...prev];
      });

      setSuccess(`Offer "${updated.name}" saved successfully.`);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save offer');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setFormKey('');
    setFormName('');
    setFormDesc('');
    setFormProvider('');
    setFormProductId('');
    setFormBillingModel('one_time');
    setFormStripePriceId('');
    setFormPhasePriceIds('');
    setFormPhaseIterations('');
    setFormSuccessPath('');
    setFormCancelPath('');
  };

  const editOffer = (offer: Offer) => {
    setFormKey(offer.offer_key);
    setFormName(offer.name);
    setFormDesc(offer.description || '');
    setFormProvider(offer.purchase_provider || '');
    setFormProductId(offer.provider_product_id || '');
    setFormBillingModel(offer.billing_model || 'one_time');
    setFormStripePriceId(offer.stripe_price_id || '');
    setFormPhasePriceIds(offer.stripe_phase_price_ids?.join(', ') || '');
    setFormPhaseIterations(offer.stripe_phase_iterations?.join(', ') || '');
    setFormSuccessPath(offer.success_path || '');
    setFormCancelPath(offer.cancel_path || '');
    setShowForm(true);
  };

  /* ---- Toggle active ---- */
  const handleToggleActive = async (offerKey: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/offers/set-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_key: offerKey, is_active: !isActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const data = await res.json();
      setOffers((prev) =>
        prev.map((o) => (o.offer_key === offerKey ? data.offer : o))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  /* ---- Add entitlement mapping ---- */
  const handleAddEntitlement = async () => {
    if (!expandedOffer || !newEntKey.trim()) return;
    try {
      const res = await fetch('/api/admin/offers/set-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_key: expandedOffer,
          entitlements: [{
            entitlement_key: newEntKey.trim().toLowerCase(),
            duration_days: newEntDays ? parseInt(newEntDays, 10) : null,
          }],
        }),
      });
      if (res.ok) {
        setNewEntKey('');
        setNewEntKeyOpen(false);
        setNewEntDays('');
        setSuccess('Entitlement mapping added.');
        await loadEntitlements(expandedOffer);
      }
    } catch {
      setError('Failed to add entitlement mapping');
    }
  };

  /* ---- Deactivate entitlement mapping ---- */
  const handleDeactivateMapping = async (mapping: OfferEntitlement) => {
    if (!expandedOffer) return;
    try {
      const res = await fetch('/api/admin/offers/set-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_key: expandedOffer,
          entitlements: [{
            entitlement_key: mapping.entitlement_key,
            is_active: false,
          }],
        }),
      });
      if (res.ok) {
        setSuccess(`Mapping "${mapping.entitlement_key}" deactivated.`);
        await loadEntitlements(expandedOffer);
      }
    } catch {
      setError('Failed to deactivate mapping');
    }
  };

  /* ---- Reactivate entitlement mapping ---- */
  const handleReactivateMapping = async (mapping: OfferEntitlement) => {
    if (!expandedOffer) return;
    try {
      const res = await fetch('/api/admin/offers/set-entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_key: expandedOffer,
          entitlements: [{
            entitlement_key: mapping.entitlement_key,
            is_active: true,
          }],
        }),
      });
      if (res.ok) {
        setSuccess(`Mapping "${mapping.entitlement_key}" reactivated.`);
        await loadEntitlements(expandedOffer);
      }
    } catch {
      setError('Failed to reactivate mapping');
    }
  };

  /* ---- Grant Preview: load mappings for the grant offer ---- */
  const openGrantPreview = async (person: PersonResult) => {
    if (!grantingOffer) return;
    setPreviewPerson(person);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/offers/list-entitlements?offer_key=${encodeURIComponent(grantingOffer)}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewEntitlements(
          (data.entitlements || []).filter((e: OfferEntitlement) => e.is_active)
        );
      }
    } catch { /* swallow */ }
    setPreviewLoading(false);
  };

  const closeGrantPreview = () => {
    setPreviewPerson(null);
    setPreviewEntitlements([]);
  };

  /* ---- Confirm grant from preview ---- */
  const handleConfirmGrant = async () => {
    if (!grantingOffer || !previewPerson) return;
    setGranting(true);
    try {
      const res = await fetch('/api/admin/offers/grant-to-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: previewPerson.id, offer_key: grantingOffer }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to grant offer');
      }
      const data = await res.json();
      const grantedCount = data.granted?.length || 0;
      const skippedCount = data.skipped || 0;
      setSuccess(
        `Granted ${grantedCount} entitlement${grantedCount !== 1 ? 's' : ''} to ${previewPerson.email}` +
        (skippedCount > 0 ? ` (${skippedCount} skipped — already active)` : '') +
        `. View: /admin/entitlements?person_id=${previewPerson.id}`
      );
      closeGrantPreview();
      setGrantingOffer(null);
      personSearch.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant offer');
    } finally {
      setGranting(false);
    }
  };

  /* ---- Link generator helpers ---- */
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://myfinediet.com';

  const buildBuyLink = (offerKey: string, params?: Record<string, string>) => {
    const url = new URL(`${siteUrl}/buy/${offerKey}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }
    return url.toString();
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setLinksCopied(label);
    setTimeout(() => setLinksCopied(null), 2000);
  };

  /* ---- Access gate ---- */
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head><title>Offers & Bundles - Fine Diet</title></Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">You don&apos;t have permission to access this area.</p>
            <Link href="/admin" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">
              Return to Admin Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head><title>Offers & Bundles - Fine Diet</title></Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Offers & Bundles</h1>
                <p className="text-lg text-gray-600">Create offers, map entitlements, and grant access to users.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowForm((v) => !v)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {showForm ? 'Cancel' : '+ New Offer'}
                </button>
                <Link href="/admin" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">dismiss</button>
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          {/* Create/Edit Form */}
          {showForm && (
            <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{formKey ? 'Edit Offer' : 'Create Offer'}</h2>
              <form onSubmit={handleUpsert} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offer Key *</label>
                  <input
                    type="text"
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    placeholder="e.g. journal-monthly"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Journal Monthly Access"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Provider</label>
                  <input
                    type="text"
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value)}
                    placeholder="e.g. stripe"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider Product ID</label>
                  <input
                    type="text"
                    value={formProductId}
                    onChange={(e) => setFormProductId(e.target.value)}
                    placeholder="e.g. prod_xxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Stripe billing configuration */}
                <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Stripe Billing Config</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Billing Model</label>
                  <select
                    value={formBillingModel}
                    onChange={(e) => setFormBillingModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="one_time">One-time</option>
                    <option value="subscription">Subscription</option>
                    <option value="installment">Installment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stripe Price ID {formBillingModel !== 'installment' && <span className="text-gray-400">(required for checkout)</span>}
                  </label>
                  <input
                    type="text"
                    value={formStripePriceId}
                    onChange={(e) => setFormStripePriceId(e.target.value)}
                    placeholder="price_1Abc..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {formBillingModel === 'installment' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phase Price IDs <span className="text-gray-400">(comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        value={formPhasePriceIds}
                        onChange={(e) => setFormPhasePriceIds(e.target.value)}
                        placeholder="price_phase1, price_phase2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phase Iterations <span className="text-gray-400">(comma-separated ints)</span>
                      </label>
                      <input
                        type="text"
                        value={formPhaseIterations}
                        onChange={(e) => setFormPhaseIterations(e.target.value)}
                        placeholder="1, 1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Success Path</label>
                  <input
                    type="text"
                    value={formSuccessPath}
                    onChange={(e) => setFormSuccessPath(e.target.value)}
                    placeholder="/home"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cancel Path</label>
                  <input
                    type="text"
                    value={formCancelPath}
                    onChange={(e) => setFormCancelPath(e.target.value)}
                    placeholder="/shop"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Offer'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Offers Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Offer Key</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Billing</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stripe</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                {offers.length === 0 ? (
                  <tbody className="bg-white">
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No offers yet. Create one above.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  offers.map((offer) => {
                    const stripe = stripeSummary(offer);
                    const typoSimilar = typoWarnings[offer.offer_key];
                    return (
                    <tbody key={offer.offer_key} className="bg-white divide-y divide-gray-200">
                      <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            <div className="flex items-center gap-1.5">
                              {offer.offer_key}
                              {typoSimilar && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded cursor-help"
                                  title={`Similar to: ${typoSimilar.join(', ')} — possible typo/duplicate`}
                                >
                                  !
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{offer.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${offer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                              {offer.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                              offer.billing_model === 'subscription' ? 'bg-blue-100 text-blue-800' :
                              offer.billing_model === 'installment' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {offer.billing_model || 'one_time'}
                            </span>
                          </td>
                          {/* Stripe summary column */}
                          <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px]">
                            {stripe.copyValue ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setStripeDetailOffer(stripeDetailOffer === offer.offer_key ? null : offer.offer_key)}
                                  className="font-mono text-xs text-gray-700 hover:text-blue-600 truncate max-w-[140px] text-left"
                                  title={stripe.detail || stripe.label}
                                >
                                  {stripe.label}
                                </button>
                                <CopyIdButton value={stripe.copyValue} label="Copy" />
                              </div>
                            ) : (
                              <span className="text-gray-400">{stripe.label}</span>
                            )}
                            {/* Expanded Stripe detail */}
                            {stripeDetailOffer === offer.offer_key && stripe.detail && (
                              <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 text-xs font-mono text-gray-800 break-all">
                                {offer.billing_model === 'installment' && offer.stripe_phase_price_ids ? (
                                  <div className="space-y-1">
                                    {offer.stripe_phase_price_ids.map((pid, i) => (
                                      <div key={pid} className="flex items-center gap-1">
                                        <span className="text-gray-500">Phase {i + 1}:</span>
                                        <span>{pid}</span>
                                        <span className="text-gray-400">
                                          &times;{offer.stripe_phase_iterations?.[i] ?? '?'}
                                        </span>
                                        <CopyIdButton value={pid} label="" />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span>{stripe.detail}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                            <button onClick={() => editOffer(offer)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                            <button onClick={() => handleToggleActive(offer.offer_key, offer.is_active)} className="text-yellow-600 hover:text-yellow-800 font-medium">
                              {offer.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => handleExpand(offer.offer_key)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                              {expandedOffer === offer.offer_key ? 'Hide' : 'Mappings'}
                            </button>
                            <button onClick={() => { setGrantingOffer(grantingOffer === offer.offer_key ? null : offer.offer_key); personSearch.clear(); closeGrantPreview(); }} className="text-green-600 hover:text-green-800 font-medium">
                              Grant
                            </button>
                            <button onClick={() => setLinksOffer(linksOffer === offer.offer_key ? null : offer.offer_key)} className="text-cyan-600 hover:text-cyan-800 font-medium">
                              {linksOffer === offer.offer_key ? 'Hide Links' : 'Links'}
                            </button>
                          </td>
                        </tr>

                        {/* Link generator panel */}
                        {linksOffer === offer.offer_key && (
                          <tr key={`${offer.offer_key}-links`}>
                            <td colSpan={6} className="px-6 py-4 bg-cyan-50">
                              <h3 className="text-sm font-semibold text-gray-700 mb-3">Buy Links for &ldquo;{offer.name}&rdquo;</h3>
                              <div className="space-y-3">
                                {/* Plain buy link */}
                                <div className="flex items-center gap-2">
                                  <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 flex-1 truncate">
                                    {buildBuyLink(offer.offer_key)}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(buildBuyLink(offer.offer_key), `url-${offer.offer_key}`)}
                                    className="text-xs text-cyan-700 hover:text-cyan-900 font-medium whitespace-nowrap"
                                  >
                                    {linksCopied === `url-${offer.offer_key}` ? 'Copied!' : 'Copy URL'}
                                  </button>
                                </div>
                                {/* Email link (placement=email) */}
                                <div className="flex items-center gap-2">
                                  <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 flex-1 truncate">
                                    {buildBuyLink(offer.offer_key, { placement: 'email', source: 'link' })}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(buildBuyLink(offer.offer_key, { placement: 'email', source: 'link' }), `email-${offer.offer_key}`)}
                                    className="text-xs text-cyan-700 hover:text-cyan-900 font-medium whitespace-nowrap"
                                  >
                                    {linksCopied === `email-${offer.offer_key}` ? 'Copied!' : 'Copy Email Link'}
                                  </button>
                                </div>
                                {/* HTML link */}
                                <div className="flex items-center gap-2">
                                  <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 flex-1 truncate">
                                    {`<a href="${buildBuyLink(offer.offer_key, { placement: 'email', source: 'link' })}">Buy ${offer.name}</a>`}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(
                                      `<a href="${buildBuyLink(offer.offer_key, { placement: 'email', source: 'link' })}">Buy ${offer.name}</a>`,
                                      `html-${offer.offer_key}`
                                    )}
                                    className="text-xs text-cyan-700 hover:text-cyan-900 font-medium whitespace-nowrap"
                                  >
                                    {linksCopied === `html-${offer.offer_key}` ? 'Copied!' : 'Copy HTML'}
                                  </button>
                                </div>
                                {/* UTM template */}
                                <div className="flex items-center gap-2">
                                  <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 flex-1 truncate">
                                    {buildBuyLink(offer.offer_key, {
                                      placement: 'email',
                                      source: 'link',
                                      utm_source: 'newsletter',
                                      utm_medium: 'email',
                                      utm_campaign: 'CAMPAIGN_NAME',
                                    })}
                                  </code>
                                  <button
                                    onClick={() => copyToClipboard(
                                      buildBuyLink(offer.offer_key, {
                                        placement: 'email',
                                        source: 'link',
                                        utm_source: 'newsletter',
                                        utm_medium: 'email',
                                        utm_campaign: 'CAMPAIGN_NAME',
                                      }),
                                      `utm-${offer.offer_key}`
                                    )}
                                    className="text-xs text-cyan-700 hover:text-cyan-900 font-medium whitespace-nowrap"
                                  >
                                    {linksCopied === `utm-${offer.offer_key}` ? 'Copied!' : 'Copy UTM Template'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Expanded: Entitlement mappings */}
                        {expandedOffer === offer.offer_key && (
                          <tr key={`${offer.offer_key}-ent`}>
                            <td colSpan={6} className="px-6 py-4 bg-gray-50">
                              <h3 className="text-sm font-semibold text-gray-700 mb-3">Entitlement Mappings</h3>
                              {entLoading ? (
                                <p className="text-sm text-gray-500">Loading...</p>
                              ) : (
                                <>
                                  {entitlements.length > 0 ? (
                                    <table className="min-w-full mb-4 text-sm text-gray-900">
                                      <thead>
                                        <tr className="border-b border-gray-200">
                                          <th className="text-left py-1 px-2 font-medium text-gray-700">Key</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-700">Duration (days)</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-700">Active</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-700">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entitlements.map((ent) => {
                                          const isUnknown = !KNOWN_ENTITLEMENT_KEYS.includes(ent.entitlement_key);
                                          return (
                                          <tr key={ent.id} className="border-b border-gray-100">
                                            <td className="py-1.5 px-2 font-mono text-gray-900">
                                              <div className="flex items-center gap-1">
                                                {ent.entitlement_key}
                                                <CopyIdButton value={ent.entitlement_key} label="" />
                                                {isUnknown && (
                                                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded" title="Not in entitlement key registry">
                                                    Unknown key
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-1.5 px-2 text-gray-900">{ent.duration_days ?? 'Perpetual'}</td>
                                            <td className="py-1.5 px-2">
                                              <span className={ent.is_active ? 'text-green-600' : 'text-gray-400'}>{ent.is_active ? 'Yes' : 'No'}</span>
                                            </td>
                                            <td className="py-1.5 px-2">
                                              {ent.is_active ? (
                                                <button
                                                  onClick={() => handleDeactivateMapping(ent)}
                                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                                >
                                                  Deactivate
                                                </button>
                                              ) : (
                                                <button
                                                  onClick={() => handleReactivateMapping(ent)}
                                                  className="text-xs text-green-600 hover:text-green-800 font-medium"
                                                >
                                                  Reactivate
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-sm text-gray-500 mb-4">No entitlement mappings yet.</p>
                                  )}
                                  {/* Add mapping form */}
                                  <div className="flex items-end gap-3">
                                    <div ref={newEntKeyRef} className="relative">
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Entitlement Key</label>
                                      <input
                                        type="text"
                                        value={newEntKey}
                                        onChange={(e) => { setNewEntKey(e.target.value); setNewEntKeyOpen(true); }}
                                        onFocus={() => setNewEntKeyOpen(true)}
                                        placeholder="Type or select..."
                                        className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white w-48"
                                        autoComplete="off"
                                      />
                                      {newEntKeyOpen && filteredEntKeyOptions.length > 0 && (
                                        <ul className="absolute z-10 w-56 bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                                          {filteredEntKeyOptions.map((opt) => (
                                            <li key={opt.key}>
                                              <button
                                                type="button"
                                                onClick={() => { setNewEntKey(opt.key); setNewEntKeyOpen(false); }}
                                                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-sm transition-colors"
                                              >
                                                <span className="font-mono text-gray-900">{opt.key}</span>
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {isUnknownEntKey && !newEntKeyOpen && (
                                        <p className="text-xs text-amber-600 mt-0.5">Not in registry</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Duration (days)</label>
                                      <input type="number" value={newEntDays} onChange={(e) => setNewEntDays(e.target.value)} placeholder="empty = perpetual" className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white w-40" />
                                    </div>
                                    <button onClick={handleAddEntitlement} className="px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors">
                                      Add
                                    </button>
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        )}

                        {/* Grant to person with preview */}
                        {grantingOffer === offer.offer_key && (
                          <tr key={`${offer.offer_key}-grant`}>
                            <td colSpan={6} className="px-6 py-4 bg-green-50">
                              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                Grant &ldquo;{offer.name}&rdquo; to a person
                              </h3>

                              {/* Grant Preview Panel */}
                              {previewPerson ? (
                                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-gray-800">Grant Preview</h4>
                                    <button onClick={closeGrantPreview} className="text-xs text-gray-500 hover:text-gray-700">&times; Close</button>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-3">
                                    Granting to: <strong>{previewPerson.email}</strong>
                                    {(previewPerson.first_name || previewPerson.last_name) && (
                                      <span className="text-gray-500"> ({[previewPerson.first_name, previewPerson.last_name].filter(Boolean).join(' ')})</span>
                                    )}
                                  </p>

                                  {previewLoading ? (
                                    <p className="text-xs text-gray-500">Loading mappings...</p>
                                  ) : previewEntitlements.length > 0 ? (
                                    <table className="min-w-full text-sm mb-3">
                                      <thead>
                                        <tr className="border-b border-gray-200">
                                          <th className="text-left py-1 px-2 font-medium text-gray-600 text-xs">Entitlement</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-600 text-xs">Duration</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-600 text-xs">Computed ends_at</th>
                                          <th className="text-left py-1 px-2 font-medium text-gray-600 text-xs">Source</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewEntitlements.map((ent) => {
                                          const now = new Date();
                                          let computedEnd = 'Never (perpetual)';
                                          if (ent.duration_days && ent.duration_days > 0) {
                                            const end = new Date(now);
                                            end.setDate(end.getDate() + ent.duration_days);
                                            computedEnd = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                          }
                                          return (
                                            <tr key={ent.id} className="border-b border-gray-100">
                                              <td className="py-1 px-2 font-mono text-gray-900 text-xs">{ent.entitlement_key}</td>
                                              <td className="py-1 px-2 text-gray-700 text-xs">{ent.duration_days ? `${ent.duration_days} days` : 'Perpetual'}</td>
                                              <td className="py-1 px-2 text-gray-700 text-xs">{computedEnd}</td>
                                              <td className="py-1 px-2 text-gray-500 text-xs">offer</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="text-xs text-amber-600 mb-3">No active entitlement mappings found for this offer.</p>
                                  )}

                                  <div className="flex gap-2">
                                    <button
                                      onClick={handleConfirmGrant}
                                      disabled={granting || previewEntitlements.length === 0}
                                      className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                      {granting ? 'Granting...' : `Confirm Grant (${previewEntitlements.length} entitlement${previewEntitlements.length !== 1 ? 's' : ''})`}
                                    </button>
                                    <button onClick={closeGrantPreview} className="px-4 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={personSearch.query}
                                    onChange={(e) => personSearch.setQuery(e.target.value)}
                                    placeholder="Search by email or name..."
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white w-80 mb-2"
                                  />
                                  {personSearch.searching && <p className="text-xs text-gray-500">Searching...</p>}
                                  {personSearch.results.length > 0 && (
                                    <ul className="bg-white border border-gray-200 rounded-md divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                      {personSearch.results.map((p) => (
                                        <li key={p.id} className="px-3 py-2 hover:bg-gray-50">
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-900">
                                              {p.email}{' '}
                                              {(p.first_name || p.last_name) && (
                                                <span className="text-gray-500">({[p.first_name, p.last_name].filter(Boolean).join(' ')})</span>
                                              )}
                                            </span>
                                            <button
                                              onClick={() => openGrantPreview(p)}
                                              className="ml-3 px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                                            >
                                              Preview Grant
                                            </button>
                                          </div>
                                          <div className="mt-0.5 flex items-center gap-2">
                                            <span className="text-xs text-gray-400 font-mono">{p.id}</span>
                                            <CopyIdButton value={p.id} />
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                    </tbody>
                    );
                  })
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminOffersProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, initialOffers: [] } };
  }

  // Load offers (small set, safe for SSR)
  const { data: offers } = await supabaseAdmin
    .from('offers')
    .select('offer_key, name, description, is_active, purchase_provider, provider_product_id, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations, success_path, cancel_path, created_at')
    .order('created_at', { ascending: false });

  return {
    props: {
      user,
      initialOffers: (offers ?? []) as Offer[],
    },
  };
};
