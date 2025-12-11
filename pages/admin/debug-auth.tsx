/**
 * Debug Auth Page
 * 
 * Client-side page that fetches the server's view of the current user's auth status.
 * Useful for debugging authentication and role issues.
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface DebugAuthProps {
  ssrUser: AuthenticatedUser | null;
}

interface DebugAuthResponse {
  user: AuthenticatedUser | null;
  raw: {
    hasSession: boolean;
    profileFound: boolean;
  };
}

export default function DebugAuthPage({ ssrUser }: DebugAuthProps) {
  const [apiData, setApiData] = useState<DebugAuthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAuthStatus() {
      try {
        const response = await fetch('/api/debug/auth');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        setApiData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchAuthStatus();
  }, []);

  return (
    <>
      <Head>
        <title>Debug Auth • Fine Diet Admin</title>
      </Head>
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Debug Auth Status</h1>
          <p className="text-gray-600 mb-8">
            This page shows the server's perspective on your authentication status.
          </p>

          <div className="space-y-6">
            {/* SSR User Status */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                getServerSideProps View
              </h2>
              {ssrUser ? (
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>{' '}
                    <span className="text-green-600 font-semibold">Authenticated</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">ID:</span>{' '}
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm">{ssrUser.id}</code>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email:</span>{' '}
                    <span className="text-gray-900">{ssrUser.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Role:</span>{' '}
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                      {ssrUser.role}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-red-600 font-semibold">
                  Server sees you as logged out (no user from getServerSideProps)
                </div>
              )}
            </section>

            {/* API User Status */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                API Route View (/api/debug/auth)
              </h2>
              {loading ? (
                <div className="text-gray-500">Loading...</div>
              ) : error ? (
                <div className="text-red-600">
                  <span className="font-semibold">Error:</span> {error}
                </div>
              ) : apiData ? (
                <div className="space-y-4">
                  {apiData.user ? (
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium text-gray-700">Status:</span>{' '}
                        <span className="text-green-600 font-semibold">Authenticated</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">ID:</span>{' '}
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          {apiData.user.id}
                        </code>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Email:</span>{' '}
                        <span className="text-gray-900">{apiData.user.email || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Role:</span>{' '}
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                          {apiData.user.role}
                        </span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Has Session:</span>{' '}
                            {apiData.raw.hasSession ? (
                              <span className="text-green-600">✓ Yes</span>
                            ) : (
                              <span className="text-red-600">✗ No</span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium">Profile Found:</span>{' '}
                            {apiData.raw.profileFound ? (
                              <span className="text-green-600">✓ Yes</span>
                            ) : (
                              <span className="text-red-600">✗ No</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-red-600 font-semibold">
                      Server sees you as logged out (no user from API route)
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            {/* Raw JSON */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Raw API Response</h2>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                {loading ? (
                  'Loading...'
                ) : error ? (
                  JSON.stringify({ error }, null, 2)
                ) : apiData ? (
                  JSON.stringify(apiData, null, 2)
                ) : (
                  'No data'
                )}
              </pre>
            </section>

            {/* Navigation */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <a
                href="/admin"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to Admin Dashboard
              </a>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<DebugAuthProps> = async (context) => {
  // Get the current user with their role from SSR
  const user = await getCurrentUserWithRoleFromSSR(context);

  return {
    props: {
      ssrUser: user,
    },
  };
};

