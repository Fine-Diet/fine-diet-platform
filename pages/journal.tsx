'use client';

import { useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { NotebookIcon } from '@/components/icons';

// Placeholder journal entry data
const journalEntries = [
  {
    id: '1',
    date: 'Today',
    time: '8:32 AM',
    title: 'Morning Check-in',
    excerpt: 'Feeling energized after a good night of sleep. Ready to tackle the day...',
    mood: 'energized',
  },
  {
    id: '2',
    date: 'Yesterday',
    time: '7:15 PM',
    title: 'Evening Reflection',
    excerpt: 'Had a productive day. Noticed some tension in my shoulders after lunch...',
    mood: 'calm',
  },
  {
    id: '3',
    date: 'Jan 20',
    time: '12:45 PM',
    title: 'Midday Note',
    excerpt: 'Tried the new breathing exercise. Felt more centered afterwards...',
    mood: 'focused',
  },
];

const moodColors: Record<string, string> = {
  energized: 'bg-core_data-metabolic_rhythm',
  calm: 'bg-core_data-emotional_regulation',
  focused: 'bg-core_data-nutrient_density',
};

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState('journal');

  return (
    <div className="min-h-screen bg-brand-900 text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-brand-900/95 backdrop-blur-sm border-b border-brand-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Journal</h1>
              <p className="text-sm text-brand-100 mt-0.5">Your daily reflections</p>
            </div>
            <button className="p-2 rounded-full bg-dark_accent-700 text-white hover:bg-dark_accent-900 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-6">
        {/* Quick Stats */}
        <section className="mb-8">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-brand-700 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-dark_accent-500">12</p>
              <p className="text-xs text-brand-100 mt-1">This Week</p>
            </div>
            <div className="bg-brand-700 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-dark_accent-500">5</p>
              <p className="text-xs text-brand-100 mt-1">Day Streak</p>
            </div>
            <div className="bg-brand-700 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-dark_accent-500">47</p>
              <p className="text-xs text-brand-100 mt-1">Total Entries</p>
            </div>
          </div>
        </section>

        {/* Recent Entries */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Entries</h2>
            <button className="text-sm text-dark_accent-500 hover:text-dark_accent-300 transition-colors">
              View All
            </button>
          </div>

          <div className="space-y-3">
            {journalEntries.map((entry) => (
              <article 
                key={entry.id}
                className="bg-brand-800 rounded-2xl p-4 hover:bg-brand-700 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {/* Mood indicator */}
                  <div className={`w-2 h-2 rounded-full mt-2 ${moodColors[entry.mood]}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-white truncate">{entry.title}</h3>
                      <span className="text-xs text-brand-200 ml-2 flex-shrink-0">{entry.time}</span>
                    </div>
                    <p className="text-sm text-brand-100 line-clamp-2">{entry.excerpt}</p>
                    <p className="text-xs text-brand-300 mt-2">{entry.date}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Empty State (hidden when entries exist) */}
        {journalEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-700 flex items-center justify-center mb-4">
              <NotebookIcon className="w-8 h-8 text-brand-300" />
            </div>
            <h3 className="text-lg font-medium mb-2">No entries yet</h3>
            <p className="text-sm text-brand-200 max-w-xs">
              Start your journaling journey by tapping the + button above.
            </p>
          </div>
        )}

        {/* Prompts Section */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Prompts</h2>
          <div className="space-y-3">
            <div className="bg-gradient-to-r from-core_data-emotional_regulation/20 to-transparent rounded-2xl p-4 border border-core_data-emotional_regulation/30">
              <p className="text-sm text-brand-50">
                &quot;What&apos;s one thing you&apos;re grateful for today?&quot;
              </p>
              <button className="mt-3 text-xs font-medium text-dark_accent-500 hover:text-dark_accent-300 transition-colors">
                Start Writing →
              </button>
            </div>
            <div className="bg-gradient-to-r from-core_data-metabolic_rhythm/20 to-transparent rounded-2xl p-4 border border-core_data-metabolic_rhythm/30">
              <p className="text-sm text-brand-50">
                &quot;How did your body feel after your last meal?&quot;
              </p>
              <button className="mt-3 text-xs font-medium text-dark_accent-500 hover:text-dark_accent-300 transition-colors">
                Start Writing →
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Navigation */}
      <JournalFooterNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
