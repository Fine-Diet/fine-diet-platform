/**
 * Admin Page: Site Settings Hub
 * 
 * Central hub for site configuration and content management.
 * Links to all site settings pages.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface SiteSettingsHubProps {
  user: AuthenticatedUser | null;
}

interface SettingsCard {
  title: string;
  description: string;
  href: string;
  viewOnly?: boolean;
}

const settingsCards: SettingsCard[] = [
  {
    title: 'Global Settings',
    description: 'Announcement bar and site-wide settings.',
    href: '/admin/global',
  },
  {
    title: 'SEO',
    description: 'Global defaults, robots.txt, browser assets, and page-level editing links.',
    href: '/admin/seo',
  },
  {
    title: 'Navigation & Categories',
    description: 'Menus, categories, and waitlist cards for category pages.',
    href: '/admin/navigation',
  },
  {
    title: 'Home',
    description: 'Hero, sections, and content on the main homepage.',
    href: '/admin/home',
  },
  {
    title: 'Footer',
    description: 'Footer navigation and legal links.',
    href: '/admin/footer',
  },
  {
    title: 'Products',
    description: 'Product registry and hero content for product pages.',
    href: '/admin/products',
  },
  {
    title: 'Waitlist',
    description: 'Copy and form settings for /journal-waitlist.',
    href: '/admin/waitlist',
  },
  {
    title: 'Asset Library',
    description: 'Upload, browse, and manage images and media assets.',
    href: '/admin/assets',
  },
  {
    title: 'Waitlist Signups',
    description: 'View all waitlist submissions and signups.',
    href: '/admin/waitlist-signups',
    viewOnly: true,
  },
];

export default function SiteSettingsHub({ user }: SiteSettingsHubProps) {
  // Defensive check for unauthorized users
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>Site Settings • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
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

  return (
    <>
      <Head>
        <title>Site Settings • Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Admin Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Site Settings</h1>
                <p className="text-lg text-gray-600">
                  Manage site configuration, content, and settings
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {settingsCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                      {card.title}
                    </h2>
                    <p className="text-sm text-gray-600">{card.description}</p>
                  </div>
                  {card.viewOnly && (
                    <span className="ml-2 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                      View Only
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<SiteSettingsHubProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/site-settings',
        permanent: false,
      },
    };
  }

  return {
    props: {
      user,
    },
  };
};
