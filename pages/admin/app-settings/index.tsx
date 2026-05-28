/**
 * Admin Page: App Settings Hub
 *
 * Central hub for app-specific content and configuration.
 * Journal, Insights, Plans, Profile — expand as new app pages are built.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface AppSettingsHubProps {
  user: AuthenticatedUser | null;
}

interface SettingsCard {
  title: string;
  description: string;
  href: string;
  available: boolean;
}

const appSettingsCards: SettingsCard[] = [
  {
    title: 'Journal',
    description: 'Hero background images and daily summary tile images for /journal.',
    href: '/admin/journal',
    available: true,
  },
  {
    title: 'Insights',
    description: 'Content and configuration for the journal insights page.',
    href: '/admin/insights',
    available: false,
  },
  {
    title: 'Plans',
    description: 'Content and configuration for the journal plans page.',
    href: '/admin/plans',
    available: false,
  },
  {
    title: 'Program Guidance',
    description:
      'Author, validate, and manage program_plan_guidance rows that bias Plans generation.',
    href: '/admin/program-guidance',
    available: true,
  },
  {
    title: 'Program Assignments',
    description:
      'Assign programs to people with active dates + priority. Gates guidance inheritance into Plans.',
    href: '/admin/program-assignments',
    available: true,
  },
  {
    title: 'Programs',
    description:
      'Manage the program catalogue — modules, content items, and publish state for /journal/programs.',
    href: '/admin/programs',
    available: true,
  },
  {
    title: 'Program Series',
    description:
      'Manage public marketing series for /programs while preserving the code-owned fallback catalogue.',
    href: '/admin/program-series',
    available: true,
  },
  {
    title: 'Missing-item Requests',
    description:
      'Review no-match / low-confidence food items queued from Journal search and Imports. Resolve to a trusted food object or dismiss.',
    href: '/admin/missing-item-requests',
    available: true,
  },
  {
    title: 'AI Runtime',
    description:
      'Provider / model config, task routing, tier, and enable-disable governance for the AI runtime layer.',
    href: '/admin/ai',
    available: true,
  },
  {
    title: 'Profile',
    description: 'Content and configuration for the journal profile page.',
    href: '/admin/profile',
    available: false,
  },
];

export default function AppSettingsHub({ user }: AppSettingsHubProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <>
        <Head>
          <title>App Settings • Fine Diet Admin</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don&apos;t have permission to access this area.
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
        <title>App Settings • Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8">
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
            >
              ← Back to Admin Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">App Settings</h1>
                <p className="text-lg text-gray-600">
                  Manage content and configuration for journal and app pages
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {appSettingsCards.map((card) =>
              card.available ? (
                <Link
                  key={card.href}
                  href={card.href}
                  className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all group"
                >
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                      {card.title}
                    </h2>
                    <p className="text-sm text-gray-600">{card.description}</p>
                  </div>
                </Link>
              ) : (
                <div
                  key={card.href}
                  className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 mb-2">{card.title}</h2>
                      <p className="text-sm text-gray-600 mb-3">{card.description}</p>
                      <span className="inline-block px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                        Coming soon
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AppSettingsHubProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/app-settings',
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
