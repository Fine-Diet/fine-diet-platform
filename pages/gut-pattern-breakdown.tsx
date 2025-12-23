/**
 * Gut Pattern Breakdown Video Page
 * 
 * Route: /gut-pattern-breakdown
 * 
 * Shows a video about gut patterns and provides a Continue button
 * to return users to their results screen.
 */

import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';

export default function GutPatternBreakdownPage() {
  const router = useRouter();
  const { returnTo } = router.query;

  const handleContinue = () => {
    // Navigate to returnTo URL if provided, otherwise go to home
    if (returnTo && typeof returnTo === 'string') {
      const decodedReturnTo = decodeURIComponent(returnTo);
      router.push(decodedReturnTo);
    } else {
      router.push('/gut-check');
    }
  };

  return (
    <>
      <Head>
        <title>Your Gut Pattern Breakdown • Fine Diet</title>
        <meta
          name="description"
          content="Learn about your gut health pattern and how The Fine Diet Method can help."
        />
      </Head>
      <div className="min-h-screen bg-brand-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 antialiased">
              Your Gut Pattern Breakdown
            </h1>
            <p className="text-lg text-neutral-300 mb-8 antialiased">
              Watch the video below to learn more about your digestive pattern and what it means for your health.
            </p>
          </div>

          {/* Video placeholder */}
          <div className="mb-8">
            <div className="aspect-video bg-neutral-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <p className="text-neutral-400 text-lg mb-4 antialiased">
                  Video Player Placeholder
                </p>
                <p className="text-neutral-500 text-sm antialiased">
                  {/* TODO: Embed actual video here when available */}
                  In production, this would display the gut pattern breakdown video.
                  Video completion tracking can be added to auto-redirect to results.
                </p>
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div className="flex justify-center">
            <Button variant="primary" size="lg" onClick={handleContinue}>
              Continue to Results
            </Button>
          </div>

          {/* Legal Disclaimer */}
          <div className="mt-12 pt-8 border-t border-neutral-700">
            <p className="text-sm text-neutral-400 text-center antialiased">
              This content is for educational purposes only and is not a medical diagnosis.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

