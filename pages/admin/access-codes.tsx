/**
 * Admin Page: Access Codes Manager v1
 *
 * Create, edit, scope, and lifecycle-manage access codes; view redemptions.
 * Protected by middleware and an SSR guard (editor | admin), mirroring the
 * nearby /admin/offers page.
 *
 * Security posture:
 *   - Raw codes are entered ONLY in the create (and optional re-key) form.
 *     They are sent to POST /api/admin/access-codes/create, which normalizes +
 *     hashes server-side and never persists or returns the raw code.
 *   - The server never returns `code_hash`. This page never displays a digest.
 *   - The non-secret selector key (`code_key`) is what editors see and select
 *     in the Access Code Gate module builder.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AccessCodeStatus = 'draft' | 'active' | 'paused' | 'expired' | 'archived';
type AccessCodeScope = 'global' | 'start_page' | 'program' | 'integrative_care' | 'offer';

interface AccessCode {
  id: string;
  code_key: string | null;
  label: string | null;
  status: AccessCodeStatus;
  scope: AccessCodeScope;
  start_page_slug: string | null;
  program_slug: string | null;
  product_slug: string | null;
  offer_key: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  valid_from: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OfferOption {
  offer_key: string;
  name: string;
  is_active: boolean;
}

interface RedemptionRow {
  id: string;
  person_id: string | null;
  email: string | null;
  source: string | null;
  context: Record<string, unknown> | null;
  redeemed_at: string;
}

interface PersonRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface AdminAccessCodesProps {
  user: AuthenticatedUser | null;
  initialCodes: AccessCode[];
  offers: OfferOption[];
}

const STATUS_VALUES: AccessCodeStatus[] = ['draft', 'active', 'paused', 'expired', 'archived'];
const SCOPE_VALUES: AccessCodeScope[] = ['global', 'start_page', 'program', 'integrative_care', 'offer'];

const STATUS_BADGE_CLASS: Record<AccessCodeStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
  archived: 'bg-neutral-200 text-neutral-700',
};

const RAW_CODE_WARNING =
  'Raw codes are only known at creation time. Store the code in the campaign brief or password manager if needed. Fine Diet will not show it again.';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function redemptionLabel(code: AccessCode): string {
  if (code.max_redemptions === null) return `${code.redemption_count} / unlimited`;
  return `${code.redemption_count} / ${code.max_redemptions}`;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminAccessCodes({ user, initialCodes, offers }: AdminAccessCodesProps) {
  const [codes, setCodes] = useState<AccessCode[]>(initialCodes);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [query, setQuery] = useState('');

  // Create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Re-key (only when editing)
  const [rekeyOpen, setRekeyOpen] = useState(false);
  const [newRawCode, setNewRawCode] = useState('');

  // Redemptions panel
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, PersonRow>>({});
  const [redLoading, setRedLoading] = useState(false);

  const filtered = useMemo(() => {
    let rows = codes;
    if (statusFilter) rows = rows.filter((c) => c.status === statusFilter);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      rows = rows.filter((c) =>
        [c.label, c.code_key, c.offer_key].filter(Boolean).join(' ').toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [codes, statusFilter, query]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = { draft: 0, active: 0, paused: 0, expired: 0, archived: 0 };
    let totalRedemptions = 0;
    for (const c of codes) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      totalRedemptions += c.redemption_count;
    }
    return { byStatus, totalRedemptions, total: codes.length };
  }, [codes]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setRekeyOpen(false);
    setNewRawCode('');
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setRekeyOpen(false);
    setNewRawCode('');
    setShowForm(true);
  }

  function startEdit(code: AccessCode) {
    setEditingId(code.id);
    setForm({
      code: '', // never prefill raw code
      code_key: code.code_key ?? '',
      label: code.label ?? '',
      status: code.status,
      scope: code.scope,
      start_page_slug: code.start_page_slug ?? '',
      program_slug: code.program_slug ?? '',
      product_slug: code.product_slug ?? '',
      offer_key: code.offer_key ?? '',
      max_redemptions: code.max_redemptions === null ? '' : String(code.max_redemptions),
      valid_from: code.valid_from ?? '',
      expires_at: code.expires_at ?? '',
    });
    setRekeyOpen(false);
    setNewRawCode('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSuccess(null);

    if (!editingId && !form.code.trim()) {
      setError('A raw access code is required to create a code.');
      return;
    }
    if (!form.code_key.trim()) {
      setError('A code_key is required. This is the non-secret selector the module builder uses.');
      return;
    }

    setSaving(true);
    try {
      const maxRedemptions =
        form.max_redemptions.trim() === '' ? null : parseInt(form.max_redemptions, 10);

      if (editingId) {
        const body: Record<string, unknown> = {
          id: editingId,
          code_key: form.code_key.trim(),
          label: form.label.trim() || null,
          status: form.status,
          scope: form.scope,
          start_page_slug: form.start_page_slug.trim() || null,
          program_slug: form.program_slug.trim() || null,
          product_slug: form.product_slug.trim() || null,
          offer_key: form.offer_key || null,
          max_redemptions: Number.isNaN(maxRedemptions as number) ? null : maxRedemptions,
          valid_from: form.valid_from || null,
          expires_at: form.expires_at || null,
        };
        if (rekeyOpen && newRawCode.trim()) {
          body.code = newRawCode.trim();
        }
        const res = await fetch('/api/admin/access-codes/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || 'Failed to update access code');
        }
        const data = await res.json();
        replaceCode(data.code as AccessCode);
        setSuccess(`Updated “${form.code_key.trim()}”.`);
        resetForm();
      } else {
        const body: Record<string, unknown> = {
          code: form.code.trim(),
          code_key: form.code_key.trim(),
          label: form.label.trim() || null,
          status: form.status,
          scope: form.scope,
          start_page_slug: form.start_page_slug.trim() || null,
          program_slug: form.program_slug.trim() || null,
          product_slug: form.product_slug.trim() || null,
          offer_key: form.offer_key || null,
          max_redemptions: Number.isNaN(maxRedemptions as number) ? null : maxRedemptions,
          valid_from: form.valid_from || null,
          expires_at: form.expires_at || null,
        };
        const res = await fetch('/api/admin/access-codes/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || 'Failed to create access code');
        }
        const data = await res.json();
        prependCode(data.code as AccessCode);
        setSuccess(
          `Created “${form.code_key.trim()}”. ${RAW_CODE_WARNING}`,
        );
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function replaceCode(code: AccessCode) {
    setCodes((prev) => prev.map((c) => (c.id === code.id ? code : c)));
  }
  function prependCode(code: AccessCode) {
    setCodes((prev) => [code, ...prev]);
  }

  async function changeStatus(code: AccessCode, next: AccessCodeStatus) {
    setError(null);
    try {
      const res = await fetch('/api/admin/access-codes/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: code.id, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to change status');
      }
      const data = await res.json();
      replaceCode(data.code as AccessCode);
      setSuccess(`Status set to “${next}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status change failed');
    }
  }

  async function loadRedemptions(code: AccessCode) {
    setRedLoading(true);
    setRedemptions([]);
    setPeopleMap({});
    try {
      const res = await fetch(
        `/api/admin/access-codes/redemptions?id=${encodeURIComponent(code.id)}&limit=100`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load redemptions');
      }
      const data = await res.json();
      setRedemptions(data.redemptions ?? []);
      const people: Record<string, PersonRow> = {};
      for (const p of data.people ?? []) people[p.id] = p;
      setPeopleMap(people);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redemptions load failed');
    } finally {
      setRedLoading(false);
    }
  }

  async function toggleRedemptions(code: AccessCode) {
    if (expandedCodeId === code.id) {
      setExpandedCodeId(null);
      return;
    }
    setExpandedCodeId(code.id);
    await loadRedemptions(code);
  }

  /* ---- Access gate ---- */
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head><title>Access Codes - Fine Diet</title></Head>
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
      <Head><title>Access Codes - Fine Diet</title></Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Access Codes</h1>
                <p className="text-lg text-gray-600">
                  Create and manage access codes. The Access Code Gate module selects a code by its
                  non-secret <span className="font-mono">code_key</span> — never the raw code.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={startCreate}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  + New Access Code
                </button>
                <Link href="/admin" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {RAW_CODE_WARNING}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="Active" value={stats.byStatus.active} />
              <StatCard label="Draft" value={stats.byStatus.draft} />
              <StatCard label="Paused" value={stats.byStatus.paused} />
              <StatCard label="Expired" value={stats.byStatus.expired} />
              <StatCard label="Redemptions" value={stats.totalRedemptions} />
            </div>
          </div>

          {/* Status messages */}
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

          {/* Create / Edit form */}
          {showForm && (
            <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {editingId ? 'Edit Access Code' : 'Create Access Code'}
              </h2>
              {editingId ? (
                <p className="text-xs text-gray-500 mb-4">
                  Editing metadata only. The raw code is never shown. Use “Replace raw code” below to
                  re-key if needed.
                </p>
              ) : (
                <p className="text-xs text-amber-700 mb-4">{RAW_CODE_WARNING}</p>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Raw code — only on create */}
                {!editingId && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Raw access code <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setField('code', e.target.value)}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="e.g. FOUNDER-LAUNCH-2026"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Normalized with trim + uppercase before hashing. Never stored or shown again.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    code_key <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.code_key}
                    onChange={(e) => setField('code_key', e.target.value)}
                    placeholder="founder-launch-2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Non-secret selector. The module builder stores this, never the raw code.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setField('label', e.target.value)}
                    placeholder="Founder Launch Code"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value as AccessCodeStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    {STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                  <select
                    value={form.scope}
                    onChange={(e) => setField('scope', e.target.value as AccessCodeScope)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    {SCOPE_VALUES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offer attachment</label>
                  <select
                    value={form.offer_key}
                    onChange={(e) => setField('offer_key', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— none —</option>
                    {offers.map((o) => (
                      <option key={o.offer_key} value={o.offer_key}>
                        {o.name} ({o.offer_key}){o.is_active ? '' : ' — inactive'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Optional. Attaches this code to an offer for campaign context. Verification never
                    grants the offer — it only validates the code.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max redemptions</label>
                  <input
                    type="number"
                    min={1}
                    value={form.max_redemptions}
                    onChange={(e) => setField('max_redemptions', e.target.value)}
                    placeholder="empty = unlimited"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start page slug</label>
                  <input
                    type="text"
                    value={form.start_page_slug}
                    onChange={(e) => setField('start_page_slug', e.target.value)}
                    placeholder="blank = wildcard"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Program slug</label>
                  <input
                    type="text"
                    value={form.program_slug}
                    onChange={(e) => setField('program_slug', e.target.value)}
                    placeholder="blank = wildcard"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Integrative Care product slug</label>
                  <input
                    type="text"
                    value={form.product_slug}
                    onChange={(e) => setField('product_slug', e.target.value)}
                    placeholder="blank = wildcard"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid from (UTC)</label>
                  <input
                    type="datetime-local"
                    value={toInputDatetime(form.valid_from)}
                    onChange={(e) => setField('valid_from', fromInputDatetime(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires at (UTC)</label>
                  <input
                    type="datetime-local"
                    value={toInputDatetime(form.expires_at)}
                    onChange={(e) => setField('expires_at', fromInputDatetime(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Re-key (edit only) */}
                {editingId && (
                  <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                    <button
                      type="button"
                      onClick={() => setRekeyOpen((v) => !v)}
                      className="text-sm font-medium text-amber-700 hover:text-amber-900"
                    >
                      {rekeyOpen ? 'Cancel replace' : 'Replace raw code (re-key)'}
                    </button>
                    {rekeyOpen && (
                      <div className="mt-3">
                        <input
                          type="text"
                          value={newRawCode}
                          onChange={(e) => setNewRawCode(e.target.value)}
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="New raw code"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-amber-700 mt-1">
                          Replaces the stored hash. The previous raw code cannot be recovered. {RAW_CODE_WARNING}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="md:col-span-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Code'}
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

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search label, code_key, offer..."
              className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white w-72"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white"
            >
              <option value="">All statuses</option>
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Codes table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>code_key</Th>
                    <Th>Label</Th>
                    <Th>Status</Th>
                    <Th>Scope</Th>
                    <Th>Offer</Th>
                    <Th>Redemptions</Th>
                    <Th>Window</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                {filtered.length === 0 ? (
                  <tbody className="bg-white">
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                        No access codes match. Create one above.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  filtered.map((code) => (
                    <tbody key={code.id} className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {code.code_key ?? <span className="text-amber-700">missing</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{code.label ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE_CLASS[code.status]}`}>
                            {code.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{code.scope}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{code.offer_key ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{redemptionLabel(code)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          <div>{fmtDate(code.valid_from)}</div>
                          <div>→ {fmtDate(code.expires_at)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          <button onClick={() => startEdit(code)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                          {code.status !== 'active' && (
                            <button onClick={() => changeStatus(code, 'active')} className="text-green-600 hover:text-green-800 font-medium">Activate</button>
                          )}
                          {code.status === 'active' && (
                            <button onClick={() => changeStatus(code, 'paused')} className="text-amber-600 hover:text-amber-800 font-medium">Pause</button>
                          )}
                          {code.status !== 'expired' && code.status !== 'archived' && (
                            <button onClick={() => changeStatus(code, 'expired')} className="text-red-600 hover:text-red-800 font-medium">Expire</button>
                          )}
                          {code.status !== 'archived' && (
                            <button onClick={() => changeStatus(code, 'archived')} className="text-neutral-600 hover:text-neutral-800 font-medium">Archive</button>
                          )}
                          <button onClick={() => toggleRedemptions(code)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                            {expandedCodeId === code.id ? 'Hide' : 'Redemptions'}
                          </button>
                        </td>
                      </tr>

                      {expandedCodeId === code.id && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 bg-gray-50">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">
                              Redemptions for “{code.code_key ?? code.id}”
                            </h3>
                            {redLoading ? (
                              <p className="text-sm text-gray-500">Loading...</p>
                            ) : redemptions.length === 0 ? (
                              <p className="text-sm text-gray-500">No redemptions recorded.</p>
                            ) : (
                              <table className="min-w-full text-sm text-gray-900">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <Th small>Redeemed at</Th>
                                    <Th small>Email</Th>
                                    <Th small>Person</Th>
                                    <Th small>Source</Th>
                                    <Th small>Context</Th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {redemptions.map((r) => {
                                    const person = r.person_id ? peopleMap[r.person_id] : null;
                                    return (
                                      <tr key={r.id} className="border-b border-gray-100">
                                        <td className="py-1.5 px-2 whitespace-nowrap text-gray-700">{fmtDate(r.redeemed_at)}</td>
                                        <td className="py-1.5 px-2 text-gray-700">{r.email ?? '—'}</td>
                                        <td className="py-1.5 px-2 text-gray-700">
                                          {person ? (
                                            <span>
                                              {person.email}
                                              {(person.first_name || person.last_name) && (
                                                <span className="text-gray-500"> ({[person.first_name, person.last_name].filter(Boolean).join(' ')})</span>
                                              )}
                                            </span>
                                          ) : r.person_id ? (
                                            <span className="font-mono text-xs text-gray-400">{r.person_id}</span>
                                          ) : '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-gray-700">{r.source ?? '—'}</td>
                                        <td className="py-1.5 px-2 text-xs text-gray-500 font-mono max-w-[280px] truncate">
                                          {r.context ? JSON.stringify(r.context) : '—'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Th({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <th
      className={`px-6 py-3 text-left ${small ? 'py-1 px-2 font-medium text-gray-600 text-xs' : 'text-xs font-medium text-gray-500 uppercase tracking-wider'}`}
    >
      {children}
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  Form state + datetime helpers                                      */
/* ------------------------------------------------------------------ */

interface FormState {
  code: string;
  code_key: string;
  label: string;
  status: AccessCodeStatus;
  scope: AccessCodeScope;
  start_page_slug: string;
  program_slug: string;
  product_slug: string;
  offer_key: string;
  max_redemptions: string;
  valid_from: string;
  expires_at: string;
}

function emptyForm(): FormState {
  return {
    code: '',
    code_key: '',
    label: '',
    status: 'draft',
    scope: 'global',
    start_page_slug: '',
    program_slug: '',
    product_slug: '',
    offer_key: '',
    max_redemptions: '',
    valid_from: '',
    expires_at: '',
  };
}

/** Convert an ISO timestamp (or empty) to a `datetime-local` input value. */
function toInputDatetime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  } catch {
    return '';
  }
}

/** Convert a `datetime-local` input value to an ISO string (or empty). */
function fromInputDatetime(value: string): string {
  if (!value) return '';
  try {
    const d = new Date(value + ':00Z');
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/*  SSR                                                                */
/* ------------------------------------------------------------------ */

export const getServerSideProps: GetServerSideProps<AdminAccessCodesProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null, initialCodes: [], offers: [] } };
  }

  const ADMIN_SELECT =
    'id, code_key, label, status, scope, start_page_slug, program_slug, product_slug, offer_key, max_redemptions, redemption_count, valid_from, expires_at, created_at, updated_at';

  const { data: codes } = await supabaseAdmin
    .from('access_codes')
    .select(ADMIN_SELECT)
    .order('created_at', { ascending: false });

  const { data: offers } = await supabaseAdmin
    .from('offers')
    .select('offer_key, name, is_active')
    .order('name', { ascending: true });

  return {
    props: {
      user,
      initialCodes: (codes ?? []) as AccessCode[],
      offers: (offers ?? []) as OfferOption[],
    },
  };
};
