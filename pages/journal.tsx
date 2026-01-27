'use client';

import { useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { JournalDateSelector } from '@/components/journal/JournalDateSelector';
import { MealSection } from '@/components/journal/MealSection';

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedDate, setSelectedDate] = useState(new Date());

  return (
    <div className="min-h-screen bg-brand-900 text-white pb-24 max-w-[1200px] mx-auto relative">
      {/* Date Selector Header - top layer */}
      <JournalDateSelector 
        initialDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Main Content - middle layer */}
      <main className="relative px-6 py-6 z-10">
        {/* Nutrition Density Score */}
        <section className="mb-8 text-center">
          <div className="text-7xl font-regular text-white mb-1">85</div>
          <div className="text-white/80 text-base">Nutrition Density</div>
        </section>

        {/* Meal Sections */}
        <section className="space-y-4 mb-8">
          <MealSection
            title="Breakfast"
            actionLabel="+ / edit"
            actionIcon="edit"
            isTranslucent={true}
            foodItems={[
              { id: '1', name: 'French Fries - Sm' },
              { id: '2', name: 'Cheeseburger (' },
              { id: '3', name: 'Diet Coke' },
            ]}
          />
          <MealSection
            title="Lunch"
            actionIcon="plus"
          />
          <MealSection
            title="Dinner"
            actionIcon="plus"
          />
          <MealSection
            title="Snack"
            actionIcon="arrow"
          />
        </section>

        {/* Summary Section */}
        <section className="mt-8 max-w-[1200px]">
          <div className="text-white/100 font-regular text-2xl mb-2">Summary</div>
          <div className="text-white font-regular text-sm">
            Protein 0g Carbs 0g Fat 0g
          </div>
        </section>
      </main>

      {/* Footer Navigation */}
      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
