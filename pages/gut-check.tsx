/**
 * Gut Check Assessment Page
 * 
 * Route: /gut-check
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { AssessmentRoot } from '@/components/assessments/AssessmentRoot';
import { getOrCreateSessionId } from '@/lib/assessmentSession';

interface GutCheckPageProps {
  initialVersion: number;
}

export default function GutCheckPage({ initialVersion }: GutCheckPageProps) {
  const router = useRouter();

  useEffect(() => {
    const sessionId = getOrCreateSessionId();

    // Create/update session with correct version using API endpoint
    // The API handles upserts correctly based on (session_id, assessment_type, assessment_version)
    // Send both field names for compatibility
    fetch('/api/assessments/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentType: 'gut-check',
        assessmentVersion: initialVersion,
        assessment_version: initialVersion, // Also send snake_case for compatibility
        sessionId,
        status: 'started',
        lastQuestionIndex: 0,
      }),
    }).catch((error) => {
      console.error('Error creating/updating session:', error);
      // Don't block UI - just log
    });
  }, [initialVersion]);

  return (
    <>
      <Head>
        <title>Gut Check Assessment • Fine Diet</title>
        <meta
          name="description"
          content="Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method."
        />
      </Head>
      <AssessmentRoot assessmentType="gut-check" initialVersion={initialVersion} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GutCheckPageProps> = async (context) => {
  // Robustly parse version from query param (handle string | string[] | undefined)
  const v = context.query.v;
  let initialVersion = 1;
  
  if (v) {
    const vStr = Array.isArray(v) ? v[0] : v;
    if (vStr === '2' || vStr === 'v2') {
      initialVersion = 2;
    }
  }

  return {
    props: {
      initialVersion,
    },
  };
};

