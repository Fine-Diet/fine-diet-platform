/**
 * Admin Page: Program Assignment Automation (Plans Phase 9)
 *
 * Two panels:
 *   1. Offer → Program mapping. Staff set/clear `offers.assigns_program_slug`
 *      which controls whether Stripe/admin grants for that offer trigger
 *      automatic program_assignments creation.
 *   2. Backfill tool. Dry-run + live backfill over active
 *      person_entitlements → program_assignments. Idempotent; safe to
 *      re-run for historical purchases.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { BackfillReport } from '@/lib/plans/programAssignmentAutomationServerService';

interface Props {
  user: AuthenticatedUser;
}

interface MappingRow {
  offer_key: string;
  name: string;
  is_active: boolean;
  assigns_program_slug: string | null;
}

export default function ProgramAssignmentAutomationPage({ user }: Props) {
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [savingOffer, setSavingOffer] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [report, setReport] = useState<BackfillReport | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);

  const loadMappings = useCallback(async () => {
    setLoadingMappings(true);
    setMappingError(null);
    try {
      const resp = await fetch('/api/admin/offers/program-slug-mapping');
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Failed to load mappings.');
      }
      const data = (await resp.json()) as { rows: MappingRow[] };
      setMappings(data.rows);
      const nextDrafts: Record<string, string> = {};
      data.rows.forEach((r) => {
        nextDrafts[r.offer_key] = r.assigns_program_slug ?? '';
      });
      setDrafts(nextDrafts);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setLoadingMappings(false);
    }
  }, []);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  const saveMapping = async (offerKey: string) => {
    setSavingOffer(offerKey);
    try {
      const raw = drafts[offerKey] ?? '';
      const body = {
        offer_key: offerKey,
        assigns_program_slug: raw.trim() === '' ? null : raw.trim(),
      };
      const resp = await fetch('/api/admin/offers/program-slug-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Save failed.');
      }
      await loadMappings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingOffer(null);
    }
  };

  const runBackfill = async () => {
    setBackfillRunning(true);
    setBackfillError(null);
    setReport(null);
    try {
      const resp = await fetch('/api/admin/program-assignments/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun, limit: 1000 }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error ?? 'Backfill failed.');
      }
      const data = (await resp.json()) as BackfillReport;
      setReport(data);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Backfill failed.');
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <>
      <Head>
        <title>Program Assignment Automation · Fine Diet Admin</title>
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
            Automation
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Control the Offer → Program assignment handoff and backfill
            historical purchases. Signed in as {user.email}.
          </p>

          <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Offer → Program mapping
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              When an offer has a program slug set, purchases (via Stripe
              webhook) and admin grants of that offer automatically create a
              matching <code>program_assignments</code> row. Clear the slug
              to disable automation for that offer.
            </p>

            {mappingError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {mappingError}
              </div>
            )}

            <div className="border border-gray-200 rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Offer</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Program slug</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {loadingMappings && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loadingMappings &&
                    mappings.map((m) => {
                      const draft = drafts[m.offer_key] ?? '';
                      const dirty =
                        (draft.trim() || null) !== (m.assigns_program_slug ?? null);
                      return (
                        <tr
                          key={m.offer_key}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">
                              {m.name}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              {m.offer_key}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {m.is_active ? (
                              <span className="text-xs text-green-800 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                                active
                              </span>
                            ) : (
                              <span className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                                inactive
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={draft}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [m.offer_key]: e.target.value,
                                }))
                              }
                              placeholder="(unset) — e.g. gut-check-reset"
                              className="w-full max-w-xs px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              disabled={!dirty || savingOffer === m.offer_key}
                              onClick={() => saveMapping(m.offer_key)}
                              className="px-3 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
                            >
                              {savingOffer === m.offer_key
                                ? 'Saving…'
                                : dirty
                                  ? 'Save'
                                  : 'Saved'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {!loadingMappings && mappings.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center text-gray-500"
                      >
                        No offers exist yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Backfill
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Sweep active <code>person_entitlements</code> rows and ensure a
              matching <code>program_assignments</code> row exists for every
              mappable one. Mapping sources: entitlement keys shaped{' '}
              <code>program:&lt;slug&gt;</code>, or offer-granted entitlements
              whose offer has <code>assigns_program_slug</code> set.
              Idempotent — safe to re-run.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                Dry run (plan only, no writes)
              </label>
              <button
                type="button"
                onClick={runBackfill}
                disabled={backfillRunning}
                className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {backfillRunning ? 'Running…' : 'Run backfill'}
              </button>
            </div>

            {backfillError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {backfillError}
              </div>
            )}

            {report && (
              <div className="border border-gray-200 rounded p-3">
                <div className="flex flex-wrap gap-4 text-sm text-gray-700 mb-3">
                  <span>
                    Scanned: <strong>{report.scanned}</strong>
                  </span>
                  <span>
                    Mappable: <strong>{report.mapped}</strong>
                  </span>
                  <span>
                    Dry run: <strong>{report.dry_run ? 'yes' : 'no'}</strong>
                  </span>
                  {report.truncated && (
                    <span className="text-amber-700">
                      Result truncated; re-run with higher limit if needed.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
                  {Object.entries(report.counts).map(([k, v]) => (
                    <div key={k} className="bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-500">{k}:</span>{' '}
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    Show per-row detail ({report.items.length})
                  </summary>
                  <div className="mt-2 max-h-96 overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-left uppercase text-gray-600">
                        <tr>
                          <th className="px-2 py-1">Person</th>
                          <th className="px-2 py-1">Entitlement</th>
                          <th className="px-2 py-1">Slug</th>
                          <th className="px-2 py-1">Action</th>
                          <th className="px-2 py-1">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.items.map((it, idx) => (
                          <tr
                            key={`${it.person_id}-${it.entitlement_key}-${idx}`}
                            className="border-t border-gray-100"
                          >
                            <td className="px-2 py-1 font-mono">
                              {it.person_id.slice(0, 8)}…
                            </td>
                            <td className="px-2 py-1 font-mono">
                              {it.entitlement_key}
                            </td>
                            <td className="px-2 py-1 font-mono">
                              {it.program_slug ?? '—'}
                            </td>
                            <td className="px-2 py-1">{it.action}</td>
                            <td className="px-2 py-1 text-gray-600">
                              {it.reason ?? ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </section>
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
        destination: '/login?redirect=/admin/program-assignments/automation',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
