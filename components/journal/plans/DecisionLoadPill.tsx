/**
 * DecisionLoadPill — shared red/yellow/green "decision load" cue.
 *
 * Extracted from WeeklyPlanningCommandCenter (Plans) so the same red/yellow/
 * green pill styling can be reused on other surfaces (e.g. Pantry readiness)
 * for a consistent visual language. The class output is byte-identical to the
 * original Plans pill so the Plans week view is unchanged.
 */

export type DecisionLoadTone = 'green' | 'yellow' | 'red' | 'neutral';

export function decisionLoadPillClass(tone: DecisionLoadTone): string {
  switch (tone) {
    case 'green':
      return 'bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30';
    case 'yellow':
      return 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/30';
    case 'red':
      return 'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-500/30';
    default:
      return 'bg-white/10 text-white/80 ring-1 ring-inset ring-white/15';
  }
}

export function decisionLoadDotClass(tone: DecisionLoadTone): string {
  switch (tone) {
    case 'green':
      return 'bg-emerald-400';
    case 'yellow':
      return 'bg-amber-400';
    case 'red':
      return 'bg-rose-500';
    default:
      return 'bg-white/40';
  }
}

export interface DecisionLoadPillProps {
  tone: DecisionLoadTone;
  label: string;
  className?: string;
}

export function DecisionLoadPill({ tone, label, className }: DecisionLoadPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${decisionLoadPillClass(tone)}${className ? ` ${className}` : ''}`}
    >
      <span className={`h-2 w-2 rounded-full ${decisionLoadDotClass(tone)}`} />
      {label}
    </span>
  );
}

export default DecisionLoadPill;
