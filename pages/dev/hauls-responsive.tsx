/** Development-only renderer. The QA browser supplies API fixtures. */
import { useRouter } from 'next/router';
import { AppShell } from '@/components/journal/AppShell';
import HaulsLibrary from '@/components/food/hauls/HaulsLibrary';
import HaulBuilder from '@/components/food/hauls/HaulBuilder';
import ListsManager from '@/components/food/lists/ListsManager';

export default function HaulsResponsivePreview() {
  const router = useRouter();
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <AppShell>
      {router.query.view === 'lists' ? <ListsManager />
        : router.query.view === 'builder' ? <HaulBuilder haulId="qa-haul" /> : <HaulsLibrary />}
    </AppShell>
  );
}
