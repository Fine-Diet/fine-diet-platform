/**
 * TEMP / DEV ONLY - Admin Content Viewer
 * 
 * This page provides a read-only view of all site content.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access
 * TODO: Add editing capabilities once Supabase schema is ready
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getNavigationContent, getHomeContent, getFooterContent } from '@/lib/contentApi';
import { NavigationContent, HomeContent, FooterContent } from '@/lib/contentTypes';

interface AdminPageProps {
  navigation: NavigationContent;
  homeContent: HomeContent;
  footerContent: FooterContent;
}

export default function AdminPage({ navigation, homeContent, footerContent }: AdminPageProps) {
  return (
    <>
      <Head>
        <title>Admin • Fine Diet Content Management</title>
      </Head>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Site Content Admin</h1>
            <p className="text-sm text-red-600 font-semibold">
              ⚠️ TEMP / DEV ONLY - This route is not protected. Do not deploy to production without authentication.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              TODO: Protect this route with Supabase Auth and role-based access
            </p>
          </div>

          <div className="space-y-8">
            {/* Navigation Content */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Navigation Content</h2>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Categories:</strong> {navigation.categories.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Top Links:</strong> Journal, Account
                </p>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View Full JSON
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(navigation, null, 2)}
                </pre>
              </details>
            </section>

            {/* Home Content */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Home Content</h2>
              <div className="mb-4 space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>Hero:</strong> {homeContent.hero.title}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Feature Sections:</strong> {homeContent.featureSections.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Grid Sections:</strong> {homeContent.gridSections.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>CTA Section:</strong> {homeContent.ctaSection.title}
                </p>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View Full JSON
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(homeContent, null, 2)}
                </pre>
              </details>
            </section>

            {/* Footer Content */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Footer Content</h2>
              <div className="mb-4 space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>Newsletter:</strong> {footerContent.newsletter.headline}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Explore Links:</strong> {footerContent.explore.links.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Resources Links:</strong> {footerContent.resources.links.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Connect Links:</strong> {footerContent.connect.links.length}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Legal Links:</strong> {footerContent.legal.links.length}
                </p>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  View Full JSON
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(footerContent, null, 2)}
                </pre>
              </details>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async () => {
  // Fetch all content for admin view
  const [navigation, homeContent, footerContent] = await Promise.all([
    getNavigationContent(),
    getHomeContent(),
    getFooterContent(),
  ]);

  return {
    props: {
      navigation,
      homeContent,
      footerContent,
    },
  };
};

