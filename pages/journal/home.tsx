'use client';

import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';

export default function JournalHomePage() {
  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      {/* Content area — vertically centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <h1 className="text-2xl font-semibold antialiased mb-2">Home</h1>
        <p className="text-sm text-white/60 antialiased mb-6">Coming soon</p>
        <Link
          href="/journal"
          className="text-sm text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
        >
          Go to Journal
        </Link>
      </div>

      {/* Footer Navigation */}
      <JournalFooterNav />
    </div>
  );
}
