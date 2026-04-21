/**
 * Probe — drive the import pipeline end-to-end for a URL, so we can
 * see exactly what the user will see in the draft on /journal/plans/
 * imports/<id> after pasting the URL into the Import box.
 *
 * Simulates the core of `/api/journal/plans/ai/import-recipe`:
 *   1. acquireVideoTranscript() — returns title/description/captions.
 *   2. runRecipeImport() — deterministic draft from that text.
 *
 * Does NOT write to Supabase; purely for diagnostic output.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/probeImportPipeline.ts <url>
 */

import { acquireVideoTranscript } from '@/lib/plans/videoTranscript/videoTranscriptService';
import { runRecipeImport } from '@/lib/plans/recipeImporter';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: tsx scripts/probeImportPipeline.ts <url>');
    process.exit(2);
  }

  console.log('URL:', url);
  console.log('-'.repeat(60));

  const outcome = await acquireVideoTranscript(url, {});
  console.log('acquisition outcome:');
  console.log(JSON.stringify(outcome, null, 2));

  const effectiveText = outcome.transcript ?? '';
  console.log('\neffectiveText length:', effectiveText.length);
  console.log('effectiveText:', JSON.stringify(effectiveText).slice(0, 600));

  const result = runRecipeImport({
    text: effectiveText,
    url,
    source_platform: 'youtube',
    user_hint: null,
  });

  console.log('\nrunRecipeImport result:');
  console.log(
    JSON.stringify(
      {
        title: result.title,
        parse_status: result.parse_status,
        parsed_payload_json: result.parsed_payload_json,
      },
      null,
      2,
    ),
  );

  console.log('\n=> user would see:');
  console.log(`  title: "${result.title}"`);
  console.log(`  acquisition_source: "${outcome.source}"`);
  console.log(`  parse_status: "${result.parse_status}"`);
  console.log(`  ingredients: ${result.parsed_payload_json?.ingredients?.length ?? 0}`);
  console.log(`  steps: ${result.parsed_payload_json?.steps?.length ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
