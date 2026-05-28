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

interface ProgramAccessOption {
  id: string;
  slug: string;
  title: string;
  status: string;
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

  /* --- Program access helper --- */
  const [programGranting, setProgramGranting] = useState(false);
  const [programOptions, setProgramOptions] = useState<ProgramAccessOption[]>([]);
  const [programOptionsLoading, setProgramOptionsLoading] = useState(false);
  const [selectedProgramSlug, setSelectedProgramSlug] = useState('');
  const [programEndsAt, setProgramEndsAt] = useState('');
  const [programSourceRef, setProgramSourceRef] = useState('');
  const [programNote, setProgramNote] = useState('');
  const [programCreateEnrollment, setProgramCreateEnrollment] = useState(false);
  const [programStartDate, setProgramStartDate] = useState('');
  const [programTimezone, setProgramTimezone] = useState('UTC');
  const [programCapacity, setProgramCapacity] =
    useState<'low' | 'steady' | 'high'>('steady');

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

  useEffect(() => {
    if (user?.role !== 'admin') return;
    setProgramOptionsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/admin/programs?status=published&limit=200');
        if (!res.ok) return;
        const data = await res.json();
        const rows = (data.rows || []) as ProgramAccessOption[];
        setProgramOptions(rows);
        setSelectedProgramSlug((current) => {
          if (current && rows.some((program) => program.slug === current)) {
            return current;
          }
          return rows.find((program) => program.slug === 'baseline')?.slug ?? rows[0]?.slug ?? '';
        });
      } catch {
        setProgramOptions([]);
      } finally {
        setProgramOptionsLoading(false);
      }
    })();
  }, [user?.role]);

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

  const selectedProgram = programOptions.find(
    (program) => program.slug === selectedProgramSlug,
  );

  /* ---- Program access grant helper ---- */
  const handleProgramGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson || !selectedProgramSlug) return;
    setProgramGranting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        person_id: selectedPerson.id,
        program_slug: selectedProgramSlug,
      };
      if (programEndsAt) body.ends_at = new Date(programEndsAt).toISOString();
      if (programSourceRef.trim()) body.source_ref = programSourceRef.trim();
      if (programNote.trim()) body.note = programNote.trim();
      if (programCreateEnrollment) {
        body.create_enrollment_now = true;
        body.selected_start_date = programStartDate;
        body.timezone = programTimezone.trim() || 'UTC';
        body.current_capacity = programCapacity;
      }

      const res = await fetch('/api/admin/programs/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to grant program access');
      }

      const action =
        data.entitlement_action === 'created' ? 'granted' : 'already active';
      const enrollmentText = data.enrollment_summary
        ? ' Enrollment was created.'
        : '';
      const grantedSlug = data.program?.slug ?? selectedProgramSlug;
      setSuccess(`Program access for ${grantedSlug} ${action}.${enrollmentText}`);
      setProgramEndsAt('');
      setProgramSourceRef('');
      setProgramNote('');
      setProgramCreateEnrollment(false);
      setProgramStartDate('');
      setProgramTimezone('UTC');
      setProgramCapacity('steady');
      await loadEntitlements(selectedPerson.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to grant program access',
      );
    } finally {
      setProgramGranting(false);
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
              {/* Program access helper */}
              {user?.role === 'admin' && (
                <div className="mb-8 bg-white rounded-lg shadow-sm border border-blue-200 p-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Program Access
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Grant <code>program:&lt;slug&gt;</code> access for a
                        published program. By default this only grants access;
                        the user still chooses a start date from{' '}
                        <code>/app/programs</code>.
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                      Admin only
                    </span>
                  </div>

                  <form
                    onSubmit={handleProgramGrant}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Program *
                      </label>
                      <select
                        value={selectedProgramSlug}
                        onChange={(e) => setSelectedProgramSlug(e.target.value)}
                        disabled={programOptionsLoading || programOptions.length === 0}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                        required
                      >
                        {programOptionsLoading && (
                          <option value="">Loading published programs...</option>
                        )}
                        {!programOptionsLoading && programOptions.length === 0 && (
                          <option value="">No published programs found</option>
                        )}
                        {!programOptionsLoading &&
                          programOptions.map((program) => (
                            <option key={program.id} value={program.slug}>
                              {program.title} ({program.slug})
                            </option>
                          ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Entitlement key:{' '}
                        <code>
                          {selectedProgramSlug
                            ? `program:${selectedProgramSlug}`
                            : 'program:<slug>'}
                        </code>
                        {selectedProgram ? ` for ${selectedProgram.title}` : ''}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Optional Ends At
                      </label>
                      <input
                        type="datetime-local"
                        value={programEndsAt}
                        onChange={(e) => setProgramEndsAt(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Source Ref
                      </label>
                      <input
                        type="text"
                        value={programSourceRef}
                        onChange={(e) => setProgramSourceRef(e.target.value)}
                        placeholder="Optional support ticket or reason key"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Note
                      </label>
                      <input
                        type="text"
                        value={programNote}
                        onChange={(e) => setProgramNote(e.target.value)}
                        placeholder="Optional admin note"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <label className="md:col-span-2 flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                      <input
                        type="checkbox"
                        checked={programCreateEnrollment}
                        onChange={(e) =>
                          setProgramCreateEnrollment(e.target.checked)
                        }
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">
                          Create enrollment now
                        </span>
                        <span className="block text-xs text-gray-600 mt-0.5">
                          Leave unchecked for access-only. Check this only when
                          the admin explicitly wants to choose a start date for
                          the person.
                        </span>
                      </span>
                    </label>

                    {programCreateEnrollment && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Selected Start Date *
                          </label>
                          <input
                            type="date"
                            value={programStartDate}
                            onChange={(e) =>
                              setProgramStartDate(e.target.value)
                            }
                            required={programCreateEnrollment}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Timezone
                          </label>
                          <input
                            type="text"
                            value={programTimezone}
                            onChange={(e) =>
                              setProgramTimezone(e.target.value)
                            }
                            placeholder="UTC"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Capacity
                          </label>
                          <select
                            value={programCapacity}
                            onChange={(e) =>
                              setProgramCapacity(
                                e.target.value as 'low' | 'steady' | 'high',
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="low">Low</option>
                            <option value="steady">Steady</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </>
                    )}

                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={
                          programGranting ||
                          !selectedProgramSlug ||
                          (programCreateEnrollment && !programStartDate)
                        }
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {programGranting
                          ? 'Granting Program Access...'
                          : programCreateEnrollment
                            ? 'Grant Program and Create Enrollment'
                            : 'Grant Program Access'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

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
              <strong>Tip:</strong> The entitlement key dropdown shows registered keys. Use the admin-only Program Access panel above for <code className="bg-blue-100 px-1 rounded">program:&lt;slug&gt;</code> grants, or use <code className="bg-blue-100 px-1 rounded">Offers & Bundles</code> to grant multiple entitlements at once.
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
