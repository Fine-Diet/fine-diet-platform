'use client';

import { cn } from '@/lib/utils';

export function SelectionCircle({
  checked,
  completed,
  disabled,
  className,
}: {
  checked?: boolean;
  completed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  if (completed) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25 text-white',
          className,
        )}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (checked) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4E8BE0] text-white',
          className,
        )}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/55',
        disabled && 'opacity-40',
        className,
      )}
    />
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M3.5 8.2 6.4 11l6.1-6.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
