import { useRouter } from 'next/router';

import HaulShoppingView from '@/components/food/hauls/HaulShoppingView';

export default function GroceryHaulShopPage() {
  const router = useRouter();
  const haulId = typeof router.query.haulId === 'string' ? router.query.haulId : null;

  if (!haulId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#16110d] text-sm text-white/50">
        Loading Shopping View…
      </div>
    );
  }

  return <HaulShoppingView haulId={haulId} />;
}
