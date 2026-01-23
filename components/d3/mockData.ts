// ============================================================================
// Mock Data Generators for D3 Lab
// ============================================================================

export interface ScoreData {
  value: number;
  label: string;
  delta: number; // positive or negative change
}

export interface TrendPoint {
  date: Date;
  value: number;
}

export interface HeatmapCell {
  day: number; // 0-6 (Sunday-Saturday)
  timeBlock: 'morning' | 'midday' | 'evening';
  intensity: number; // 0-1 (0 = not logged, 0.5 = partial, 1 = logged)
}

/**
 * Generate mock score gauge data
 */
export function generateScoreData(size: 'small' | 'large' = 'small'): ScoreData {
  const baseValue = size === 'small' ? 65 : 72;
  const variance = size === 'small' ? 10 : 15;
  const value = Math.max(0, Math.min(100, baseValue + (Math.random() - 0.5) * variance));
  const delta = (Math.random() - 0.5) * 8; // -4 to +4
  
  return {
    value: Math.round(value),
    label: 'Fine Diet Score',
    delta: Math.round(delta * 10) / 10,
  };
}

/**
 * Generate trend line data for 14 or 30 days
 */
export function generateTrendData(
  days: 14 | 30 = 14,
  size: 'small' | 'large' = 'small'
): TrendPoint[] {
  const data: TrendPoint[] = [];
  const now = new Date();
  const baseValue = size === 'small' ? 60 : 70;
  const variance = size === 'small' ? 15 : 20;
  
  // Start from days ago
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Add some realistic trend with noise
    const trend = (days - i) / days * 10; // gradual improvement
    const noise = (Math.random() - 0.5) * variance;
    const value = Math.max(0, Math.min(100, baseValue + trend + noise));
    
    // Randomly skip some days (10% chance) to simulate missing data
    if (Math.random() > 0.1) {
      data.push({
        date,
        value: Math.round(value * 10) / 10,
      });
    }
  }
  
  return data;
}

/**
 * Generate heatmap data for 7 days x 3 time blocks
 */
export function generateHeatmapData(
  size: 'small' | 'large' = 'small'
): HeatmapCell[] {
  const data: HeatmapCell[] = [];
  const timeBlocks: Array<'morning' | 'midday' | 'evening'> = ['morning', 'midday', 'evening'];
  
  // Higher consistency for 'large' size
  const consistencyRate = size === 'small' ? 0.6 : 0.8;
  
  for (let day = 0; day < 7; day++) {
    for (const timeBlock of timeBlocks) {
      const rand = Math.random();
      let intensity: number;
      
      if (rand < consistencyRate) {
        // Logged
        intensity = 1;
      } else if (rand < consistencyRate + 0.15) {
        // Partial
        intensity = 0.5;
      } else {
        // Not logged
        intensity = 0;
      }
      
      data.push({
        day,
        timeBlock,
        intensity,
      });
    }
  }
  
  return data;
}

/**
 * Get day name from day index (0 = Sunday)
 */
export function getDayName(dayIndex: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex];
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
