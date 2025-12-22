/**
 * Gut Check Assessment Page
 * 
 * Route: /gut-check
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { getOrCreateSessionId } from '@/lib/assessmentSession';

export default function GutCheckPage() {
  const router = useRouter();
  
  // Determine requested version from query param (default to 1)
  // Only evaluate when router is ready to avoid race conditions
  const requestedVersion = router.isReady
    ? (router.query.v === '2' || router.query.v === 'v2' ? 2 : 1)
    : 1;

  useEffect(() => {
    // Wait for router to be ready before creating session
    // This ensures query params are available
    if (!router.isReady) return;

    const sessionId = getOrCreateSessionId();

    // Create/update session with correct version using API endpoint
    // The API handles upserts correctly based on (session_id, assessment_type, assessment_version)
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: 'gut-check',
        assessmentVersion: requestedVersion,
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
      }),
    }).catch((error) => {
      console.error('Error creating/updating session:', error);
      // Don't block UI - just log
    });
  }, [router.isReady, requestedVersion]);

  return (
    <>
      <Head>
        <title>Gut Check Assessment • Fine Diet</title>
        <meta
          name="description"
          content="Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method."
        />
      </Head>
      <AssessmentRoot assessmentType="gut-check" />
    </>
  );
}

