import { useRouter } from 'next/router';

import HaulBuilder from '@/components/food/hauls/HaulBuilder';

export default function GroceryHaulDetailPage() {
  const router = useRouter();
  const haulId = typeof router.query.haulId === 'string' ? router.query.haulId : null;

  if (!haulId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#16110d] text-sm text-white/50">
        Loading Haul…
      </div>
    );
  }

  return <HaulBuilder haulId={haulId} />;
}
