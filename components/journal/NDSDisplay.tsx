/**
 * NDSDisplay - Daily Nutrition Density Score Display Component
 * 
 * Shows the daily NDS score (0-100) with 7 subscore chips.
 * Feature-flagged behind ndsDailyBeta.
 */

'use client';

import { 
  getNDSColorClass, 
  getNDSLabel, 
  SUBSCORE_INFO, 
  getSubscoreColorClass,
  type NDSData,
} from '@/lib/nds/useNDS';

// ============================================================================
// Types
// ============================================================================

interface NDSDisplayProps {
  /** NDS data from API/hook */
  data: NDSData | null;
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string | null;
  /** Compact mode - just score, no subscores */
  compact?: boolean;
  /** Show in header style (horizontal, minimal) */
  headerStyle?: boolean;
}

// ============================================================================
// Subcomponents
// ============================================================================

function SubscoreChip({ 
  label, 
  shortLabel, 
  score 
}: { 
  label: string; 
  shortLabel: string; 
  score: number;
}) {
  return (
    <div 
      className="flex flex-col items-center gap-0.5"
      title={`${label}: ${score.toFixed(1)}/10`}
    >
      <div 
        className={`w-8 h-8 rounded-full ${getSubscoreColorClass(score)} flex items-center justify-center`}
      >
        <span className="text-xs font-bold text-white">{Math.round(score)}</span>
      </div>
      <span className="text-[10px] text-white/70 font-medium">{shortLabel}</span>
    </div>
  );
}

function SubscoreBar({ 
  label, 
  shortLabel, 
  score,
  description,
}: { 
  label: string; 
  shortLabel: string; 
  score: number;
  description: string;
}) {
  const percentage = (score / 10) * 100;
  
  return (
    <div className="flex items-center gap-3" title={description}>
      <span className="text-xs text-white/70 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getSubscoreColorClass(score)} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/90 w-8 text-right font-medium">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NDSDisplay({ 
  data, 
  isLoading, 
  error, 
  compact = false,
  headerStyle = false,
}: NDSDisplayProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${headerStyle ? '' : 'p-4'}`}>
        <div className="w-6 h-6 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
        {!headerStyle && <span className="text-sm text-white/60">Loading NDS...</span>}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`text-sm text-red-400 ${headerStyle ? '' : 'p-4'}`}>
        {headerStyle ? 'NDS Error' : `NDS Error: ${error}`}
      </div>
    );
  }

  // No data
  if (!data) {
    return null;
  }

  const { nds_score_100, subscores_10 } = data;
  const colorClass = getNDSColorClass(nds_score_100);
  const label = getNDSLabel(nds_score_100);

  // Header style - minimal horizontal display
  if (headerStyle) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/60">NDS</span>
        <span className={`text-lg font-bold ${colorClass}`}>
          {Math.round(nds_score_100)}
        </span>
        <span className="text-[10px] text-white/50">/100</span>
      </div>
    );
  }

  // Compact mode - score with small subscore chips
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        {/* Main score */}
        <div className="flex items-baseline gap-1">
          <span className={`text-4xl font-bold ${colorClass}`}>
            {Math.round(nds_score_100)}
          </span>
          <span className="text-sm text-white/50">/100</span>
        </div>
        <span className="text-xs text-white/60">{label}</span>
        
        {/* Subscore chips */}
        <div className="flex items-center gap-2 flex-wrap justify-center mt-2">
          {Object.entries(subscores_10).map(([key, score]) => {
            const info = SUBSCORE_INFO[key as keyof typeof SUBSCORE_INFO];
            return (
              <SubscoreChip
                key={key}
                label={info.label}
                shortLabel={info.shortLabel}
                score={score}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Full display with bars
  return (
    <div className="p-4 space-y-4">
      {/* Header with main score */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/80">Nutrient Density (today)</h3>
          <span className="text-xs text-white/50">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${colorClass}`}>
            {Math.round(nds_score_100)}
          </span>
          <span className="text-sm text-white/50">/100</span>
        </div>
      </div>

      {/* Subscore bars */}
      <div className="space-y-2">
        {Object.entries(subscores_10).map(([key, score]) => {
          const info = SUBSCORE_INFO[key as keyof typeof SUBSCORE_INFO];
          return (
            <SubscoreBar
              key={key}
              label={info.label}
              shortLabel={info.shortLabel}
              score={score}
              description={info.description}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Meal Card Addon - Shows protein score on meal entries
// ============================================================================

interface MealProteinScoreProps {
  proteinScore10: number | null;
  isMainMeal: boolean;
}

export function MealProteinScore({ proteinScore10, isMainMeal }: MealProteinScoreProps) {
  if (proteinScore10 === null) return null;

  return (
    <div className="flex items-center gap-2 mt-2">
      {isMainMeal && (
        <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
          Main Meal
        </span>
      )}
      <span 
        className={`text-[10px] px-1.5 py-0.5 rounded ${getSubscoreColorClass(proteinScore10)}/20 text-white/80`}
        title={`Protein Score: ${proteinScore10.toFixed(1)}/10`}
      >
        PS: {proteinScore10.toFixed(1)}
      </span>
    </div>
  );
}
