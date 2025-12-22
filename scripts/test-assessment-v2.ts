/**
 * Assessment v2 Scoring Test Harness
 * 
 * Run with: npx tsx scripts/test-assessment-v2.ts
 * Or: ./node_modules/.bin/tsx scripts/test-assessment-v2.ts
 */

import { calculateScoringV2FromResponses, computeAxisAverages, type AssessmentResponses } from '../lib/assessmentScoringV2';

// ============================================================================
// Persona Definitions (arrays in q1..q17 order; 0=Never, 1=Rarely, 2=Often, 3=Almost always)
// ============================================================================

const personas = [
  {
    name: 'P1 Stable under load',
    description: 'expect level1, confidence high',
    answers: [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0] as const,
  },
  {
    name: 'P2 Reactive but rebounds',
    description: 'expect level2, modifier high_responsiveness, conf moderate/high',
    answers: [1, 2, 1, 3, 2, 3, 3, 2, 3, 1, 1, 1, 0, 0, 0, 1, 1] as const,
  },
  {
    name: 'P3 Narrow buffer, not reactive',
    description: 'expect NOT level2; likely level3 fallback',
    answers: [1, 2, 2, 3, 2, 2, 1, 1, 1, 2, 2, 1, 0, 0, 0, 1, 2] as const,
  },
  {
    name: 'P4 Low capacity, no shutdown',
    description: 'expect level3',
    answers: [2, 3, 3, 3, 2, 2, 1, 1, 1, 2, 3, 2, 1, 1, 1, 2, 2] as const,
  },
  {
    name: 'P5 Active protection / conserving',
    description: 'expect level4, conf high',
    answers: [3, 3, 3, 3, 3, 3, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3] as const,
  },
  {
    name: 'P6 High responsiveness + poor recovery',
    description: 'expect level3 unless protection high',
    answers: [2, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1, 1, 2, 2] as const,
  },
  {
    name: 'P7 Improves quickly but relapses',
    description: 'expect level2 or level3 depending recovery band',
    answers: [1, 2, 2, 3, 2, 3, 3, 3, 3, 2, 2, 3, 0, 0, 0, 2, 2] as const,
  },
  {
    name: 'P8 Level1 but fast responder',
    description: 'expect level1; maybe modifier high_responsiveness',
    answers: [0, 1, 0, 1, 1, 1, 3, 2, 3, 0, 0, 1, 0, 0, 0, 0, 0] as const,
  },
  {
    name: 'P9 Minimal buffer, persistent baseline discomfort',
    description: 'expect level3 unless protection high',
    answers: [3, 3, 3, 3, 3, 3, 1, 1, 1, 3, 3, 3, 1, 1, 1, 3, 3] as const,
  },
  {
    name: 'P10 Contradictory responder',
    description: 'expect confidence low; level depends',
    answers: [1, 1, 2, 2, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 0, 3] as const,
  },
];

// ============================================================================
// Helper: Convert array to AssessmentResponses
// ============================================================================

function arrayToResponses(arr: readonly number[]): AssessmentResponses {
  return {
    q1: (arr[0] ?? 0) as 0 | 1 | 2 | 3,
    q2: (arr[1] ?? 0) as 0 | 1 | 2 | 3,
    q3: (arr[2] ?? 0) as 0 | 1 | 2 | 3,
    q4: (arr[3] ?? 0) as 0 | 1 | 2 | 3,
    q5: (arr[4] ?? 0) as 0 | 1 | 2 | 3,
    q6: (arr[5] ?? 0) as 0 | 1 | 2 | 3,
    q7: (arr[6] ?? 0) as 0 | 1 | 2 | 3,
    q8: (arr[7] ?? 0) as 0 | 1 | 2 | 3,
    q9: (arr[8] ?? 0) as 0 | 1 | 2 | 3,
    q10: (arr[9] ?? 0) as 0 | 1 | 2 | 3,
    q11: (arr[10] ?? 0) as 0 | 1 | 2 | 3,
    q12: (arr[11] ?? 0) as 0 | 1 | 2 | 3,
    q13: (arr[12] ?? 0) as 0 | 1 | 2 | 3,
    q14: (arr[13] ?? 0) as 0 | 1 | 2 | 3,
    q15: (arr[14] ?? 0) as 0 | 1 | 2 | 3,
    q16: (arr[15] ?? 0) as 0 | 1 | 2 | 3,
    q17: (arr[16] ?? 0) as 0 | 1 | 2 | 3,
  };
}

// ============================================================================
// Test Runner
// ============================================================================

function runTests() {
  console.log('=== Assessment v2 Scoring Test Harness ===\n');

  personas.forEach((persona, index) => {
    console.log(`=== ${persona.name} ===`);
    console.log(`Description: ${persona.description}`);
    console.log(`answers: [${persona.answers.join(', ')}]`);

    const responses = arrayToResponses(persona.answers);
    const result = calculateScoringV2FromResponses(responses);
    const averages = computeAxisAverages(responses);

    console.log(`averages: {`);
    console.log(`  capacity: ${averages.capacity.toFixed(2)},`);
    console.log(`  buffer: ${averages.buffer.toFixed(2)},`);
    console.log(`  responsiveness: ${averages.responsiveness.toFixed(2)},`);
    console.log(`  recovery: ${averages.recovery.toFixed(2)},`);
    console.log(`  protection: ${averages.protection.toFixed(2)}`);
    console.log(`}`);

    console.log(`bands: {`);
    if (result.axisBands) {
      console.log(`  capacity: "${result.axisBands.capacity}",`);
      console.log(`  buffer: "${result.axisBands.buffer}",`);
      console.log(`  responsiveness: "${result.axisBands.responsiveness}",`);
      console.log(`  recovery: "${result.axisBands.recovery}",`);
      console.log(`  protection: "${result.axisBands.protection}"`);
    }
    console.log(`}`);

    console.log(`result: {`);
    console.log(`  primary_level: "${result.primary_level}",`);
    console.log(`  secondary_modifier: ${result.secondary_modifier ? `"${result.secondary_modifier}"` : 'null'},`);
    console.log(`  confidence: "${result.confidence}"`);
    console.log(`}`);

    console.log(''); // Empty line between personas
  });

  console.log('=== Test Complete ===');
}

// Run tests
runTests();

