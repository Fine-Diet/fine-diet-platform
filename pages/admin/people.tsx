/**
 * Admin Page: Team & Roles Management
 * 
 * Admin-only page for managing user roles (promote/demote users).
 * Protected by middleware and SSR guard.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrentUserWithRoleFromSSR, type AuthenticatedUser, type UserRole } from '@/lib/authServer';

interface AdminPeopleProps {
  user: AuthenticatedUser | null;
}

interface ProfileSummary {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export default function AdminPeople({ user }: AdminPeopleProps) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  // Fetch profiles on mount
  useEffect(() => {
    async function fetchProfiles() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/admin/people');
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch profiles');
        }

        const data = await response.json();
        setProfiles(data.profiles || []);
      } catch (err) {
        console.error('Error fetching profiles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
      } finally {
        setLoading(false);
      }
    }

    fetchProfiles();
  }, []);

  // Handle role change
  async function handleRoleChange(profileId: string, newRole: UserRole) {
    // Optimistic update
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
    );
    setUpdating((prev) => new Set(prev).add(profileId));

    try {
      const response = await fetch('/api/admin/people', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: profileId, role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      const data = await response.json();
      // Update with server response
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? data.profile : p))
      );
    } catch (err) {
      console.error('Error updating role:', err);
      // Revert optimistic update
      const originalProfile = profiles.find((p) => p.id === profileId);
      if (originalProfile) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profileId ? originalProfile : p))
        );
      }
      alert(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  }

  // Defensive check - middleware should have already blocked non-admin users
  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Team & Roles • Fine Diet</title>
        </Head>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-lg text-gray-600 mb-8">
              You don't have permission to access this area. Only administrators can manage user roles.
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

  const isSelf = (profileId: string) => profileId === user.id;
  const validRoles: UserRole[] = ['user', 'editor', 'admin'];

  return (
    <>
      <Head>
        <title>Team & Roles • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Team & Roles</h1>
                <p className="text-lg text-gray-600">
                  Manage who can edit content in Fine Diet.
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

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-600">Loading profiles...</p>
            </div>
          ) : (
            /* Profiles Table */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Change Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                          No profiles found.
                        </td>
                      </tr>
                    ) : (
                      profiles.map((profile) => {
                        const isUpdating = updating.has(profile.id);
                        const isCurrentUser = isSelf(profile.id);
                        const createdDate = new Date(profile.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        });

                        return (
                          <tr key={profile.id} className={isCurrentUser ? 'bg-blue-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {profile.email}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-blue-600 font-normal">(You)</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  profile.role === 'admin'
                                    ? 'bg-purple-100 text-purple-800'
                                    : profile.role === 'editor'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {profile.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {createdDate}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <select
                                value={profile.role}
                                onChange={(e) => {
                                  const newRole = e.target.value as UserRole;
                                  // Optional: warn if demoting self below admin
                                  if (isCurrentUser && profile.role === 'admin' && newRole !== 'admin') {
                                    if (
                                      !confirm(
                                        'Warning: You are about to demote yourself from admin. You may lose access to this page. Continue?'
                                      )
                                    ) {
                                      return;
                                    }
                                  }
                                  handleRoleChange(profile.id, newRole);
                                }}
                                disabled={isUpdating}
                                className={`text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${
                                  isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                                } ${isCurrentUser ? 'bg-blue-50' : ''}`}
                              >
                                {validRoles.map((role) => (
                                  <option key={role} value={role}>
                                    {role}
                                  </option>
                                ))}
                              </select>
                              {isUpdating && (
                                <span className="ml-2 text-xs text-gray-500">Updating...</span>
                              )}
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
              <strong>Note:</strong> Role changes take effect immediately. Users with the 'editor' or 'admin' role can access CMS content pages. Only administrators can manage roles.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<AdminPeopleProps> = async (context) => {
  // Get the current user with their role
  const user = await getCurrentUserWithRoleFromSSR(context);

  // Note: Middleware should have already blocked non-admin users,
  // but we still check here for defensive programming
  if (!user || user.role !== 'admin') {
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

