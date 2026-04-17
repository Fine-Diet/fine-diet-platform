/**
 * Admin Page: Email Campaigns — List
 *
 * Lists all email campaigns with status, type, audience, template.
 * Supports creating new campaigns inline via a modal.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import type { EmailCampaign, CampaignStatus } from '@/lib/emailCampaignTypes';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLORS,
  CAMPAIGN_TYPE_OPTIONS,
  AUDIENCE_OPTIONS,
  TEMPLATE_OPTIONS,
} from '@/lib/emailCampaignTypes';

interface PageProps {
  user: AuthenticatedUser | null;
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CAMPAIGN_STATUS_COLORS[status]}`}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}

function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState('editorial');
  const [audienceKey, setAudienceKey] = useState('fine_print_post_nurture');
  const [templateKey, setTemplateKey] = useState('fine_print_weekly');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaign_type: campaignType, audience_key: audienceKey, template_key: templateKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create campaign.');
      onCreate(data.campaign.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign.');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">New Campaign</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fine Print Issue 002"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Type</label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
            <select
              value={audienceKey}
              onChange={(e) => setAudienceKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsListPage({ user }: PageProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <p className="text-gray-600">You don't have permission to access this area.</p>
      </main>
    );
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = statusFilter ? `/api/admin/campaigns?status=${statusFilter}` : '/api/admin/campaigns';
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load campaigns.');
        setCampaigns(data.campaigns || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [statusFilter]);

  const statusOptions: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'in_review', label: 'In Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'sent', label: 'Sent' },
    { value: 'archived', label: 'Archived' },
  ];

  const getTemplateName = (key: string) =>
    TEMPLATE_OPTIONS.find((t) => t.key === key)?.label ?? key;

  const getAudienceName = (key: string) =>
    AUDIENCE_OPTIONS.find((a) => a.key === key)?.label ?? key;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <>
      <Head>
        <title>Email Campaigns • Fine Diet Admin</title>
      </Head>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(id) => router.push(`/admin/campaigns/${id}`)}
        />
      )}

      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <div className="mb-8">
            <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
              ← Back to Admin Dashboard
            </Link>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Email Campaigns</h1>
                <p className="text-lg text-gray-600">
                  Draft, review, and send Fine Diet marketing emails.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
              >
                + New Campaign
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mb-6">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              {loading ? 'Loading…' : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {campaigns.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500 mb-4">No campaigns yet.</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Create your first campaign
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audience</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {campaigns.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/admin/campaigns/${c.id}`)}
                        >
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{c.slug}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                            {c.campaign_type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {getTemplateName(c.template_key)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {getAudienceName(c.audience_key)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(c.updated_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {c.scheduled_for ? formatDate(c.scheduled_for) : <span className="text-gray-300">—</span>}
                          </td>
                          <td
                            className="px-6 py-4 whitespace-nowrap text-right text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/admin/campaigns/${c.id}`}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              {c.status === 'sent' ? 'View' : 'Edit'}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};
