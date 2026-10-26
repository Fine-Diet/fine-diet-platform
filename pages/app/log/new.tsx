import { useRouter } from 'next/router';
import LogNutritionDraftPage from '@/components/journal/log/LogNutritionDraftPage';
import { LogEntryCapturePage } from '@/components/journal/log/LogEntryCapturePage';

/** Keep the canonical food draft route intact and dispatch supported tracker tabs to their capture forms. */
export default function NewLogRoute() {
  const router = useRouter();
  if (!router.isReady) {
    return <main className="mx-auto w-full max-w-2xl px-5 py-12 text-brand-50" aria-live="polite">Loading Log…</main>;
  }

  const hasTab = Object.prototype.hasOwnProperty.call(router.query, 'tab');
  const tab = typeof router.query.tab === 'string' ? router.query.tab : null;

  if (!hasTab || tab === 'food') return <LogNutritionDraftPage />;
  const routeContextKey = JSON.stringify([router.query.tab, router.query.date, router.query.time, router.query.block]);
  return <LogEntryCapturePage key={routeContextKey} tab={tab ?? ''} />;
}
