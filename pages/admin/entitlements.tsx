/**
 * Admin Page: Entitlements
 *
 * Search for a person, view their entitlements, grant new ones, revoke existing.
 * Protected by middleware and SSR guard (editor | admin).
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
import {
  ENTITLEMENT_KEY_OPTIONS,
  KNOWN_ENTITLEMENT_KEYS,
  ENTITLEMENT_SOURCE_OPTIONS,
  DEFAULT_ENTITLEMENT_SOURCE,
} from '@/lib/access/constants';
import CopyIdButton from '@/components/admin/CopyIdButton';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PersonResult {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

interface Entitlement {
  id: string;
  person_id: string;
  entitlement_key: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  source: string | null;
  source_ref: string | null;
  note: string | null;
  created_at: string;
}

interface AdminEntitlementsProps {
  user: AuthenticatedUser | null;
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminEntitlements({ user }: AdminEntitlementsProps) {
  /* --- Person search --- */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);

  /* --- Entitlements for selected person --- */
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [entLoading, setEntLoading] = useState(false);

  /* --- Grant form --- */
  const [grantKey, setGrantKey] = useState('');
  const [grantKeyOpen, setGrantKeyOpen] = useState(false);
  const grantKeyRef = useRef<HTMLDivElement>(null);
  const [grantStartsAt, setGrantStartsAt] = useState('');
  const [grantEndsAt, setGrantEndsAt] = useState('');
  const [grantSource, setGrantSource] = useState(DEFAULT_ENTITLEMENT_SOURCE);
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);

  // Close entitlement key dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (grantKeyRef.current && !grantKeyRef.current.contains(e.target as Node)) {
        setGrantKeyOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Filtered entitlement key suggestions based on current input
  const filteredKeyOptions = ENTITLEMENT_KEY_OPTIONS.filter(
    (opt) => !grantKey || opt.key.includes(grantKey.toLowerCase()) || opt.label.toLowerCase().includes(grantKey.toLowerCase())
  );
  const isUnknownKey = grantKey.trim() !== '' && !KNOWN_ENTITLEMENT_KEYS.includes(grantKey.trim().toLowerCase());

  /* --- Messages --- */
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss success
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  /* ---- Person search with debounce ---- */
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/people-search?q=${encodeURIComponent(searchQuery)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.people || []);
        }
      } catch { /* swallow */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  /* ---- Load entitlements for selected person ---- */
  const loadEntitlements = useCallback(async (personId: string) => {
    setEntLoading(true);
    try {
      // Use a lightweight GET via people-search won't work, so we fetch via a POST to grant with a dry-run?
      // Actually, we'll need a way to fetch. Let's call grant endpoint with GET, but it's POST only.
      // Simplest: we'll fetch directly on the client via the admin API.
      // Since there's no dedicated GET endpoint, let's just do a people entitlements fetch
      // using the admin grants API in a round-about way... actually let's just add the fetch inline.
      // For now, call the grant API won't work. We'll create an inline fetch here that uses the search pattern.
      // The cleanest approach: fetch from the people-search-like endpoint.
      // Since we have access to admin role, we can create a lightweight call.
      // Let's use a query-string on the grant endpoint to list — but that only does POST.
      // The best pragmatic approach: call the supabase API through an existing admin endpoint.
      // Actually, the simplest solution is a GET to our existing admin APIs.
      // Let's just list entitlements via a new admin endpoint... or we can piggyback on grant.
      // 
      // For the MVP: We'll use a fetch to a URL that doesn't exist yet. Let's create a simple
      // entitlements list API endpoint instead. But the plan only has grant + revoke.
      //
      // Let's use a simple approach: add a GET handler to the grant endpoint file,
      // or create a mini endpoint. Actually, the cleanest solution for the admin page is to
      // just pass entitlements via SSR or create a list call. Since we don't want to add more files
      // than specified, let's add GET support to the grant.ts endpoint.
      //
      // Actually the cleanest: use the same people-search pattern and fetch entitlements directly.
      // We can make a simple fetch call. But we need an API for that.
      // 
      // Pragmatic decision: Add GET handler to pages/api/admin/entitlements/grant.ts
      // to return entitlements for a person_id. This is a minor extension of the existing file.
      const res = await fetch(`/api/admin/entitlements/grant?person_id=${encodeURIComponent(personId)}`);
      if (res.ok) {
        const data = await res.json();
        setEntitlements(data.entitlements || []);
      } else {
        setEntitlements([]);
      }
    } catch {
      setEntitlements([]);
    } finally {
      setEntLoading(false);
    }
  }, []);

  /* ---- Select a person ---- */
  const handleSelectPerson = (person: PersonResult) => {
    setSelectedPerson(person);
    setSearchQuery('');
    setSearchResults([]);
    loadEntitlements(person.id);
  };

  /* ---- Grant entitlement ---- */
  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson || !grantKey.trim()) return;
    setGranting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        person_id: selectedPerson.id,
        entitlement_key: grantKey.trim().toLowerCase(),
      };
      if (grantStartsAt) body.starts_at = new Date(grantStartsAt).toISOString();
      if (grantEndsAt) body.ends_at = new Date(grantEndsAt).toISOString();
      if (grantSource.trim()) body.source = grantSource.trim();
      if (grantNote.trim()) body.note = grantNote.trim();

      const res = await fetch('/api/admin/entitlements/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to grant entitlement');
      }

      setSuccess(`Entitlement "${grantKey}" granted successfully.`);
      setGrantKey('');
      setGrantKeyOpen(false);
      setGrantStartsAt('');
      setGrantEndsAt('');
      setGrantSource(DEFAULT_ENTITLEMENT_SOURCE);
      setGrantNote('');
      // Refresh list
      await loadEntitlements(selectedPerson.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant entitlement');
    } finally {
      setGranting(false);
    }
  };

  /* ---- Revoke entitlement ---- */
  const handleRevoke = async (entitlementId: string) => {
    if (!selectedPerson) return;
    try {
      const res = await fetch('/api/admin/entitlements/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entitlement_id: entitlementId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke');
      }
      setSuccess('Entitlement revoked.');
      await loadEntitlements(selectedPerson.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke entitlement');
    }
  };

  /* ---- Access gate ---- */
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head><title>Entitlements - Fine Diet</title></Head>
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

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Head><title>Entitlements - Fine Diet</title></Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Entitlements</h1>
                <p className="text-lg text-gray-600">Grant or revoke entitlements for individual users.</p>
              </div>
              <Link href="/admin" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                ← Back to Dashboard
              </Link>
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

          {/* Person Search */}
          <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Find a Person</h2>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email or name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
              />
              {searching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
              {searchResults.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => handleSelectPerson(p)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm transition-colors"
                      >
                        <span className="font-medium text-gray-900">{p.email}</span>
                        {(p.first_name || p.last_name) && (
                          <span className="text-gray-500 ml-2">({[p.first_name, p.last_name].filter(Boolean).join(' ')})</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Selected person banner */}
            {selectedPerson && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{selectedPerson.email}</span>
                    {(selectedPerson.first_name || selectedPerson.last_name) && (
                      <span className="text-gray-500 ml-2">
                        ({[selectedPerson.first_name, selectedPerson.last_name].filter(Boolean).join(' ')})
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setSelectedPerson(null); setEntitlements([]); }} className="text-sm text-red-600 hover:text-red-800 font-medium">
                    Clear
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-mono select-all">{selectedPerson.id}</span>
                  <CopyIdButton value={selectedPerson.id} />
                  <CopyIdButton value={`/api/journal/history?person_id=${selectedPerson.id}`} label="Copy API Link" />
                </div>
              </div>
            )}
          </div>

          {/* Entitlements for selected person */}
          {selectedPerson && (
            <>
              {/* Entitlements table */}
              <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Entitlements for {selectedPerson.email}</h2>
                </div>
                {entLoading ? (
                  <div className="p-6 text-center text-gray-500">Loading entitlements...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Starts</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ends</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {entitlements.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              No entitlements found for this person.
                            </td>
                          </tr>
                        ) : (
                          entitlements.map((ent) => (
                            <tr key={ent.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{ent.entitlement_key}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${ent.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                  {ent.is_active ? 'Active' : 'Revoked'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(ent.starts_at)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ent.ends_at ? formatDate(ent.ends_at) : 'Perpetual'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ent.source || '—'}</td>
                              <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">{ent.note || '—'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {ent.is_active && (
                                  <button onClick={() => handleRevoke(ent.id)} className="text-red-600 hover:text-red-800 font-medium">
                                    Revoke
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Grant form */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Grant New Entitlement</h2>
                <form onSubmit={handleGrant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div ref={grantKeyRef} className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entitlement Key *</label>
                    <input
                      type="text"
                      value={grantKey}
                      onChange={(e) => { setGrantKey(e.target.value); setGrantKeyOpen(true); }}
                      onFocus={() => setGrantKeyOpen(true)}
                      placeholder="Type or select a key..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      required
                      autoComplete="off"
                    />
                    {grantKeyOpen && filteredKeyOptions.length > 0 && (
                      <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {filteredKeyOptions.map((opt) => (
                          <li key={opt.key}>
                            <button
                              type="button"
                              onClick={() => { setGrantKey(opt.key); setGrantKeyOpen(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm transition-colors"
                            >
                              <span className="font-mono text-gray-900">{opt.key}</span>
                              <span className="text-gray-500 ml-2">— {opt.label.split('—').pop()?.trim() || opt.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isUnknownKey && !grantKeyOpen && (
                      <p className="text-xs text-amber-600 mt-1">Key not in registry — it will still be granted.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <select
                      value={grantSource}
                      onChange={(e) => setGrantSource(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                    >
                      {ENTITLEMENT_SOURCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
                    <input type="datetime-local" value={grantStartsAt} onChange={(e) => setGrantStartsAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
                    <input type="datetime-local" value={grantEndsAt} onChange={(e) => setGrantEndsAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="Optional note" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    <button type="submit" disabled={granting || !grantKey.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {granting ? 'Granting...' : 'Grant Entitlement'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* Help text */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> The entitlement key dropdown shows registered keys. You can also type a custom key — an amber warning will appear if it&apos;s not in the registry. Use <code className="bg-blue-100 px-1 rounded">Offers & Bundles</code> to grant multiple entitlements at once.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminEntitlementsProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }

  return { props: { user } };
};
