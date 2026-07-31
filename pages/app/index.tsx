'use client';

/**
 * Main App Home — presentation-ready first pass
 * (FD-PLATFORM:app-home-presentation-v1).
 *
 * Canonical signed-in Home at /app. Replaces the journal Home re-export
 * for this route only; /journal/home remains available for compatibility.
 */

import { AppHomeView } from '@/components/app/home/AppHomeView';

export default function AppHomePage() {
  return <AppHomeView />;
}
