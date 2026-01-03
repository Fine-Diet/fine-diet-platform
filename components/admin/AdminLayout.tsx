/**
 * Admin Layout Component
 * 
 * Wrapper for all admin pages that excludes public site header/footer.
 * Provides consistent styling and optional admin header bar.
 */

import Link from 'next/link';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      {/* Simple Admin Header Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/admin"
            className="text-lg font-semibold text-gray-900 hover:text-gray-700"
          >
            Fine Diet Admin
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            View Site →
          </Link>
        </div>
      </div>
      
      {/* Page Content */}
      <div className="bg-gray-50 min-h-screen">
        {children}
      </div>
    </>
  );
}
