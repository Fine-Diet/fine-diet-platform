/**
 * Admin Page: Waitlist Signups View
 * 
 * Admin/editor-only page for viewing waitlist signups from public.waitlist table.
 * Protected by middleware and SSR guard.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser } from '@/lib/authServer';

interface WaitlistSignupsProps {
  user: AuthenticatedUser | null;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  goal: string | null;
  source: string | null;
  created_at: string;
}

export default function WaitlistSignups({ user }: WaitlistSignupsProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch waitlist entries on mount
  useEffect(() => {
    async function fetchEntries() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/admin/waitlist-signups');

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch waitlist entries');
        }

        const data = await response.json();
        setEntries(data.entries || []);
      } catch (err) {
        console.error('Error fetching waitlist entries:', err);
        setError(err instanceof Error ? err.message : 'Failed to load waitlist entries');
      } finally {
        setLoading(false);
      }
    }

    fetchEntries();
  }, []);

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return entries;
    }

    const query = searchQuery.toLowerCase().trim();
    return entries.filter(
      (entry) =>
        entry.email.toLowerCase().includes(query) ||
        (entry.name && entry.name.toLowerCase().includes(query))
    );
  }, [entries, searchQuery]);

  // Download CSV
  const handleDownloadCSV = () => {
    if (filteredEntries.length === 0) {
      alert('No entries to download');
      return;
    }

    // CSV headers
    const headers = ['Created At', 'Email', 'Name', 'Goal', 'Source'];
    const rows = filteredEntries.map((entry) => {
      const createdDate = new Date(entry.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return [
        createdDate,
        entry.email,
        entry.name || '',
        entry.goal || '',
        entry.source || '',
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `waitlist-signups-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Defensive check - middleware should have already blocked non-authorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Waitlist Signups • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don't have permission to access this area. Only editors and administrators can view waitlist signups.
            </p>
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
        <title>Waitlist Signups • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Waitlist Signups</h1>
                <p className="text-lg text-gray-600">
                  View all waitlist submissions from The Fine Diet Journal.
                </p>
              </div>
              <Link
                href="/admin"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ← Back to Dashboard
              </Link>
            </div>
            <div className="text-sm text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email || 'Unknown'}</span>
            </div>
          </div>

          {/* Search and Download Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleDownloadCSV}
              disabled={filteredEntries.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
            >
              Download CSV ({filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'})
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-600">Loading waitlist entries...</p>
            </div>
          ) : (
            /* Waitlist Table */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Goal
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                          {searchQuery ? 'No entries found matching your search.' : 'No waitlist entries found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((entry) => {
                        const createdDate = new Date(entry.created_at).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        return (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {createdDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{entry.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry.name || <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry.goal || <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry.source || <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Total entries:</strong> {entries.length} {searchQuery && `(${filteredEntries.length} filtered)`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<WaitlistSignupsProps> = async (context) => {
  // Get the current user with their role
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Note: Middleware should have already blocked non-editor/admin users,
  // but we still check here for defensive programming
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    // Return user as null - component will show "no access" message
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

