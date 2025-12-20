/**
 * Admin Page: Webhook Outbox Monitor
 * 
 * Admin-only page for monitoring webhook_outbox entries.
 * Protected by middleware and SSR guard.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';

interface AdminOutboxProps {
  user: AuthenticatedUser | null;
}

interface OutboxEntry {
  submission_id: string;
  target: string;
  status: string;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
}

export default function AdminOutbox({ user }: AdminOutboxProps) {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('failed');
  const [limit, setLimit] = useState<number>(50);

  // Fetch entries when filter changes
  useEffect(() => {
    async function fetchEntries() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/admin/outbox?status=${statusFilter}&limit=${limit}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch outbox entries');
        }

        const data = await response.json();
        setEntries(data.entries || []);
      } catch (err) {
        console.error('Error fetching outbox entries:', err);
        setError(err instanceof Error ? err.message : 'Failed to load outbox entries');
      } finally {
        setLoading(false);
      }
    }

    fetchEntries();
  }, [statusFilter, limit]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '-';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  // Truncate error message
  const truncateError = (error: string | null, maxLength: number = 120) => {
    if (!error) return '-';
    if (error.length <= maxLength) return error;
    return error.substring(0, maxLength) + '...';
  };

  // Defensive check - middleware should have already blocked non-authorized users
  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Admin Outbox • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">You don't have permission to access this page.</p>
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
        <title>Outbox Monitor • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/admin"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Webhook Outbox Monitor</h1>
            <p className="mt-2 text-sm text-gray-600">
              Monitor webhook delivery status and retry failures.
            </p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status Filter
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div>
                <label htmlFor="limit-selector" className="block text-sm font-medium text-gray-700 mb-1">
                  Limit
                </label>
                <select
                  id="limit-selector"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <p className="text-gray-600">Loading outbox entries...</p>
            </div>
          ) : (
            /* Table */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {entries.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p>No entries found with status "{statusFilter}".</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submission ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Target
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Attempts
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Attempt
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sent At
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Error Message
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {entries.map((entry, index) => (
                        <tr key={`${entry.submission_id}-${index}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            {entry.submission_id.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {entry.target}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                entry.status === 'sent'
                                  ? 'bg-green-100 text-green-800'
                                  : entry.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {entry.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {entry.attempts}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatTimestamp(entry.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatTimestamp(entry.last_attempt_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatTimestamp(entry.sent_at)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                            {entry.error_message ? (
                              <span title={entry.error_message}>
                                {truncateError(entry.error_message)}
                              </span>
                            ) : (
                              '-'
                            )}
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

export const getServerSideProps: GetServerSideProps<AdminOutboxProps> = async (context) => {
  // Get the current user with their role
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Note: Middleware should have already blocked non-authorized users,
  // but we still check here for defensive programming (admin-only)
  if (!user || user.role !== 'admin') {
    return {
      props: {
        user: null,
      },
    };
  }

  return {
    props: {
      user,
    },
  };
};

