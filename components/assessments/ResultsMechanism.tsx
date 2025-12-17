/**
 * Results Mechanism Component
 * Displays key patterns and insights
 */

import React from 'react';
import type { AvatarInsight } from '@/lib/assessmentTypes';

interface ResultsMechanismProps {
  insight: AvatarInsight | null;
}

export function ResultsMechanism({ insight }: ResultsMechanismProps) {
  if (!insight) return null;

  return (
    <div className="mb-8">
      <h3 className="text-xl font-semibold text-white mb-4 antialiased">Key Patterns</h3>
      {insight.keyPatterns && insight.keyPatterns.length > 0 ? (
        <ul className="space-y-2">
          {insight.keyPatterns.map((pattern, index) => (
            <li key={index} className="text-neutral-200 flex items-start antialiased">
              <span className="text-dark_accent-500 mr-2">•</span>
              <span>{pattern}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-300 italic">Key patterns will be displayed here.</p>
      )}

      {insight.firstFocusAreas && insight.firstFocusAreas.length > 0 && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold text-white mb-3 antialiased">First Focus Areas</h4>
          <ul className="space-y-2">
            {insight.firstFocusAreas.map((area, index) => (
              <li key={index} className="text-neutral-200 flex items-start antialiased">
                <span className="text-dark_accent-500 mr-2">•</span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

