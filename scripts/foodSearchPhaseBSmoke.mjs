#!/usr/bin/env node
/**
 * Phase B smoke checks for the FOODDATA search stack.
 *
 * Hits the locally-running dev server (default http://localhost:3001) for each
 * Phase B canonical query, parses the searchDebug payload, and prints a single
 * compact line per query with: top representative, totalMs, slowest stage,
 * retrieval errors, and fallback gate reason.
 *
 * Usage:
 *   PORT=3001 node scripts/foodSearchPhaseBSmoke.mjs
 */
const PORT = process.env.PORT || '3001';
const BASE = `http://localhost:${PORT}`;

const QUERIES = [
  { label: 'Amylu (full)', q: 'Amylu Breakfast Time Chicken Mini Links' },
  { label: 'Amylu (suffix)', q: 'Breakfast Time Chicken Mini Links Amylu' },
  { label: 'Amylu (short)', q: 'amylu mini' },
  { label: 'Amylu (no brand last)', q: 'amylu breakfast time chicken mini' },
  { label: 'Amylu (brand last)', q: 'breakfast time chicken mini amylu' },
  { label: 'Tim Tam', q: 'tim tam' },
  { label: 'Greek yogurt', q: 'chobani greek yogurt' },
  { label: 'UPC bare', q: '092227741095' },
  { label: 'UPC w/ leading 0', q: '0092227741095' },
];

function topRepresentative(json) {
  const sections = json.sections || [];
  for (const s of sections) {
    if (s.items && s.items.length > 0) {
      const it = s.items[0];
      const food = it.food || it;
      const brand = food.brandName ? `${food.brandName} | ` : '';
      const upc = food.upc ? ` upc=${food.upc}` : '';
      return `${s.key}/${s.items.length}: ${brand}${food.canonicalName || food.id || '?'}${upc}`;
    }
  }
  return '(no results)';
}

function stageMs(s) {
  return s?.durationMs ?? s?.ms ?? 0;
}
function stageRows(s) {
  return s?.rowCount ?? s?.rows ?? 0;
}

function slowestStage(stageTimings) {
  if (!Array.isArray(stageTimings) || stageTimings.length === 0) return '(none)';
  const sorted = [...stageTimings].sort((a, b) => stageMs(b) - stageMs(a));
  const s = sorted[0];
  return `${s.stage}=${stageMs(s).toFixed(1)}ms`;
}

function topNStages(stageTimings, n = 3) {
  if (!Array.isArray(stageTimings) || stageTimings.length === 0) return [];
  return [...stageTimings]
    .sort((a, b) => stageMs(b) - stageMs(a))
    .slice(0, n)
    .map((s) => `${s.stage}=${stageMs(s).toFixed(0)}ms${stageRows(s) ? `/${stageRows(s)}r` : ''}`);
}

function retrievalSummary(retrieval) {
  if (!Array.isArray(retrieval) || retrieval.length === 0) return 'retrieval=(none)';
  const errors = retrieval.filter((r) => r.error);
  if (errors.length === 0) {
    const totalRows = retrieval.reduce((n, r) => n + stageRows(r), 0);
    return `retrieval=${retrieval.length}stages/${totalRows}rows/0err`;
  }
  return `retrieval=${retrieval.length}stages/${errors.length}err [${errors.map((e) => `${e.stage}: ${e.error || e.errorCode || 'err'}`).join('; ')}]`;
}

async function run() {
  const rows = [];
  for (const tc of QUERIES) {
    const url = `${BASE}/api/foods/search?q=${encodeURIComponent(tc.q)}&debug=true&consumer=sections`;
    const t0 = Date.now();
    let json;
    let httpErr;
    try {
      const r = await fetch(url, { headers: { 'x-session-id': 'phase-b-smoke' } });
      json = await r.json();
    } catch (e) {
      httpErr = e.message || String(e);
    }
    const wallMs = Date.now() - t0;
    if (httpErr || !json) {
      rows.push({ label: tc.label, q: tc.q, top: '(http error)', totalMs: wallMs, slowest: '(n/a)', retrieval: '(n/a)', fallback: '(n/a)', error: httpErr || 'no-json' });
      continue;
    }
    const debug = json.debug || {};
    rows.push({
      label: tc.label,
      q: tc.q,
      top: topRepresentative(json),
      totalMs: debug.totalMs ?? wallMs,
      slowest: slowestStage(debug.stageTimings),
      top3stages: topNStages(debug.stageTimings, 3),
      retrieval: retrievalSummary(debug.retrieval),
      fallback: debug.fallbackGate?.reason || debug.fallbackGate?.fallbackGateReason || '(none)',
      sectionsKeyed: (json.sections || []).map((s) => `${s.key}=${s.items?.length || 0}`).join(','),
    });
  }

  console.log('\nPhase B smoke results');
  console.log('====================================================================================');
  for (const r of rows) {
    console.log(`[${r.label}] q="${r.q}"`);
    console.log(`  top:        ${r.top}`);
    console.log(`  totalMs:    ${typeof r.totalMs === 'number' ? r.totalMs.toFixed(1) : r.totalMs}`);
    console.log(`  slowest:    ${r.slowest}`);
    if (r.top3stages?.length) console.log(`  top3:       ${r.top3stages.join(' | ')}`);
    console.log(`  ${r.retrieval}`);
    console.log(`  fallback:   ${r.fallback}`);
    console.log(`  sections:   ${r.sectionsKeyed}`);
    if (r.error) console.log(`  ERROR:      ${r.error}`);
    console.log('');
  }

  const errors = rows.flatMap((r) => (r.retrieval && r.retrieval.includes('err [')) ? [r.label] : []);
  console.log('Summary');
  console.log('  total queries:     ', rows.length);
  console.log('  retrieval errors:  ', errors.length, errors.length ? `(${errors.join(', ')})` : '');
  console.log('  http errors:       ', rows.filter((r) => r.error).length);
}

run().catch((e) => {
  console.error('smoke runner crashed:', e);
  process.exit(1);
});
