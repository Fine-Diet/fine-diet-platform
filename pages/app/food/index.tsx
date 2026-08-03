'use client';

/**
 * Food Home — live-wired canonical route
 * (FD-PLATFORM:app-section-homes-release-v1).
 *
 * Authenticated live adapters load plan + grocery readiness. Fixtures stay on
 * /dev/food-home only.
 */

import { FoodHomeView } from '@/components/food/home/FoodHomeView';

export default function FoodHomePage() {
  return <FoodHomeView />;
}
