/**
 * Admin Page: Per-Person Inheritance Inspection (Plans Phase 8)
 *
 * Answers the Packet 8 acceptance criterion:
 *   - What programs does this person currently have?
 *   - Which one(s) are active now?
 *   - Which guidance is influencing their Plans generation?
 *   - What priority/order determined the final active guidance set?
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  GuidanceResolutionResult,
  ProgramAssignment,
} from '@/lib/plans/types';

interface Props {
  user: AuthenticatedUser;
  prefillPersonId: string | null;
}

interface PersonSearchResult {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface ForPersonResponse {
  person_id: string;
  all_assignments: ProgramAssignment[];
  resolution: GuidanceResolutionResult;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

export default function ProgramAssignmentsInspectPage({
  user,
  prefillPersonId,
}: Props) {
  const [personId, setPersonId] = useState<string>(prefillPersonId ?? '');
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<PersonSearchResult[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [data, setData] = useState<ForPersonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = personQuery.trim();
    if (q.length < 2) {
      setPersonResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const resp = await fetch(
          `/api/admin/people-search?q=${encodeURIComponent(q)}&limit=8`,
          { signal: ctrl.signal },
        );
        if (resp.ok) {
          const body = (await resp.json()) as {
            people: PersonSearchResult[];
          };
          setPersonResults(body.people ?? []);
        }
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [personQuery]);

  const fetchResolution = useCallback(async (pid: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/program-assignments/for-person?person_id=${encodeURIComponent(pid)}`,
      );
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error ?? 'Failed to resolve.');
      }
      const body = (await resp.json()) as ForPersonResponse;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (personId) void fetchResolution(personId);
  }, [personId, fetchResolution]);

  return (
    <>
      <Head>
        <title>Inspect Program Inheritance · Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link
            href="/admin/program-assignments"
            className="text-sm text-gray-600 hover:text-gray-900 inline-block mb-3"
          >
            ← Back to assignments
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            Inspect inheritance
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Resolve which programs &amp; guidance rows are currently
            influencing Plans generation for a single person, and see the
            deterministic merge ordering.
          </p>

          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Person
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by email or name, or paste a person UUID…"
                value={personQuery || selectedEmail || personId}
                onChange={(e) => {
                  setPersonQuery(e.target.value);
                  setPersonId('');
                  setSelectedEmail('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
              {personResults.length > 0 && !personId && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-auto">
                  {personResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPersonId(p.id);
                        setSelectedEmail(p.email);
                        setPersonQuery('');
                        setPersonResults([]);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                    >
                      <div className="font-medium text-gray-900">
                        {p.email}
                      </div>
                      {(p.first_name || p.last_name) && (
                        <div className="text-xs text-gray-500">
                          {[p.first_name, p.last_name]
                            .filter(Boolean)
                            .join(' ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const raw = personQuery.trim();
                  if (
                    /^[0-9a-f-]{36}$/i.test(raw) ||
                    raw.length === 36
                  ) {
                    setPersonId(raw);
                    setSelectedEmail('');
                    setPersonQuery('');
                  }
                }}
                className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm hover:bg-gray-200"
              >
                Use as UUID
              </button>
              {personId && (
                <span className="text-xs text-gray-500 self-center">
                  person id: <code>{personId}</code>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Signed in as {user.email}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
              {error}
            </div>
          )}
          {loading && (
            <p className="text-sm text-gray-500">Resolving inheritance…</p>
          )}

          {data && (
            <div className="space-y-6">
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    All assignments ({data.all_assignments.length})
                  </h2>
                  <Link
                    href={`/admin/program-assignments/new?person_id=${data.person_id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + New assignment for this person
                  </Link>
                </div>
                {data.all_assignments.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No assignments on file.
                  </p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-1.5">Program</th>
                        <th className="py-1.5">Source</th>
                        <th className="py-1.5">Status</th>
                        <th className="py-1.5">Priority</th>
                        <th className="py-1.5">Active dates</th>
                        <th className="py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.all_assignments.map((a) => (
                        <tr key={a.id} className="border-t border-gray-100">
                          <td className="py-1.5 font-medium text-gray-900">
                            {a.program_slug}
                            {a.auto_created && (
                              <span
                                className="ml-2 px-1.5 py-0.5 text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-800 rounded"
                                title={a.source_ref ?? undefined}
                              >
                                auto
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-gray-700">
                            {a.acquisition_source.replace(/_/g, ' ')}
                          </td>
                          <td className="py-1.5">
                            <span
                              className={`px-2 py-0.5 text-xs rounded border ${
                                a.status === 'active'
                                  ? 'bg-green-50 border-green-200 text-green-800'
                                  : 'bg-gray-50 border-gray-200 text-gray-600'
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                          <td className="py-1.5 text-gray-700">{a.priority}</td>
                          <td className="py-1.5 text-xs text-gray-700">
                            {fmtDate(a.active_from)} → {fmtDate(a.active_to)}
                          </td>
                          <td className="py-1.5 text-right">
                            <Link
                              href={`/admin/program-assignments/${a.id}`}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Currently active inheritance (
                  {data.resolution.active_assignments.length} assignment
                  {data.resolution.active_assignments.length === 1 ? '' : 's'})
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Resolved at{' '}
                  {new Date(data.resolution.resolved_at).toLocaleString()}
                </p>
                {data.resolution.active_assignments.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No active in-window assignments right now. Direct
                    person-scoped guidance rows (if any) still pass
                    through for backward compatibility.
                  </p>
                ) : (
                  <ul className="list-disc list-inside text-sm text-gray-800">
                    {data.resolution.active_assignments.map((a) => (
                      <li key={a.id}>
                        <span className="font-medium">{a.program_slug}</span>{' '}
                        <span className="text-xs text-gray-500">
                          (priority {a.priority},{' '}
                          {a.acquisition_source.replace(/_/g, ' ')})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Resolved guidance set (
                  {data.resolution.resolved.length} row
                  {data.resolution.resolved.length === 1 ? '' : 's'})
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Order applied to Plans generation. Inherited-from-assignment
                  rows win ties over direct person-scope rows; then priority
                  DESC; then updated_at DESC.
                </p>
                {data.resolution.resolved.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No guidance currently influencing Plans for this person.
                  </p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500">
                      <tr>
                        <th className="py-1.5">#</th>
                        <th className="py-1.5">Program</th>
                        <th className="py-1.5">Reason</th>
                        <th className="py-1.5">Eff. priority</th>
                        <th className="py-1.5">Updated</th>
                        <th className="py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.resolution.resolved.map((r, i) => (
                        <tr
                          key={r.guidance.id}
                          className="border-t border-gray-100"
                        >
                          <td className="py-1.5 text-gray-500">{i + 1}</td>
                          <td className="py-1.5 font-medium text-gray-900">
                            {r.guidance.program_slug}
                            {r.guidance.guidance_type && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({r.guidance.guidance_type.replace(/_/g, ' ')})
                              </span>
                            )}
                          </td>
                          <td className="py-1.5">
                            <span
                              className={`px-2 py-0.5 text-xs rounded border ${
                                r.resolution_reason ===
                                'inherited_from_assignment'
                                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                                  : 'bg-gray-50 border-gray-200 text-gray-700'
                              }`}
                            >
                              {r.resolution_reason === 'inherited_from_assignment'
                                ? 'inherited'
                                : 'direct'}
                            </span>
                            {r.inherited_from_assignment_id && (
                              <span className="ml-2 text-xs text-gray-500 font-mono">
                                via {r.inherited_from_assignment_id.slice(0, 8)}
                                …
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-gray-700">
                            {r.effective_priority}
                          </td>
                          <td className="py-1.5 text-xs text-gray-600">
                            {fmtDate(r.guidance.updated_at)}
                          </td>
                          <td className="py-1.5 text-right">
                            <Link
                              href={`/admin/program-guidance/${r.guidance.id}`}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/program-assignments/inspect',
        permanent: false,
      },
    };
  }
  const prefillPersonId =
    typeof context.query.person_id === 'string' && context.query.person_id
      ? context.query.person_id
      : null;
  return { props: { user, prefillPersonId } };
};
