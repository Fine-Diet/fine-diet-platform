'use client';

/**
 * Dev-only Plans Home presentation preview.
 * Canonical review surface remains /app/plans (signed-in shell).
 * Footer nav is hidden so it does not obscure prototype comparison.
 */

import { AppShell } from '@/components/journal/AppShell';
import { PlansHomeView } from '@/components/plans/home/PlansHomeView';

export default function DevPlansHomePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="min-h-screen bg-[#16110d] p-8 text-white">
        <p>Plans Home preview is available in development only.</p>
      </main>
    );
  }

  return (
    <AppShell>
      <PlansHomeView hideFooter />
    </AppShell>
  );
}
