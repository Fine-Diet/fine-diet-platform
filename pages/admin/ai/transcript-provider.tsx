/**
 * Admin Page: External Transcript Provider (Plans Phase 31)
 *
 * Read-only observability surface for the Packet 27 external
 * transcript provider path. Intentionally compact and additive:
 *
 *   - Config banner answers "is the rollout actually on?"
 *     (policy present, preferred/fallback model rows enabled,
 *     SUPADATA_API_KEY detected in env).
 *   - Aggregates strip answers "is it doing anything, and how often
 *     is it succeeding vs declining vs failing?"
 *   - Recent-runs table answers "show me the last N attempts so I can
 *     eyeball what's happening on real blocked Shorts".
 *
 * All data is pulled from `ai_runs` via
 * `/api/admin/ai/transcript-provider/summary` — no new tables. Any
 * classification logic (success / decline / fail) lives on the
 * server so the UI can stay dumb and swap views cheaply.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';

interface Props {
  user: AuthenticatedUser;
}

type Outcome = 'success' | 'decline' | 'fail' | 'unknown';

interface ModelLite {
  id: string;
  provider_key: string;
  model_key: string;
  enabled: boolean;
}

interface SummaryResponse {
  config: {
    env_key_present: boolean;
    policy: { present: boolean; deterministic_fallback_available: boolean };
    preferred: ModelLite | null;
    fallback: ModelLite | null;
    rollout_state: 'enabled' | 'disabled' | 'misconfigured';
    rollout_hint: string | null;
  };
  aggregates: {
    window_days: number;
    attempts: number;
    success: number;
    decline: number;
    fail: number;
    avg_latency_ms: number | null;
  };
  recent_runs: Array<{
    id: string;
    created_at: string;
    status: string;
    fallback_used: boolean;
    latency_ms: number | null;
    outcome: Outcome;
    provider: string | null;
    model: string | null;
    video_id: string | null;
    video_url: string | null;
    transcript_chars: number | null;
    language: string | null;
    provider_unavailable: boolean | null;
    provider_error: string | null;
    error_text: string | null;
  }>;
}

function rolloutPill(state: SummaryResponse['config']['rollout_state']) {
  const styles =
    state === 'enabled'
      ? 'bg-emerald-100 text-emerald-800'
      : state === 'disabled'
        ? 'bg-gray-200 text-gray-700'
        : 'bg-amber-100 text-amber-800';
  const label =
    state === 'enabled' ? 'Rollout: enabled' : state === 'disabled' ? 'Rollout: disabled' : 'Rollout: check config';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${styles}`}>
      {label}
    </span>
  );
}

function outcomePill(outcome: Outcome) {
  const styles =
    outcome === 'success'
      ? 'bg-emerald-100 text-emerald-800'
      : outcome === 'decline'
        ? 'bg-slate-200 text-slate-700'
        : outcome === 'fail'
          ? 'bg-rose-100 text-rose-800'
          : 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles}`}
    >
      {outcome}
    </span>
  );
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(s: string, n = 120): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export default function AITranscriptProviderAdminPage({ user: _user }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOutcome, setFilterOutcome] = useState<'all' | Outcome>('all');
  const [windowDays, setWindowDays] = useState<number>(7);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/ai/transcript-provider/summary?days=${windowDays}&limit=50`,
      );
      if (!resp.ok) throw new Error(`Load failed (HTTP ${resp.status})`);
      const json = (await resp.json()) as SummaryResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed.');
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    reload();
  }, [reload]);

  const rows = (data?.recent_runs ?? []).filter((r) =>
    filterOutcome === 'all' ? true : r.outcome === filterOutcome,
  );

  return (
    <>
      <Head>
        <title>External Transcript Provider • Fine Diet Admin</title>
      </Head>
      <main className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                External Transcript Provider
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Rollout, validation, and observability for the Packet 27
                external transcript provider path (Plans Phase 31). All
                activity is recorded as <code>ai_runs</code> rows with
                <code className="ml-1">run_type=&apos;video_transcript_external&apos;</code>.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Link href="/admin/ai" className="text-blue-700 hover:underline">
                ← AI Runtime
              </Link>
              <button
                type="button"
                onClick={reload}
                className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-white disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Reloading…' : 'Reload'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* ===== Config banner ===== */}
          {data && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {rolloutPill(data.config.rollout_state)}
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      data.config.env_key_present
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    SUPADATA_API_KEY: {data.config.env_key_present ? 'detected' : 'missing'}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      data.config.policy.present
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Policy: {data.config.policy.present ? 'present' : 'missing'}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      data.config.policy.deterministic_fallback_available
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Deterministic fallback:
                    {data.config.policy.deterministic_fallback_available ? ' available' : ' none'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Task: <code>video_transcript_external</code>
                </div>
              </div>
              {data.config.rollout_hint && (
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {data.config.rollout_hint}
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                <ConfigBlock label="Preferred model" model={data.config.preferred} />
                <ConfigBlock label="Fallback model" model={data.config.fallback} />
              </div>
            </section>
          )}

          {/* ===== Aggregates strip ===== */}
          {data && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 text-sm">
                  Last {data.aggregates.window_days} day{data.aggregates.window_days === 1 ? '' : 's'}
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-gray-600">Window:</label>
                  <select
                    value={windowDays}
                    onChange={(e) => setWindowDays(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    <option value={1}>1 day</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Attempts" value={String(data.aggregates.attempts)} />
                <StatCard
                  label="Success"
                  value={String(data.aggregates.success)}
                  tone="emerald"
                />
                <StatCard
                  label="Decline"
                  value={String(data.aggregates.decline)}
                  tone="slate"
                />
                <StatCard label="Fail" value={String(data.aggregates.fail)} tone="rose" />
                <StatCard
                  label="Avg latency"
                  value={fmtLatency(data.aggregates.avg_latency_ms)}
                />
              </div>
            </section>
          )}

          {/* ===== Recent runs ===== */}
          <section className="bg-white rounded-lg shadow-sm border border-gray-200">
            <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Recent runs</h2>
              <div className="flex items-center gap-2 text-xs">
                <label className="text-gray-600">Outcome:</label>
                <select
                  value={filterOutcome}
                  onChange={(e) => setFilterOutcome(e.target.value as typeof filterOutcome)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs"
                >
                  <option value="all">all</option>
                  <option value="success">success</option>
                  <option value="decline">decline</option>
                  <option value="fail">fail</option>
                  <option value="unknown">unknown</option>
                </select>
                <span className="text-gray-500">{rows.length} shown</span>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-700 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Outcome</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Provider / Model</th>
                    <th className="px-3 py-2 text-left">Video</th>
                    <th className="px-3 py-2 text-left">Chars</th>
                    <th className="px-3 py-2 text-left">Lang</th>
                    <th className="px-3 py-2 text-left">Latency</th>
                    <th className="px-3 py-2 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {fmtTime(r.created_at)}
                      </td>
                      <td className="px-3 py-2">{outcomePill(r.outcome)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.status}
                        {r.fallback_used && (
                          <span className="ml-1 text-[10px] text-amber-700">fallback</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-700">
                        {r.provider ?? '—'}/{r.model ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.video_url ? (
                          <a
                            href={r.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-700 hover:underline font-mono text-[11px]"
                          >
                            {r.video_id ?? truncate(r.video_url, 40)}
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.transcript_chars ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.language ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {fmtLatency(r.latency_ms)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {r.error_text && (
                          <div className="text-rose-700">{truncate(r.error_text, 140)}</div>
                        )}
                        {!r.error_text && r.provider_error && (
                          <div className="text-slate-600">
                            {truncate(r.provider_error, 140)}
                          </div>
                        )}
                        {!r.error_text &&
                          !r.provider_error &&
                          r.outcome === 'decline' && (
                            <span className="text-slate-500 italic">
                              provider declined
                            </span>
                          )}
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-6 text-sm text-gray-500 text-center"
                      >
                        No runs in the selected window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-gray-500 mt-4">
            Data derived from <code>ai_runs</code> rows where
            <code className="mx-1">run_type=&apos;video_transcript_external&apos;</code>.
            The <em>success / decline / fail</em> classifier is computed
            server-side from the runtime&apos;s response payload so the
            semantics stay consistent.
          </p>
        </div>
      </main>
    </>
  );
}

function ConfigBlock({
  label,
  model,
}: {
  label: string;
  model: ModelLite | null;
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      {model ? (
        <div className="mt-1">
          <div className="font-mono text-xs text-gray-900">
            {model.provider_key}/{model.model_key}
          </div>
          <div className="mt-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                model.enabled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {model.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-500 italic">not configured</div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'emerald' | 'rose' | 'slate';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'slate'
          ? 'text-slate-700'
          : 'text-gray-900';
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const user = await getCurrentUserWithRoleFromSSR(ctx);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/ai/transcript-provider',
        permanent: false,
      },
    };
  }
  return { props: { user } };
};
