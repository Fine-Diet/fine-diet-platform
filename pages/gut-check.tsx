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
import { supabase } from '@/lib/supabaseClient';

export default function GutCheckPage() {
  // Get version from query param (default to 1)
  const router = useRouter();
  const { v } = router.query;
  const version = v === '2' || v === 'v2' ? 2 : 1;

  useEffect(() => {
    // Create or update session on page load
    const sessionId = getOrCreateSessionId();

    async function createSession() {
      try {
        // Check if session already exists
        const { data: existing } = await supabase
          .from('assessment_sessions')
          .select('id')
          .eq('session_id', sessionId)
          .eq('assessment_type', 'gut-check')
          .single();

        if (!existing) {
          // Create new session with correct version
          await supabase.from('assessment_sessions').insert({
            assessment_type: 'gut-check',
            assessment_version: version,
            session_id: sessionId,
            status: 'started',
            last_question_index: 0,
          });
        } else {
          // Update existing session
          await supabase
            .from('assessment_sessions')
            .update({
              status: 'started',
              updated_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId)
            .eq('assessment_type', 'gut-check');
        }
      } catch (error) {
        console.error('Error creating/updating session:', error);
        // Don't block UI - just log
      }
    }

    createSession();
  }, [version]);

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

