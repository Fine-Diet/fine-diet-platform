/**
 * Shared types for the assessment results screen and its extracted hooks.
 *
 * These were previously declared inline inside `components/assessments/ResultsScreen.tsx`
 * and duplicated across its subcomponents. Centralizing them gives the data hooks
 * (`useAssessmentSubmissionResult`, `useResultsPackResolution`, …) and the
 * presentational subcomponents a single source of truth, and makes the boundary
 * between data-loading and rendering explicit.
 *
 * NOTE: This type mirrors the shape returned by `GET /api/assessments/submission`
 * (see `pages/api/assessments/submission.ts`). It is deliberately permissive about
 * optional fields because legacy submissions may carry null metadata / no email.
 */

export interface SubmissionData {
  id: string;
  primary_avatar: string;
  secondary_avatar?: string | null;
  score_map: Record<string, number>;
  normalized_score_map: Record<string, number>;
  confidence_score: number;
  assessment_type: string;
  assessment_version: number;
  session_id: string;
  /** Persisted email from the submission row (set via email-capture). */
  email?: string | null;
  /** User id when the submission has been attached to an account (isAttached = !!user_id). */
  user_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Resolved Page 1 content (flow v2 first, legacy fallback).
 * `body` / `snapshotBullets` are arrays; the renderer maps them to paragraphs/list items.
 */
export interface ResultsScreenPage1 {
  headline: string;
  body: string[];
  snapshotTitle: string;
  snapshotBullets: string[];
  meaningTitle: string;
  meaningBody: string;
}

export interface ResultsScreenPage2 {
  headline: string;
  stepBullets: string[];
  videoCtaLabel: string;
  videoAssetUrl: string | null;
  emailHelper?: string;
  pdfHelper?: string;
}

export interface ResultsScreenPage3 {
  problemHeadline: string;
  problemBody: string[];
  tryTitle: string;
  tryBullets: string[];
  tryCloser: string;
  mechanismTitle: string;
  mechanismBodyTop: string;
  mechanismPills: string[];
  mechanismBodyBottom: string;
  methodTitle: string;
  methodBody: string[];
  methodLearnTitle: string;
  methodLearnBullets: string[];
  methodCtaLabel: string;
  methodCtaUrl: string;
  methodEmailLinkLabel: string;
}
