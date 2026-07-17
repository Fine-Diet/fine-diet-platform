/**
 * Exactly one live SerpAPI smoke against Preview Supabase (service layer).
 *
 * Hard safeguards (see lib/plans/groceryPricePreviewLiveSmokeGuard.ts):
 * - Preview Supabase project tssvlflebugqhtogqdfs only
 * - Exact expected git HEAD SHA (override via GROCERY_PRICE_LIVE_SMOKE_HEAD_SHA)
 * - Bridge authorization message ID (override via GROCERY_PRICE_LIVE_SMOKE_BRIDGE_MESSAGE_ID)
 * - GROCERY_PRICE_LIVE_SMOKE_ACK=1 required
 * - Exactly one SerpAPI HTTP request (no retry, single strategy)
 * - Optional runner-only provider timeout via GROCERY_PRICE_LIVE_SMOKE_PROVIDER_TIMEOUT_MS
 * - Quota + billed-search counts before/after
 * - Search event ID, outcome, result count, cache-hit, billed, provider error, diagnostics
 *
 * Usage:
 *   GROCERY_PRICE_LIVE_SMOKE_ACK=1 npx tsx scripts/groceryPricePreviewLiveSmokeOnce.ts
 *
 * Bridge-authorized overrides:
 *   GROCERY_PRICE_LIVE_SMOKE_HEAD_SHA=<40-char git SHA>
 *   GROCERY_PRICE_LIVE_SMOKE_BRIDGE_MESSAGE_ID=<uuid>
 *   GROCERY_PRICE_LIVE_SMOKE_PROVIDER_TIMEOUT_MS=<5000-60000>
 *
 * Do not retry. Do not run without Bridge authorization.
 */

import { loadEnvConfig } from '@next/env';
import {
  resolveLiveSmokeBridgeAuthorizationMessageId,
  resolveLiveSmokeExpectedHeadSha,
} from '@/lib/plans/groceryPricePreviewLiveSmokeGuard';
import { runPreviewLiveSmokeOnce } from '@/lib/plans/groceryPricePreviewLiveSmokeRunner';

const PERSON_ID = process.env.GROCERY_PRICE_SMOKE_PERSON_ID ?? '893f480f-85d3-4332-9d08-605952f7cae1';
const ITEM_ID = process.env.GROCERY_PRICE_LIVE_ITEM_ID ?? '7310b49a-1ff5-411d-8baf-68710595cad4';
const POSTAL_CODE = process.env.GROCERY_PRICE_LIVE_SMOKE_POSTAL_CODE;

async function main() {
  loadEnvConfig(process.cwd());

  const report = await runPreviewLiveSmokeOnce({
    personId: PERSON_ID,
    groceryItemId: ITEM_ID,
    postalCode: POSTAL_CODE,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        bridge_authorization_message_id: resolveLiveSmokeBridgeAuthorizationMessageId(process.env),
        expected_head_sha: resolveLiveSmokeExpectedHeadSha(process.env),
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
