'use client';

/**
 * Dev-only Food Home presentation preview.
 * Canonical review surface remains /app/food (signed-in shell).
 * This route exists so local screenshots can run without a browser session.
 */

import { AppShell } from '@/components/journal/AppShell';
import { FoodHomeView } from '@/components/food/home/FoodHomeView';

export default function DevFoodHomePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="min-h-screen bg-[#16110d] p-8 text-white">
        <p>Food Home preview is available in development only.</p>
      </main>
    );
  }

  return (
    <AppShell>
      <FoodHomeView />
    </AppShell>
  );
}
