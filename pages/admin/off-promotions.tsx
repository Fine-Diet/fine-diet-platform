/**
 * Admin Page: OFF Promotion Queue
 *
 * Review queue for OFF promotion candidates.
 * - Editors: mark reviewed, defer, flag, add notes
 * - Admins: all of the above + reject + promote
 *
 * Route: /admin/off-promotions
 * Protected by middleware + SSR role guard.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';

// ── Types ─────────────────────────────────────────────────────────────────────

type CandidateStatus =
  | 'raw_off'
  | 'normalized_off'
  | 'review_needed'
  | 'promoted'
  | 'rejected';

interface Candidate {
  id: string;
  off_product_id: string;
  product_name: string | null;
  brands: string | null;
  status: CandidateStatus;
  selection_count: number;
  distinct_session_count: number;
  flag_normalization: boolean;
  deferred: boolean;
  admin_flagged: boolean;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  reviewer_role: string | null;
  review_notes: string | null;
  first_selected_at: string;
  last_selected_at: string;
  updated_at: string;
}

interface OffMirrorSnapshot {
  product_name: string | null;
  generic_name: string | null;
  brands: string | null;
  barcode: string | null;
  serving_size: string | null;
  quantity: string | null;
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
  image_front_url: string | null;
  image_url: string | null;
}

interface OffNormalization {
  serving_size_text: string | null;
  serving_size_g: number | null;
  nutrition_basis: string;
  serving_confidence: string;
  completeness_score: number;
  normalization_status: string;
}

interface AuditRow {
  id: string;
  action: string;
  from_status: string;
  to_status: string;
  actor_email: string | null;
  actor_role: string;
  note: string | null;
  created_at: string;
}

interface CandidateDetail {
  candidate: Candidate;
  offMirror: OffMirrorSnapshot | null;
  offNormalization: OffNormalization | null;
  auditLog: AuditRow[];
  promotedSnapshot: Record<string, unknown> | null;
}

type ActionType =
  | 'mark_reviewed'
  | 'defer'
  | 'flag_normalization'
  | 'add_notes'
  | 'reject'
  | 'promote';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CandidateStatus | string, string> = {
  raw_off: 'Raw',
  normalized_off: 'Reviewed',
  review_needed: 'Needs Review',
  promoted: 'Promoted',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<CandidateStatus | string, string> = {
  raw_off: 'bg-gray-100 text-gray-700',
  normalized_off: 'bg-blue-100 text-blue-700',
  review_needed: 'bg-amber-100 text-amber-700',
  promoted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'review_needed', label: 'Needs Review' },
  { key: 'raw_off', label: 'Raw' },
  { key: 'normalized_off', label: 'Reviewed' },
  { key: 'promoted', label: 'Promoted' },
  { key: 'rejected', label: 'Rejected' },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  user: AuthenticatedUser | null;
}

export default function OffPromotionsPage({ user }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('review_needed');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const isAdmin = user?.role === 'admin';

  // ── Load list ──────────────────────────────────────────────────────────────
  const loadList = useCallback(async (filter: string) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        filter === 'all'
          ? '/api/admin/off-promotions'
          : `/api/admin/off-promotions?status=${filter}`;
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load candidates');
      }
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList(statusFilter);
  }, [statusFilter, loadList]);

  // ── Load detail ────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    setActionError(null);
    setNoteInput('');
    try {
      const res = await fetch(`/api/admin/off-promotions?id=${id}`);
      if (!res.ok) throw new Error('Failed to load detail');
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to load detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleRowClick = (id: string) => {
    setSelectedId(id);
    loadDetail(id);
  };

  const handleCloseDrawer = () => {
    setSelectedId(null);
    setDetail(null);
    setActionError(null);
    setNoteInput('');
  };

  // ── Perform action ─────────────────────────────────────────────────────────
  const performAction = async (action: ActionType, note?: string) => {
    if (!selectedId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/off-promotion-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, action, note: note ?? noteInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      // Refresh list and detail
      await Promise.all([loadList(statusFilter), loadDetail(selectedId)]);
      setNoteInput('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>OFF Promotion Queue • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">Editor or admin role required.</p>
            <Link
              href="/admin"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Return to Admin Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>OFF Promotion Queue • Fine Diet Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-1">OFF Promotion Queue</h1>
              <p className="text-gray-600">
                Review Open Food Facts candidates queued from user search demand.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Signed in as <span className="font-medium text-gray-700">{user.email}</span>{' '}
                <span className="text-gray-400">({user.role})</span>
              </p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>

          {/* Info banner */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Reviewers</strong> can mark reviewed, defer, flag normalization, and add notes.{' '}
              <strong>Admins</strong> can also reject or promote candidates.
              Promoted items land in <code className="font-mono text-xs">promoted_off_foods</code> — they do not
              auto-write to curated/core food tables.
            </p>
          </div>

          {/* Status filter tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading candidates…</div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No candidates found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        'Status',
                        'Product',
                        'Brand',
                        'OFF ID',
                        'Sel.',
                        'Sessions',
                        'Flags',
                        'Last Seen',
                        'Reviewed By',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {candidates.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => handleRowClick(c.id)}
                        className={`cursor-pointer hover:bg-blue-50 transition-colors ${
                          selectedId === c.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {STATUS_LABELS[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <span className="block truncate font-medium text-gray-900">
                            {c.product_name ?? <span className="text-gray-400 font-normal">Unknown</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[140px]">
                          <span className="block truncate text-gray-600">
                            {c.brands ?? <span className="text-gray-400">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500 truncate block max-w-[100px]">
                            {c.off_product_id}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 font-medium">
                          {c.selection_count}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {c.distinct_session_count}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {c.admin_flagged && (
                            <span className="inline-block mr-1 text-purple-600" title="Admin flagged">★</span>
                          )}
                          {c.flag_normalization && (
                            <span className="inline-block mr-1 text-amber-500" title="Normalization flagged">⚠</span>
                          )}
                          {c.deferred && (
                            <span className="inline-block text-gray-400" title="Deferred">⏸</span>
                          )}
                          {!c.admin_flagged && !c.flag_normalization && !c.deferred && (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {fmtDate(c.last_selected_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[130px]">
                          <span className="block truncate text-xs">
                            {c.reviewed_by_email ?? <span className="text-gray-400">—</span>}
                          </span>
                          {c.reviewed_at && (
                            <span className="block text-xs text-gray-400">{fmtDate(c.reviewed_at)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-3 text-xs text-gray-400">
            {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} shown
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCloseDrawer}
          />
          {/* Panel */}
          <div className="relative z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Candidate Detail</h2>
              <button
                onClick={handleCloseDrawer}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
              {detailLoading && (
                <p className="text-gray-500 text-sm">Loading…</p>
              )}

              {!detailLoading && detail && (
                <DetailPanel
                  detail={detail}
                  isAdmin={isAdmin}
                  actionLoading={actionLoading}
                  actionError={actionError}
                  noteInput={noteInput}
                  setNoteInput={setNoteInput}
                  onAction={performAction}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  detail: CandidateDetail;
  isAdmin: boolean;
  actionLoading: boolean;
  actionError: string | null;
  noteInput: string;
  setNoteInput: (v: string) => void;
  onAction: (action: ActionType, note?: string) => Promise<void>;
}

function DetailPanel({
  detail,
  isAdmin,
  actionLoading,
  actionError,
  noteInput,
  setNoteInput,
  onAction,
}: DetailPanelProps) {
  const { candidate: c, offMirror, offNormalization, auditLog, promotedSnapshot } = detail;
  const isTerminal = c.status === 'promoted' || c.status === 'rejected';

  return (
    <div className="space-y-6 text-sm">
      {/* Status + IDs */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
              STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {STATUS_LABELS[c.status] ?? c.status}
          </span>
          {c.admin_flagged && (
            <span className="text-xs text-purple-600 font-medium">★ Admin flagged</span>
          )}
          {c.flag_normalization && (
            <span className="text-xs text-amber-500 font-medium">⚠ Normalization flagged</span>
          )}
          {c.deferred && <span className="text-xs text-gray-400">⏸ Deferred</span>}
        </div>
        <div className="text-gray-900 font-semibold text-base">
          {c.product_name ?? offMirror?.product_name ?? 'Unknown Product'}
        </div>
        {(c.brands || offMirror?.brands) && (
          <div className="text-gray-600">{c.brands ?? offMirror?.brands}</div>
        )}
        <div className="text-xs text-gray-400 font-mono">{c.off_product_id}</div>
      </div>

      {/* Demand signal */}
      <Section title="Demand Signal">
        <Grid2>
          <Stat label="Selections" value={c.selection_count} />
          <Stat label="Distinct Sessions" value={c.distinct_session_count} />
          <Stat label="First Seen" value={fmtDate(c.first_selected_at)} />
          <Stat label="Last Seen" value={fmtDate(c.last_selected_at)} />
        </Grid2>
      </Section>

      {/* OFF snapshot */}
      {offMirror && (
        <Section title="OFF Mirror Snapshot">
          <Grid2>
            <Stat label="Barcode" value={offMirror.barcode ?? '—'} />
            <Stat label="Generic Name" value={offMirror.generic_name ?? '—'} />
            <Stat label="Serving Size (raw)" value={offNormalization?.serving_size_text ?? '—'} />
            <Stat label="Serving Size (g)" value={offNormalization?.serving_size_g != null ? `${offNormalization.serving_size_g}g` : '—'} />
            <Stat label="Serving Confidence" value={offNormalization?.serving_confidence ?? '—'} />
            <Stat label="Completeness" value={offNormalization ? `${offNormalization.completeness_score}/5` : '—'} />
            <Stat label="Norm Status" value={offNormalization?.normalization_status ?? '—'} />
            <Stat label="Nutrition Basis" value={offNormalization?.nutrition_basis ?? '—'} />
          </Grid2>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Per 100g</p>
            <Grid2>
              <Stat label="Calories" value={offMirror.energy_kcal_100g != null ? `${offMirror.energy_kcal_100g} kcal` : '—'} />
              <Stat label="Protein" value={offMirror.protein_g_100g != null ? `${offMirror.protein_g_100g}g` : '—'} />
              <Stat label="Carbs" value={offMirror.carbs_g_100g != null ? `${offMirror.carbs_g_100g}g` : '—'} />
              <Stat label="Fat" value={offMirror.fat_g_100g != null ? `${offMirror.fat_g_100g}g` : '—'} />
              <Stat label="Fiber" value={offMirror.fiber_g_100g != null ? `${offMirror.fiber_g_100g}g` : '—'} />
              <Stat label="Sugars" value={offMirror.sugars_g_100g != null ? `${offMirror.sugars_g_100g}g` : '—'} />
              <Stat label="Sodium" value={offMirror.sodium_mg_100g != null ? `${offMirror.sodium_mg_100g}mg` : '—'} />
            </Grid2>
          </div>
        </Section>
      )}

      {/* Promoted snapshot */}
      {promotedSnapshot && (
        <Section title="Promoted Snapshot">
          <div className="text-xs text-gray-500 space-y-1">
            <div>Promoted by: <span className="text-gray-700">{String(promotedSnapshot.promoted_by_email ?? '—')}</span></div>
            <div>Promoted at: <span className="text-gray-700">{fmtDatetime(String(promotedSnapshot.promoted_at ?? ''))}</span></div>
            {promotedSnapshot.notes && (
              <div>Notes: <span className="text-gray-700">{String(promotedSnapshot.notes)}</span></div>
            )}
          </div>
        </Section>
      )}

      {/* Review notes (current state) */}
      {c.review_notes && (
        <Section title="Review Notes">
          <p className="text-gray-700 whitespace-pre-wrap">{c.review_notes}</p>
          {c.reviewed_by_email && (
            <p className="mt-1 text-xs text-gray-400">
              — {c.reviewed_by_email} ({c.reviewer_role}) on {fmtDate(c.reviewed_at)}
            </p>
          )}
        </Section>
      )}

      {/* Audit log */}
      {auditLog.length > 0 && (
        <Section title={`Audit Log (${auditLog.length})`}>
          <div className="space-y-2">
            {auditLog.map((row) => (
              <div key={row.id} className="border border-gray-100 rounded-md p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 capitalize">{row.action.replace(/_/g, ' ')}</span>
                  <span className="text-gray-400">{fmtDatetime(row.created_at)}</span>
                </div>
                <div className="text-gray-500 mt-0.5">
                  {row.from_status} → {row.to_status}
                  {' · '}
                  {row.actor_email ?? 'unknown'} ({row.actor_role})
                </div>
                {row.note && (
                  <div className="mt-1 text-gray-600 italic">&ldquo;{row.note}&rdquo;</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Action area */}
      {!isTerminal && (
        <Section title="Actions">
          {actionError && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {actionError}
            </div>
          )}

          {/* Note field */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400">(optional, required for Add Notes action)</span>
            </label>
            <textarea
              rows={2}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={actionLoading}
            />
          </div>

          {/* Reviewer actions */}
          <div className="flex flex-wrap gap-2 mb-2">
            <ActionBtn
              label="Mark Reviewed"
              onClick={() => onAction('mark_reviewed')}
              disabled={actionLoading}
              color="blue"
            />
            <ActionBtn
              label="Defer"
              onClick={() => onAction('defer')}
              disabled={actionLoading}
              color="gray"
            />
            <ActionBtn
              label="Flag Normalization"
              onClick={() => onAction('flag_normalization')}
              disabled={actionLoading}
              color="amber"
            />
            <ActionBtn
              label="Add Notes"
              onClick={() => onAction('add_notes')}
              disabled={actionLoading || !noteInput.trim()}
              color="gray"
            />
          </div>

          {/* Admin-only actions */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <ActionBtn
                label="Reject"
                onClick={() => {
                  if (window.confirm('Reject this candidate? This action cannot be undone.')) {
                    onAction('reject');
                  }
                }}
                disabled={actionLoading}
                color="red"
              />
              <ActionBtn
                label="Promote"
                onClick={() => {
                  if (window.confirm('Promote this candidate to promoted_off_foods? The OFF mirror will not be modified.')) {
                    onAction('promote');
                  }
                }}
                disabled={actionLoading}
                color="green"
              />
            </div>
          )}
        </Section>
      )}

      {isTerminal && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-500">
          This candidate is in a terminal state (<strong>{c.status}</strong>) and cannot be modified.
        </div>
      )}
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <div className="text-xs text-gray-800 font-medium">{value}</div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  color,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: 'blue' | 'gray' | 'amber' | 'red' | 'green';
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    gray: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    amber: 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        colorMap[color]
      }`}
    >
      {label}
    </button>
  );
}

// ── SSR ───────────────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};
