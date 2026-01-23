'use client';

import { useState } from 'react';

interface JournalDateSelectorProps {
  initialDate?: Date;
  onDateChange?: (date: Date) => void;
}

export function JournalDateSelector({ 
  initialDate = new Date(),
  onDateChange 
}: JournalDateSelectorProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const formatDateLabel = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Reset time for comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    
    if (dateOnly.getTime() === todayOnly.getTime()) {
      return 'Today';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Yesterday';
    } else {
      // Format as "Mon Jan 23" or similar
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const handlePreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
    onDateChange?.(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    
    // Don't allow navigating to future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (newDate <= today) {
      setSelectedDate(newDate);
      onDateChange?.(newDate);
    }
  };

  const isToday = () => {
    const today = new Date();
    const dateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dateOnly.getTime() === todayOnly.getTime();
  };

  return (
    <header className="sticky top-0 z-30 w-full">
      {/* Backdrop blur layer */}
      <div className="absolute inset-0 backdrop-blur-md" />
      
      {/* Gradient overlay for fade effect */}
      <div 
        className="absolute inset-0 bg-gradient-to-t from-[#2F3032]/0 via-[#2F3032]/50 to-[#2F3032]/100 pointer-events-none"
      />
      
      {/* Content */}
      <div 
        className="relative w-full px-4 py-6 flex items-center justify-center"
      >
        {/* Left Chevron */}
        <button
          onClick={handlePreviousDay}
          className="absolute left-4 p-2 -ml-2 text-[#D0D0D0] hover:text-white transition-colors active:opacity-70"
          aria-label="Previous day"
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Date Label */}
        <h1 
          className="text-lg font-medium text-[#D0D0D0] text-center"
          style={{
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.02em',
          }}
        >
          {formatDateLabel(selectedDate)}
        </h1>

        {/* Right Chevron */}
        <button
          onClick={handleNextDay}
          disabled={isToday()}
          className={`absolute right-4 p-2 -mr-2 text-[#D0D0D0] hover:text-white transition-colors active:opacity-70 ${
            isToday() ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          aria-label="Next day"
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </header>
  );
}
