'use client';

/**
 * Dev-only Main App Home presentation preview.
 * Canonical product route remains /app (not /app/home).
 * Footer nav is hidden for clean prototype comparison.
 */

import { AppShell } from '@/components/journal/AppShell';
import { AppHomeView } from '@/components/app/home/AppHomeView';

export default function DevAppHomePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="min-h-screen bg-[#2a241b] p-8 text-white">
        <p>App Home preview is available in development only.</p>
      </main>
    );
  }

  return (
    <AppShell>
      <AppHomeView hideFooter preferFixtures />
    </AppShell>
  );
}
