import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/router';

export const LOG_SUMMARY_SECTION_ID = 'daily-summary';

export function LogSummaryAnchor({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || router.query.section !== 'summary') return;
    document.getElementById(LOG_SUMMARY_SECTION_ID)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [router.isReady, router.query.section]);

  return <div id={LOG_SUMMARY_SECTION_ID} className="scroll-mt-6">{children}</div>;
}
