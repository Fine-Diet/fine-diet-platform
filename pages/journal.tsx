'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalDateSelector } from '@/components/journal/JournalDateSelector';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import type { TimeBlock } from '@/lib/journal';

export default function JournalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mealCreatedBanner, setMealCreatedBanner] = useState(false);
  const redirect = '/journal';

  useEffect(() => {
    if (!router.isReady) return;
    const q = (router.query ?? {}) as Record<string, string | undefined>;
    if (q.meal_created === '1') {
      setMealCreatedBanner(true);
      const t = setTimeout(() => setMealCreatedBanner(false), 4000);
      router.replace('/journal', undefined, { shallow: true });
      return () => clearTimeout(t);
    }
  }, [router.isReady, router.query?.meal_created]);

  return (
    <div className="min-h-screen bg-brand-900 text-white pb-24 max-w-[1200px] mx-auto relative">
      <JournalDateSelector
        initialDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      <main className="relative px-6 py-6 z-10">
        {mealCreatedBanner && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-dark_accent-500/20 text-dark_accent-200 text-sm">
            Meal saved.
          </div>
        )}
        {/* Score hero — placeholder, display-only */}
        <section className="mb-8 text-center">
          <div className="text-7xl font-regular text-white mb-1">—</div>
          <div className="text-white/80 text-base">Nutrition Density</div>
        </section>

        {/* Morning / Midday / Evening blocks */}
        <section className="space-y-4 mb-8">
          {(['morning', 'midday', 'evening'] as TimeBlock[]).map((block) => (
            <JournalBlockSection
              key={block}
              block={block}
              date={selectedDate}
              redirect={redirect}
            />
          ))}
        </section>

        {/* Summary — placeholder */}
        <section className="mt-8 max-w-[1200px]">
          <div className="text-white/100 font-regular text-2xl mb-2">Summary</div>
          <div className="text-white font-regular text-sm">
            Protein 0g Carbs 0g Fat 0g
          </div>
        </section>
      </main>

      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
