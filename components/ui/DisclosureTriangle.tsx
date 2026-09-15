import { cn } from '@/lib/utils';

export function DisclosureTriangle({
  expanded = false,
  inactive = false,
  className,
}: {
  expanded?: boolean;
  inactive?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 12"
      className={cn(
        'h-2.5 w-2.5 shrink-0 fill-current transition-transform',
        expanded && 'rotate-90',
        inactive ? 'text-white/20' : 'text-white/55',
        className,
      )}
    >
      <path d="M2 1 9 6 2 11Z" />
    </svg>
  );
}
