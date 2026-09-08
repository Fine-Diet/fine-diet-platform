'use client';

/**
 * Food Home — live-wired canonical route
 * (FD-PLATFORM:app-section-homes-release-v1).
 *
 * Authenticated live reads load Haul collection + List readiness truth.
 * Development-only preview data stays on /dev/food-home.
 */

import { FoodHomeView } from '@/components/food/home/FoodHomeView';

export default function FoodHomePage() {
  return <FoodHomeView />;
}
