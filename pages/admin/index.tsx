/**
 * Admin Dashboard
 * 
 * Main hub for all CMS sections. Protected by middleware and role-based access.
 * Only users with 'editor' or 'admin' role can access this page.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
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

export default function AdminDashboard({ user }: AdminDashboardProps) {
  // Defensive check - middleware should have already blocked non-authorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Admin • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
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
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          </div>
        </div>
      </div>
    </>
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
