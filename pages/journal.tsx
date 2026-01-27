'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import type { TimeBlock } from '@/lib/journal';

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today';
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}

function isToday(date: Date): boolean {
  const today = new Date();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dateOnly.getTime() === todayOnly.getTime();
}

export default function JournalPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mealCreatedBanner, setMealCreatedBanner] = useState(false);
  const redirect = '/journal';

  // Placeholder score - would come from calculated data
  const nutritionScore = 85;

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

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (newDate <= today) {
      setSelectedDate(newDate);
    }
  };

  return (
    <div className="min-h-screen bg-brand-900 text-white pb-24">
      {/* Hero section with background image, date nav, and score gauge */}
      <JournalHeroSection
        score={nutritionScore}
        dateLabel={formatDateLabel(selectedDate)}
        onPrevDay={handlePrevDay}
        onNextDay={handleNextDay}
        canGoNext={!isToday(selectedDate)}
      />

      {/* Main content */}
      <main className="relative px-4 py-6 max-w-[1200px] mx-auto">
        {mealCreatedBanner && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-dark_accent-500/20 text-dark_accent-200 text-sm">
            Meal saved.
          </div>
        )}

        {/* Morning / Midday / Evening blocks */}
        <section className="space-y-3">
          {(['morning', 'midday', 'evening'] as TimeBlock[]).map((block, index) => (
            <JournalBlockSection
              key={block}
              block={block}
              date={selectedDate}
              redirect={redirect}
              defaultExpanded={index === 0} // Morning expanded by default
            />
          ))}
        </section>
      </main>

      {/* Footer Navigation */}
      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
