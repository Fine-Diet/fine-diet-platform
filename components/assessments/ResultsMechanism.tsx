/**
 * Results Mechanism Component
 * Displays key patterns and insights
 * Renders from JSON pack ONLY
 */

import React from 'react';
import type { ResultsPack } from '@/lib/assessments/results/loadResultsPack';

interface ResultsMechanismProps {
  pack: ResultsPack;
}

export function ResultsMechanism({ pack }: ResultsMechanismProps) {
  return (
    <div className="mb-8">
      <h3 className="text-xl font-semibold text-white mb-4 antialiased">Key Patterns</h3>
      {pack.keyPatterns && pack.keyPatterns.length > 0 ? (
        <ul className="space-y-2">
          {pack.keyPatterns.map((pattern, index) => (
            <li key={index} className="text-neutral-200 flex items-start antialiased">
              <span className="text-dark_accent-500 mr-2">•</span>
              <span>{pattern}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-300 italic">Key patterns will be displayed here.</p>
      )}

      {pack.firstFocusAreas && pack.firstFocusAreas.length > 0 && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold text-white mb-3 antialiased">First Focus Areas</h4>
          <ul className="space-y-2">
            {pack.firstFocusAreas.map((area, index) => (
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

