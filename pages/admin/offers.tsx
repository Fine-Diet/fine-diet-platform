/**
 * Admin Page: Offers & Bundles
 *
 * Manage offers, their entitlement mappings, and grant offers to people.
 * Protected by middleware and SSR guard (editor | admin).
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
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
/*  Person Search Hook (shared across admin pages)                     */
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

  /* --- Grant to person state --- */
  const [grantingOffer, setGrantingOffer] = useState<string | null>(null);
  const personSearch = usePersonSearch();
  const [granting, setGranting] = useState(false);

  // Clear messages after 5s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  /* ---- Fetch entitlement mappings for an offer ---- */
  const fetchEntitlements = useCallback(async (offerKey: string) => {
    setEntLoading(true);
    try {
      const res = await fetch(`/api/admin/offers/set-entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_key: offerKey, entitlements: [] }),
      });
      // This is a workaround — set-entitlements returns full list even with empty array
      // We'll actually just fetch directly
    } catch { /* swallow */ }
    setEntLoading(false);
  }, []);

  const loadEntitlements = useCallback(async (offerKey: string) => {
    setEntLoading(true);
    try {
      // Use the set-entitlements endpoint with an empty entitlements array
      // It returns the full list at the end
      // Actually, let's just issue a lightweight GET from our SSR data is gone
      // We'll do a POST with a dummy entitlement that won't match
      const res = await fetch(`/api/admin/offers/set-entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_key: offerKey, entitlements: [{ entitlement_key: '__noop__' }] }),
      });
      if (res.ok) {
        const data = await res.json();
        // Filter out the noop if it was created
        setEntitlements((data.entitlements || []).filter((e: OfferEntitlement) => e.entitlement_key !== '__noop__'));
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
        const data = await res.json();
        setEntitlements((data.entitlements || []).filter((e: OfferEntitlement) => e.entitlement_key !== '__noop__'));
        setNewEntKey('');
        setNewEntKeyOpen(false);
        setNewEntDays('');
        setSuccess('Entitlement mapping added.');
      }
    } catch (err) {
      setError('Failed to add entitlement mapping');
    }
  };

  /* ---- Grant offer to person ---- */
  const handleGrant = async (personId: string) => {
    if (!grantingOffer) return;
    setGranting(true);
    try {
      const res = await fetch('/api/admin/offers/grant-to-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, offer_key: grantingOffer }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to grant offer');
      }
      const data = await res.json();
      setSuccess(`Offer granted: ${data.granted?.length || 0} entitlements, ${data.skipped || 0} skipped.`);
      setGrantingOffer(null);
      personSearch.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant offer');
    } finally {
      setGranting(false);
    }
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
                  ← Back to Dashboard
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {offers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No offers yet. Create one above.
                      </td>
                    </tr>
                  ) : (
                    offers.map((offer) => (
                      <>
                        <tr key={offer.offer_key}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{offer.offer_key}</td>
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
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{offer.purchase_provider || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                            <button onClick={() => editOffer(offer)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                            <button onClick={() => handleToggleActive(offer.offer_key, offer.is_active)} className="text-yellow-600 hover:text-yellow-800 font-medium">
                              {offer.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => handleExpand(offer.offer_key)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                              {expandedOffer === offer.offer_key ? 'Hide Mappings' : 'Mappings'}
                            </button>
                            <button onClick={() => { setGrantingOffer(grantingOffer === offer.offer_key ? null : offer.offer_key); personSearch.clear(); }} className="text-green-600 hover:text-green-800 font-medium">
                              Grant
                            </button>
                          </td>
                        </tr>

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
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entitlements.map((ent) => (
                                          <tr key={ent.id} className="border-b border-gray-100">
                                            <td className="py-1 px-2 font-mono text-gray-900">{ent.entitlement_key}</td>
                                            <td className="py-1 px-2 text-gray-900">{ent.duration_days ?? 'Perpetual'}</td>
                                            <td className="py-1 px-2">
                                              <span className={ent.is_active ? 'text-green-600' : 'text-gray-400'}>{ent.is_active ? 'Yes' : 'No'}</span>
                                            </td>
                                          </tr>
                                        ))}
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

                        {/* Grant to person */}
                        {grantingOffer === offer.offer_key && (
                          <tr key={`${offer.offer_key}-grant`}>
                            <td colSpan={6} className="px-6 py-4 bg-green-50">
                              <h3 className="text-sm font-semibold text-gray-700 mb-3">Grant &ldquo;{offer.name}&rdquo; to a person</h3>
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
                                          onClick={() => handleGrant(p.id)}
                                          disabled={granting}
                                          className="ml-3 px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                        >
                                          {granting ? 'Granting...' : 'Grant'}
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
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
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
