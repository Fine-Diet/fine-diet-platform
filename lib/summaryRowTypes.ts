/**
 * Summary Row Module — JSON contract for app summary cards.
 *
 * Hierarchy (maps 1-to-1 with GridItemApp UI):
 *   1. Header: title, subtitle (opt), status chip
 *   2. Primary value: value + unit, note (opt)
 *   3. Supporting metrics (max 2): label · value
 *   4. Insight (opt): 1-sentence helper text
 *   5. Actions: cta (primary), drilldown (chevron)
 *   6. Empty state: if empty.isEmpty, render empty.* instead of primary/metrics
 */

export type StatusLevel = 'ok' | 'warn' | 'error';
export type MetricStyle = 'progress' | 'timestamp' | 'number' | 'text';
export type InsightConfidence = 'low' | 'med' | 'high';

export interface SummaryRowStatus {
  label: string;
  level: StatusLevel;
  reason?: string;
}

export interface SummaryRowPrimary {
  value: number | string;
  unit: string | null;
  note?: string;
}

export interface SummaryRowMetric {
  label: string;
  value: number | string;
  unit: string | null;
  style?: MetricStyle;
}

export interface SummaryRowInsight {
  text: string;
  confidence?: InsightConfidence;
}

export interface SummaryRowCTA {
  label: string;
  href: string;
}

export interface SummaryRowEmpty {
  isEmpty: boolean;
  headline?: string;
  body?: string;
  cta?: SummaryRowCTA;
}

export interface SummaryRowModule {
  id: string;
  variant: 'summary_row';
  title: string;
  subtitle?: string;
  image?: string;
  status?: SummaryRowStatus;
  primary?: SummaryRowPrimary;
  metrics?: SummaryRowMetric[];
  insight?: SummaryRowInsight;
  cta?: SummaryRowCTA;
  empty?: SummaryRowEmpty;
  drilldown?: SummaryRowCTA;
}
