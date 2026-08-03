'use client';

/**
 * Plans Home — live-wired canonical route
 * (FD-PLATFORM:app-section-homes-release-v1).
 *
 * Meal Guidance, planning route rail, and Pantry Readiness from current plan
 * + schedule + pantry readiness services. Fixtures stay on /dev/plans-home.
 */

import { PlansHomeView } from '@/components/plans/home/PlansHomeView';

export default function PlansHomePage() {
  return <PlansHomeView />;
}
