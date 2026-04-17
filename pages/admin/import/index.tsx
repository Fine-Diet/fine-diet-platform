/**
 * Admin Page: Import Contacts — Hub
 *
 * Lists available import sources. Currently Klaviyo only.
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface PageProps {
  user: AuthenticatedUser | null;
}

const IMPORT_SOURCES = [
  {
    key: 'manual',
    name: 'Add Single Contact',
    description:
      'Manually add or update one contact with full preference control. Use for seeding test contacts, adding referrals, or validating the editorial send path.',
    href: '/admin/import/manual',
    status: 'available',
    badge: 'Manual',
    badgeColor: 'bg-blue-100 text-blue-700',
  },
  {
    key: 'klaviyo',
    name: 'Klaviyo Import',
    description:
      'Import opted-in contacts from a Klaviyo list or full profile export. 5-step wizard with dry-run review, test mode, and optional editorial eligibility.',
    href: '/admin/import/klaviyo',
    status: 'available',
    badge: 'CSV',
    badgeColor: 'bg-green-100 text-green-700',
  },
];

export default function ImportIndexPage({ user }: PageProps) {
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">You don't have permission to access this area.</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Import Contacts • Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Import Contacts</h1>
          <p className="text-gray-500 mb-8">
            Migrate opted-in contacts from external marketing platforms into the Fine Diet people system.
            All imports require a dry-run review before writing any data.
          </p>

          <div className="space-y-4">
            {IMPORT_SOURCES.map((source) => (
              <div key={source.key} className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-semibold text-gray-900">{source.name}</h2>
                      {'badge' in source && source.badge && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${'badgeColor' in source ? source.badgeColor : ''}`}>
                          {source.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{source.description}</p>
                  </div>
                </div>
                <Link
                  href={source.href}
                  className="ml-6 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap text-sm flex-shrink-0"
                >
                  {source.key === 'manual' ? 'Add Contact →' : 'Start Import →'}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            <p className="font-semibold mb-1">Safety note</p>
            <p>
              Imports never resubscribe unsubscribed contacts, never overwrite existing name fields, and never
              create duplicate subscriptions. All imports are idempotent — running the same file twice produces
              the same result.
            </p>
          </div>
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
