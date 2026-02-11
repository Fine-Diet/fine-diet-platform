/**
 * Admin Page: Access Links
 *
 * Create and revoke person-to-person access links (staff/coach viewing client journals).
 * Two person search fields: granter (client) and grantee (staff/coach).
 * Protected by middleware and SSR guard (editor | admin).
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';
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

interface AccessLink {
  id: string;
  granter_person_id: string;
  grantee_person_id: string;
  scope: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  note: string | null;
  created_at: string;
  // Joined person info (when available)
  granter_email?: string;
  grantee_email?: string;
}

interface AdminAccessLinksProps {
  user: AuthenticatedUser | null;
}

/* ------------------------------------------------------------------ */
/*  Person Search Hook                                                 */
/* ------------------------------------------------------------------ */

interface PersonSearchState {
  label: string;
  query: string;
  setQuery: (q: string) => void;
  results: PersonResult[];
  searching: boolean;
  selected: PersonResult | null;
  select: (person: PersonResult) => void;
  clear: () => void;
}

function usePersonSearch(label: string): PersonSearchState {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonResult | null>(null);

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
      } catch { /* swallow */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const select = (person: PersonResult) => {
    setSelected(person);
    setQuery('');
    setResults([]);
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
  };

  return { label, query, setQuery, results, searching, selected, select, clear };
}

/* ------------------------------------------------------------------ */
/*  PersonSearchField — defined OUTSIDE page component for stable     */
/*  React identity (prevents remount / focus loss on every keystroke)  */
/* ------------------------------------------------------------------ */

function PersonSearchField({ search }: { search: PersonSearchState }) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{search.label}</label>
      {search.selected ? (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium text-gray-900">{search.selected.email}</span>
              {(search.selected.first_name || search.selected.last_name) && (
                <span className="text-gray-500 ml-2">
                  ({[search.selected.first_name, search.selected.last_name].filter(Boolean).join(' ')})
                </span>
              )}
            </div>
            <button onClick={search.clear} className="text-sm text-red-600 hover:text-red-800 font-medium ml-3">Clear</button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono select-all">{search.selected.id}</span>
            <CopyIdButton value={search.selected.id} />
          </div>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
          />
          {search.searching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
          {search.results.length > 0 && (
            <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
              {search.results.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => search.select(p)}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm transition-colors"
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
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminAccessLinks({ user }: AdminAccessLinksProps) {
  const granterSearch = usePersonSearch('Client (Granter)');
  const granteeSearch = usePersonSearch('Staff/Coach (Grantee)');

  /* --- Access links state --- */
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  /* --- Create form --- */
  const [scope, setScope] = useState('journal_read');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  /* --- Messages --- */
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  /* ---- Load links when either person changes ---- */
  const loadLinks = useCallback(async () => {
    const granterId = granterSearch.selected?.id;
    const granteeId = granteeSearch.selected?.id;
    if (!granterId && !granteeId) {
      setLinks([]);
      return;
    }
    setLinksLoading(true);
    try {
      // We need to fetch access links. Use a GET on our create endpoint.
      // Let's add GET support to access-links/create.ts as well.
      const params = new URLSearchParams();
      if (granterId) params.set('granter_person_id', granterId);
      if (granteeId) params.set('grantee_person_id', granteeId);

      const res = await fetch(`/api/admin/access-links/create?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLinks(data.access_links || []);
      } else {
        setLinks([]);
      }
    } catch {
      setLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }, [granterSearch.selected?.id, granteeSearch.selected?.id]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  /* ---- Create access link ---- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!granterSearch.selected || !granteeSearch.selected) return;
    setCreating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        granter_person_id: granterSearch.selected.id,
        grantee_person_id: granteeSearch.selected.id,
        scope,
      };
      if (startsAt) body.starts_at = new Date(startsAt).toISOString();
      if (endsAt) body.ends_at = new Date(endsAt).toISOString();
      if (note.trim()) body.note = note.trim();

      const res = await fetch('/api/admin/access-links/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create access link');
      }

      setSuccess('Access link created successfully.');
      setScope('journal_read');
      setStartsAt('');
      setEndsAt('');
      setNote('');
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create access link');
    } finally {
      setCreating(false);
    }
  };

  /* ---- Revoke access link ---- */
  const handleRevoke = async (linkId: string) => {
    try {
      const res = await fetch('/api/admin/access-links/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_link_id: linkId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke');
      }
      setSuccess('Access link revoked.');
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access link');
    }
  };

  /* ---- Access gate ---- */
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head><title>Access Links - Fine Diet</title></Head>
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
      <Head><title>Access Links - Fine Diet</title></Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Access Links</h1>
                <p className="text-lg text-gray-600">Manage staff/coach view-as-client access links.</p>
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

          {/* Person Search Fields */}
          <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Select People</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PersonSearchField search={granterSearch} />
              <PersonSearchField search={granteeSearch} />
            </div>
          </div>

          {/* Existing links table */}
          {(granterSearch.selected || granteeSearch.selected) && (
            <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Existing Access Links
                  {granterSearch.selected && <span className="text-gray-500 text-sm font-normal ml-2">for client: {granterSearch.selected.email}</span>}
                  {granteeSearch.selected && <span className="text-gray-500 text-sm font-normal ml-2">for staff: {granteeSearch.selected.email}</span>}
                </h2>
              </div>
              {linksLoading ? (
                <div className="p-6 text-center text-gray-500">Loading links...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Granter (Client)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grantee (Staff)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Starts</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ends</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {links.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                            No access links found.
                          </td>
                        </tr>
                      ) : (
                        links.map((link) => (
                          <tr key={link.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className="text-gray-900 font-mono">{link.granter_person_id.slice(0, 8)}...</span>
                              <CopyIdButton value={link.granter_person_id} className="ml-1.5" />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className="text-gray-900 font-mono">{link.grantee_person_id.slice(0, 8)}...</span>
                              <CopyIdButton value={link.grantee_person_id} className="ml-1.5" />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                                {link.scope}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${link.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {link.is_active ? 'Active' : 'Revoked'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(link.starts_at)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{link.ends_at ? formatDate(link.ends_at) : 'Perpetual'}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-[150px] truncate">{link.note || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {link.is_active && (
                                <button onClick={() => handleRevoke(link.id)} className="text-red-600 hover:text-red-800 font-medium">Revoke</button>
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
          )}

          {/* Create form */}
          {granterSearch.selected && granteeSearch.selected && (
            <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Access Link</h2>
              <p className="text-sm text-gray-500 mb-4">
                Linking <strong>{granterSearch.selected.email}</strong> (client) → <strong>{granteeSearch.selected.email}</strong> (staff/coach)
              </p>
              <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="journal_read">journal_read</option>
                    <option value="journal_write">journal_write</option>
                    <option value="client_admin">client_admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ends At</label>
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" disabled={creating} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {creating ? 'Creating...' : 'Create Access Link'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Help text */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>How it works:</strong> The <em>granter</em> is the client whose data will be viewed. The <em>grantee</em> is the staff member or coach who gains read access.
              Scope <code className="bg-blue-100 px-1 rounded">journal_read</code> allows viewing journal entries.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminAccessLinksProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }

  return { props: { user } };
};
