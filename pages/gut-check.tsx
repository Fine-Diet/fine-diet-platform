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
  showDebug?: boolean;
}

// Build fingerprint for SSR verification (shared between component and getServerSideProps)
const BUILD_FINGERPRINT = 'gc_v2_ssr_diag_001';

export default function GutCheckPage({ initialVersion, showDebug }: GutCheckPageProps) {
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
      {/* Build fingerprint - HTML comments rendered via dangerouslySetInnerHTML (visible in View Source) */}
      <div dangerouslySetInnerHTML={{ __html: `<!-- GC_BUILD: ${BUILD_FINGERPRINT} -->` }} style={{ display: 'none' }} />
      <div dangerouslySetInnerHTML={{ __html: '<!-- GC_SSR: 1 -->' }} style={{ display: 'none' }} />
      <div dangerouslySetInnerHTML={{ __html: `<!-- ROUTE_SOURCE: pages/gut-check.tsx -->` }} style={{ display: 'none' }} />
      <Head>
        <title>Gut Check Assessment • Fine Diet</title>
        <meta
          name="description"
          content="Take our quick gut health assessment to discover your personalized insights and learn about The Fine Diet Method."
        />
      </Head>
      {/* SSR marker - visible in view-source even before hydration */}
      <div id="gc-ssr-version" data-version={initialVersion} style={{ display: 'none' }} />
      {/* Visible debug marker when ?debug=1 */}
      {showDebug && (
        <>
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(255, 0, 0, 0.9)',
            color: 'white',
            padding: '8px',
            fontSize: '14px',
            fontFamily: 'monospace',
            zIndex: 9999,
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            SSR initialVersion: {initialVersion}
          </div>
          <div style={{
            position: 'fixed',
            top: '40px',
            left: 0,
            right: 0,
            background: 'rgba(0, 0, 255, 0.9)',
            color: 'white',
            padding: '8px',
            fontSize: '14px',
            fontFamily: 'monospace',
            zIndex: 9999,
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            GC_BUILD: gc_v2_prod_diag_002 | <a href="/gc_build.txt" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline' }}>Verify static file</a>
          </div>
        </>
      )}
      <AssessmentRoot assessmentType="gut-check" initialVersion={initialVersion} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<GutCheckPageProps> = async (context) => {
  // Build fingerprint for SSR verification (must match component constant)
  const BUILD_FINGERPRINT = 'gc_v2_ssr_diag_001';
  // Robustly parse version from query param (handle string | string[] | undefined)
  const v = context.query.v;
  let initialVersion = 1;
  
  if (v) {
    const vStr = Array.isArray(v) ? v[0] : v;
    if (vStr === '2' || vStr === 'v2') {
      initialVersion = 2;
    }
  }

  // Add no-cache headers to prevent CDN/static cache from masking query params
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  context.res.setHeader('Pragma', 'no-cache');
  context.res.setHeader('Expires', '0');
  
  // Add response headers for verification
  context.res.setHeader('x-gut-check-version', String(initialVersion));
  context.res.setHeader('x-gc-build', BUILD_FINGERPRINT);
  context.res.setHeader('x-gc-ssr', '1');

  // Check if debug mode is enabled
  const debug = context.query.debug;
  const showDebug = debug === '1' || (Array.isArray(debug) && debug[0] === '1');

  return {
    props: {
      initialVersion,
      showDebug,
    },
  };
};

