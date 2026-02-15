'use client';

import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';

export default function JournalProfilePage() {
  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {/* Content area — vertically centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <h1 className="text-2xl font-semibold antialiased mb-2">Profile</h1>
        <p className="text-sm text-white/60 antialiased mb-6">Coming soon</p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/journal"
            className="text-sm text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
          >
            Go to Journal
          </Link>
          <Link
            href="/account"
            className="text-sm text-white/50 hover:text-white/70 transition-colors antialiased"
          >
            Account &amp; Subscriptions
          </Link>
        </div>
      </div>

      {/* Footer Navigation */}
      <JournalFooterNav />
    </div>
  );
}
