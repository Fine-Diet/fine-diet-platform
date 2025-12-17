/**
 * Analytics Event Tracking for Assessments
 * 
 * Emits client-side events for tracking assessment behavior
 * Batches events and sends to API endpoint (best-effort, non-blocking)
 */

import type { AssessmentEvent, AssessmentType, AvatarId } from './assessmentTypes';

// ============================================================================
// Event Types
// ============================================================================

export type AssessmentEventType =
  | 'assessment_started'
  | 'assessment_completed'
  | 'assessment_abandoned'
  | 'results_viewed'
  | 'results_scrolled'
  | 'method_vsl_clicked'
  | 'email_captured';

// ============================================================================
// Event Queue
// ============================================================================

interface QueuedEvent {
  assessmentType: AssessmentType;
  assessmentVersion: number;
  sessionId: string;
  eventType: AssessmentEventType;
  primaryAvatar?: AvatarId;
  metadata?: Record<string, unknown>;
}

const eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 2000; // Flush every 2 seconds
const MAX_BATCH_SIZE = 10; // Max events per batch

/**
 * Flush queued events to API (best-effort, non-blocking)
 */
function flushEvents(): void {
  if (eventQueue.length === 0) return;

  const eventsToSend = eventQueue.splice(0, MAX_BATCH_SIZE);

  // Send to API (best-effort, don't await)
  fetch('/api/assessments/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: eventsToSend }),
  }).catch((error) => {
    console.error('Error sending events (non-blocking):', error);
    // Re-queue events on failure (up to a limit)
    if (eventQueue.length < 50) {
      eventQueue.unshift(...eventsToSend);
    }
  });
}

/**
 * Schedule event flush
 */
function scheduleFlush(): void {
  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushEvents();
    flushTimer = null;
    
    // Schedule next flush if queue is not empty
    if (eventQueue.length > 0) {
      scheduleFlush();
    }
  }, FLUSH_INTERVAL);
}

// ============================================================================
// Event Emission
// ============================================================================

/**
 * Emit an assessment event
 * Queues event for batch sending (best-effort, non-blocking)
 */
export function emitAssessmentEvent(
  eventType: AssessmentEventType,
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar?: AvatarId,
  metadata?: Record<string, unknown>
): void {
  const event: AssessmentEvent = {
    event: eventType,
    assessmentType,
    assessmentVersion,
    sessionId,
    primaryAvatar,
    timestamp: Date.now(),
    metadata,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Assessment Event]', event);
  }

  // Queue event for batch sending
  eventQueue.push({
    assessmentType,
    assessmentVersion,
    sessionId,
    eventType,
    primaryAvatar,
    metadata,
  });

  // Schedule flush if not already scheduled
  scheduleFlush();

  // Flush immediately if queue is full
  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function trackAssessmentStarted(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string
): void {
  emitAssessmentEvent('assessment_started', assessmentType, assessmentVersion, sessionId);
}

export function trackAssessmentCompleted(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar: AvatarId
): void {
  emitAssessmentEvent('assessment_completed', assessmentType, assessmentVersion, sessionId, primaryAvatar);
}

export function trackAssessmentAbandoned(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  lastQuestionIndex: number
): void {
  emitAssessmentEvent(
    'assessment_abandoned',
    assessmentType,
    assessmentVersion,
    sessionId,
    undefined,
    { lastQuestionIndex }
  );
}

export function trackResultsViewed(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar: AvatarId
): void {
  emitAssessmentEvent('results_viewed', assessmentType, assessmentVersion, sessionId, primaryAvatar);
}

export function trackResultsScrolled(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar: AvatarId
): void {
  emitAssessmentEvent('results_scrolled', assessmentType, assessmentVersion, sessionId, primaryAvatar);
}

export function trackMethodVslClicked(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar: AvatarId,
  vslUrl?: string
): void {
  emitAssessmentEvent(
    'method_vsl_clicked',
    assessmentType,
    assessmentVersion,
    sessionId,
    primaryAvatar,
    { vslUrl }
  );
}

export function trackEmailCaptured(
  assessmentType: AssessmentType,
  assessmentVersion: number,
  sessionId: string,
  primaryAvatar: AvatarId,
  email: string
): void {
  emitAssessmentEvent(
    'email_captured',
    assessmentType,
    assessmentVersion,
    sessionId,
    primaryAvatar,
    { email }
  );
}

