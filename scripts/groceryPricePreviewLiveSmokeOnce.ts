/**
 * Exactly one live SerpAPI smoke against Preview Supabase (service layer).
 *
 * Hard safeguards (see lib/plans/groceryPricePreviewLiveSmokeGuard.ts):
 * - Preview Supabase project tssvlflebugqhtogqdfs only
 * - Exact expected git HEAD SHA
 * - GROCERY_PRICE_LIVE_SMOKE_ACK=1 required
 * - Exactly one SerpAPI HTTP request (no retry, single strategy)
 * - Quota + billed-search counts before/after
 * - Search event ID, outcome, result count, cache-hit, billed, provider error
 *
 * Usage:
 *   GROCERY_PRICE_LIVE_SMOKE_ACK=1 npx tsx scripts/groceryPricePreviewLiveSmokeOnce.ts
 *
 * Do not retry. Do not run without Bridge authorization.
 */

import { loadEnvConfig } from '@next/env';
import { runPreviewLiveSmokeOnce } from '@/lib/plans/groceryPricePreviewLiveSmokeRunner';

const PERSON_ID = process.env.GROCERY_PRICE_SMOKE_PERSON_ID ?? '893f480f-85d3-4332-9d08-605952f7cae1';
const ITEM_ID = process.env.GROCERY_PRICE_LIVE_ITEM_ID ?? '7310b49a-1ff5-411d-8baf-68710595cad4';

async function main() {
  loadEnvConfig(process.cwd());

  const report = await runPreviewLiveSmokeOnce({
    personId: PERSON_ID,
    groceryItemId: ITEM_ID,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        bridge_authorization_message_id: 'c049cd0c-a8f6-4d3c-ba15-611c27875199',
        expected_head_sha: 'c66e87f2e9bcdba60e3c7fda2952a3486f0bf175',
        no_retry: true,
        error: error instanceof Error ? error.message : String(error),
        paid_serpapi_calls: 0,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
