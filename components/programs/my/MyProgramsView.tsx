'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  buildMyProgramsViewModel,
  MY_PROGRAMS_GROUPS,
  runtimeSliceFromSummary,
  type MyProgramCardModel,
  type MyProgramsGroupId,
} from '@/lib/programs/myProgramsGrouping';
import type { ProgramLibrary } from '@/lib/programs/programLibraryServerService';
import { indexDisplayRuntimeSummariesBySlug } from '@/lib/programs/runtimeUi';
import type { ProgramRuntimeSummaryList } from '@/lib/programs/runtimeTypes';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type LoadState = 'loading' | 'ready' | 'error';

function formatStartDate(isoDate: string): string {
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function ProgramCard({ card }: { card: MyProgramCardModel }) {
  const startLabel = card.startDate ? `Starts ${formatStartDate(card.startDate)}` : null;

  return (
    <Link
      href={card.href}
      className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-5 py-4 transition-colors hover:bg-white/[0.07]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
        {card.statusLabel}
      </p>
      <h3 className="mt-1 text-xl tracking-tight">{card.title}</h3>
      {card.tagline ? (
        <p className="mt-1 text-sm leading-6 text-white/60">{card.tagline}</p>
      ) : null}
      {card.progressDetail ? (
        <p className="mt-3 text-sm text-white/80">{card.progressDetail}</p>
      ) : null}
      {startLabel ? (
        <p className="mt-3 text-sm text-white/80">{startLabel}</p>
      ) : null}
      {card.note ? (
        <p className="mt-2 text-sm leading-6 text-white/55">{card.note}</p>
      ) : null}
    </Link>
  );
}

export function MyProgramsView() {
  const [library, setLibrary] = useState<ProgramLibrary | null>(null);
  const [runtime, setRuntime] = useState<ProgramRuntimeSummaryList | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const [runtimeResponse, libraryResponse] = await Promise.all([
        fetch('/api/journal/programs/runtime-summary', { credentials: 'include' }),
        fetch('/api/journal/programs/library', { credentials: 'include' }),
      ]);

      if (!runtimeResponse.ok) {
        const body = await runtimeResponse.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load program runtime.');
      }
      if (!libraryResponse.ok) {
        const body = await libraryResponse.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load program access.');
      }

      const [runtimeBody, libraryBody] = await Promise.all([
        runtimeResponse.json() as Promise<ProgramRuntimeSummaryList>,
        libraryResponse.json() as Promise<ProgramLibrary>,
      ]);
      setRuntime(runtimeBody);
      setLibrary(libraryBody);
      setLoadState('ready');
    } catch (error) {
      setLibrary(null);
      setRuntime(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load programs.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    const summaries = indexDisplayRuntimeSummariesBySlug(runtime?.summaries ?? []);
    const runtimes: ReturnType<typeof runtimeSliceFromSummary>[] = [];
    summaries.forEach((summary) => {
      runtimes.push(runtimeSliceFromSummary(summary));
    });
    return buildMyProgramsViewModel({
      entries: library?.entries ?? [],
      runtimes,
      availability: library?.availability ?? [],
    });
  }, [library, runtime]);

  const cardsByGroup = useMemo(() => {
    const grouped: Record<MyProgramsGroupId, MyProgramCardModel[]> = {
      current: [],
      ready_to_start: [],
      completed: [],
    };
    for (const card of cards) grouped[card.group].push(card);
    return grouped;
  }, [cards]);

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden bg-[#463c2f] pb-28">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[950px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
            <header className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Programs
              </p>
              <h1 className="mt-3 text-4xl font-regular tracking-tight sm:text-5xl">My Programs</h1>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
                Programs you have access to, or have already started.
              </p>
            </header>

            {loadState === 'error' ? (
              <div className="rounded-[1.75rem] border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
                <p className="font-semibold">My Programs could not load.</p>
                <p className="mt-1 text-red-100/80">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 rounded-full border border-red-100/30 px-3 py-1.5 text-xs font-semibold text-red-50"
                >
                  Try again
                </button>
              </div>
            ) : (
              MY_PROGRAMS_GROUPS.map((group) => {
                const groupCards = cardsByGroup[group.id];
                return (
                  <section
                    key={group.id}
                    aria-labelledby={`my-programs-${group.id}`}
                    className="border-t border-white/15 py-8"
                  >
                    <h2 id={`my-programs-${group.id}`} className="text-2xl tracking-tight">
                      {group.title}
                    </h2>
                    {loadState === 'loading' ? (
                      <p className="mt-4 text-sm text-white/55">Loading…</p>
                    ) : groupCards.length === 0 ? (
                      <p className="mt-4 text-sm text-white/55">{group.emptyLabel}</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {groupCards.map((card) => (
                          <ProgramCard key={card.slug} card={card} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            )}

            {loadState === 'ready' && cards.length === 0 ? (
              <p className="text-sm text-white/55">
                <Link href={APP_ROUTES.programs} className="underline underline-offset-4">
                  Explore programs
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </main>
      <JournalFooterNav />
    </div>
  );
}
