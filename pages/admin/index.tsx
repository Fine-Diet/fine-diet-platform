/**
 * Admin Dashboard
 * 
 * Main hub for all CMS sections. Protected by middleware and role-based access.
 * Only users with 'editor' or 'admin' role can access this page.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface AdminDashboardProps {
  user: AuthenticatedUser | null;
}

interface DashboardCard {
  title: string;
  description: string;
  href: string;
}

const dashboardSections: DashboardCard[] = [
  {
    title: 'Navigation & Categories',
    description: 'Menus, categories, and waitlist cards for category pages.',
    href: '/admin/navigation',
  },
  {
    title: 'Home Page',
    description: 'Hero, sections, and content on the main homepage.',
    href: '/admin/home',
  },
  {
    title: 'Journal Waitlist',
    description: 'Copy and form settings for /journal-waitlist.',
    href: '/admin/waitlist',
  },
  {
    title: 'Waitlist Signups',
    description: 'View all waitlist submissions and signups.',
    href: '/admin/waitlist-signups',
  },
  {
    title: 'Global & SEO',
    description: 'Announcement bar, default SEO, site-wide settings.',
    href: '/admin/global',
  },
  {
    title: 'Footer',
    description: 'Footer navigation and legal links.',
    href: '/admin/footer',
  },
  {
    title: 'Products & Offers',
    description: 'Product registry and hero content for product pages.',
    href: '/admin/products',
  },
];

const adminOnlySections: DashboardCard[] = [
  {
    title: 'Team & Roles',
    description: 'Manage user roles and permissions for content editors.',
    href: '/admin/people',
  },
  {
    title: 'Outbox',
    description: 'Monitor webhook delivery status and retry failures.',
    href: '/admin/outbox',
  },
];

interface DayMetrics {
  day: string;
  count?: number;
  sent_count?: number;
  failed_count?: number;
  pending_count?: number;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  // Debug mode: show user data as JSON
  const router = useRouter();
  const debug = router.query.debug === '1';

  // Delivery health metrics
  const [metrics, setMetrics] = useState<DayMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      if (user?.role !== 'admin') return;

      try {
        const response = await fetch('/api/admin/metrics/outbox');
        if (response.ok) {
          const data = await response.json();
          setMetrics(data.metrics || []);
        }
      } catch (err) {
        console.error('Error fetching metrics:', err);
      } finally {
        setMetricsLoading(false);
      }
    }

    fetchMetrics();
  }, [user]);

  if (debug && user) {
    return (
      <>
        <Head>
          <title>Admin Debug • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Admin Debug (SSR User Data)</h1>
            <pre className="bg-white p-4 rounded border overflow-auto">
              {JSON.stringify(user, null, 2)}
            </pre>
            <Link href="/admin" className="mt-4 inline-block text-blue-600 hover:underline">
              ← Back to Admin Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  // Defensive check - middleware should have already blocked non-authorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Admin • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don't have permission to access this area.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Return to Home
            </Link>
          </div>
        </main>
      </>
    );
  }

  const siteEnv = process.env.NEXT_PUBLIC_SITE_ENV;

  return (
    <>
      <Head>
        <title>Admin Dashboard • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Fine Diet Admin</h1>
            <p className="text-lg text-gray-600 mb-4">
              Use the panels below to manage site content.
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>
                Signed in as <span className="font-medium text-gray-700">{user.email || 'Unknown'}</span>{' '}
                <span className="text-gray-400">({user.role})</span>
              </span>
              {siteEnv && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="px-2 py-1 bg-gray-200 rounded text-gray-700 font-mono text-xs">
                    {siteEnv}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Delivery Health Card (Admin Only) */}
          {user.role === 'admin' && (
            <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Delivery Health (14d)</h2>
              {metricsLoading ? (
                <p className="text-sm text-gray-500">Loading metrics...</p>
              ) : metrics.length > 0 ? (
                <DeliveryHealthCard metrics={metrics} />
              ) : (
                <p className="text-sm text-gray-500">No metrics available</p>
              )}
            </div>
          )}

          {/* Dashboard Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardSections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all group"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {section.title}
                </h2>
                <p className="text-sm text-gray-600 mb-4">{section.description}</p>
                <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  <span>Edit Content</span>
                  <svg
                    className="ml-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
            {/* Admin-only sections */}
            {user.role === 'admin' &&
              adminOnlySections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="block bg-white rounded-lg shadow-sm border-2 border-purple-200 p-6 hover:shadow-md hover:border-purple-300 transition-all group"
                >
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
                    {section.title}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">{section.description}</p>
                  <div className="flex items-center text-sm font-medium text-purple-600 group-hover:text-purple-700">
                    <span>Manage Roles</span>
                    <svg
                      className="ml-2 h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

function DeliveryHealthCard({ metrics }: { metrics: DayMetrics[] }) {
  // Get today's metrics (last item in array)
  const today = metrics[metrics.length - 1];
  const todaySubmissions = today?.count || 0;
  const todaySent = today?.sent_count || 0;
  const todayFailed = today?.failed_count || 0;
  const todayPending = today?.pending_count || 0;

  // Calculate fail rate
  const totalDelivered = todaySent + todayFailed;
  const failRate = totalDelivered > 0 ? ((todayFailed / totalDelivered) * 100).toFixed(1) : '0.0';

  // Get last 7 days for table
  const last7Days = metrics.slice(-7);

  // Format date for display
  const formatDate = (dayStr: string) => {
    const date = new Date(dayStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      {/* Today's Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div>
          <div className="text-2xl font-bold text-gray-900">{todaySubmissions}</div>
          <div className="text-sm text-gray-500">Submissions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">{todaySent}</div>
          <div className="text-sm text-gray-500">Sent</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600">{todayFailed}</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-yellow-600">{todayPending}</div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
      </div>

      {/* Fail Rate */}
      <div className="mb-6">
        <div className="text-sm text-gray-600">
          Fail Rate: <span className="font-semibold text-gray-900">{failRate}%</span>
          {totalDelivered === 0 && <span className="text-gray-400 ml-2">(no deliveries today)</span>}
        </div>
      </div>

      {/* Last 7 Days Table */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Last 7 Days</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-700">Date</th>
                <th className="text-right py-2 px-3 font-medium text-gray-700">Submissions</th>
                <th className="text-right py-2 px-3 font-medium text-gray-700">Sent</th>
                <th className="text-right py-2 px-3 font-medium text-gray-700">Failed</th>
                <th className="text-right py-2 px-3 font-medium text-gray-700">Pending</th>
              </tr>
            </thead>
            <tbody>
              {last7Days.map((day) => {
                const submissions = day.count || 0;
                const sent = day.sent_count || 0;
                const failed = day.failed_count || 0;
                const pending = day.pending_count || 0;
                return (
                  <tr key={day.day} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-900">{formatDate(day.day)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{submissions}</td>
                    <td className="py-2 px-3 text-right text-green-600">{sent}</td>
                    <td className="py-2 px-3 text-right text-red-600">{failed}</td>
                    <td className="py-2 px-3 text-right text-yellow-600">{pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<AdminDashboardProps> = async (context) => {
  // Get the current user with their role
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Note: Middleware should have already blocked non-authorized users,
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
