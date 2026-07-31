'use client';

/**
 * Dev-only Programs Home presentation preview.
 * Canonical review surface remains /app/programs (signed-in shell).
 * Footer nav is hidden so it does not obscure prototype comparison.
 */

import { AppShell } from '@/components/journal/AppShell';
import { ProgramsHomeView } from '@/components/programs/home/ProgramsHomeView';

export default function DevProgramsHomePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="min-h-screen bg-[#16110d] p-8 text-white">
        <p>Programs Home preview is available in development only.</p>
      </main>
    );
  }

  return (
    <AppShell>
      <ProgramsHomeView hideFooter preferFixtures />
    </AppShell>
  );
}
