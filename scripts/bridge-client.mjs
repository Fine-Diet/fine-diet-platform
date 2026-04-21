#!/usr/bin/env node
/**
 * scripts/bridge-client.mjs
 *
 * TRANSPORT FALLBACK for bridge operations in Fine Diet.
 *
 * Use this script when the rashadtyler MCP server is unavailable in the
 * current Cursor session. It reaches the same endpoint, writes the same
 * record types, and enforces the same canonical schema as the MCP primary
 * path. It is not a separate system — both paths share one source of record.
 *
 *   System of record: https://mcp.rashadtyler.com/api/mcp
 *   Protocol:         bridge canonical schema (CURSOR_AGENT.md §2)
 *   This file's role: HTTP transport when MCP session is unavailable
 *
 * Do not use this script alongside an active MCP session. Pick one transport
 * per session and stay on it.
 *
 * Usage:
 *   node scripts/bridge-client.mjs <command> [args]
 *   node scripts/bridge-client.mjs help
 *
 * Credentials loaded from .env.local. Optional overrides:
 *   SECOND_BRAIN_MCP_URL   (default: https://mcp.rashadtyler.com/api/mcp)
 *   SECOND_BRAIN_API_KEY   (optional Bearer token)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = resolve(__dirname, '../.env.local');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    env[key] = raw.replace(/^["']|["']$/g, '');
  }
  return env;
}

const fileEnv = loadEnvFile();

const MCP_URL =
  process.env.SECOND_BRAIN_MCP_URL ||
  fileEnv.SECOND_BRAIN_MCP_URL ||
  'https://mcp.rashadtyler.com/api/mcp';

const API_KEY =
  process.env.SECOND_BRAIN_API_KEY ||
  fileEnv.SECOND_BRAIN_API_KEY ||
  '';

// ---------------------------------------------------------------------------
// MCP Streamable HTTP Transport
// ---------------------------------------------------------------------------

let _sessionId = null;
let _requestId = 0;

function buildHeaders() {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  if (_sessionId) h['mcp-session-id'] = _sessionId;
  return h;
}

async function mcpPost(method, params = {}) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++_requestId,
    method,
    params,
  });

  let res;
  try {
    res = await fetch(MCP_URL, { method: 'POST', headers: buildHeaders(), body });
  } catch (err) {
    throw new Error(
      `Network error reaching ${MCP_URL}: ${err.message}\n` +
      'Check SECOND_BRAIN_MCP_URL in .env.local and confirm internet access.'
    );
  }

  const newSession = res.headers.get('mcp-session-id');
  if (newSession) _sessionId = newSession;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    return parseSse(await res.text());
  }

  const json = await res.json();
  if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

function parseSse(text) {
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6));
      if (data.result !== undefined) return data.result;
      if (data.error) throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
    } catch {
      // skip non-JSON SSE lines
    }
  }
  return null;
}

async function initialize() {
  try {
    await mcpPost('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bridge-client', version: '1.0.0' },
    });
    await mcpPost('notifications/initialized', {}).catch(() => {});
  } catch {
    // Proceed — some server configs allow stateless calls
  }
}

async function callTool(name, args = {}) {
  const result = await mcpPost('tools/call', { name, arguments: args });
  return unwrapContent(result);
}

/**
 * MCP tool results: { content: [{ type: "text", text: "..." }] }
 * Parse text as JSON when possible; return raw string otherwise.
 */
function unwrapContent(result) {
  if (!result) return null;
  const text = result?.content?.[0]?.text;
  if (text === undefined) return result;
  try { return JSON.parse(text); } catch { return text; }
}

function toList(value, ...keys) {
  if (Array.isArray(value)) return value;
  for (const k of keys) {
    if (Array.isArray(value?.[k])) return value[k];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Canonical Bridge Schema Helpers
// ---------------------------------------------------------------------------

const BRIDGE_SCHEMA_VERSION = '1.0';

/** Required fields a valid [BRIDGE-PACKET] raw_text must contain */
const PACKET_REQUIRED_FIELDS = ['scope', 'acceptance_criteria', 'target_agent', 'target_repo'];

function validatePacket(doc) {
  const errors = [];
  if (!doc.title?.startsWith('[BRIDGE-PACKET]')) {
    errors.push('title must start with [BRIDGE-PACKET]');
  }
  if (doc.source_type !== 'system_generated') {
    errors.push(`source_type must be "system_generated", got "${doc.source_type}"`);
  }
  let parsed = null;
  try {
    parsed = typeof doc.raw_text === 'string' ? JSON.parse(doc.raw_text) : doc.raw_text;
  } catch {
    errors.push('raw_text is not valid JSON');
  }
  if (parsed) {
    for (const field of PACKET_REQUIRED_FIELDS) {
      if (!parsed[field]) errors.push(`raw_text missing required field: ${field}`);
    }
    if (parsed.target_agent !== 'cursor') {
      errors.push(`target_agent is "${parsed.target_agent}", expected "cursor"`);
    }
    if (parsed.target_repo !== 'fine-diet-platform') {
      errors.push(`target_repo is "${parsed.target_repo}", expected "fine-diet-platform"`);
    }
  }
  return { valid: errors.length === 0, errors, parsed };
}

// ---------------------------------------------------------------------------
// Bridge Commands
// ---------------------------------------------------------------------------

async function cmdPollInbox() {
  console.log(`Polling bridge inbox — ${MCP_URL}\n`);

  // Packets are source_documents only. Tasks are status markers, not packets.
  const result = await callTool('search_source_documents', {
    query: '[BRIDGE-PACKET]',
    source_type: 'system_generated',
    limit: 10,
  });

  const packets = toList(result, 'source_documents', 'results');

  console.log('=== Pending Packets ([BRIDGE-PACKET] source documents) ===');
  if (!packets.length) {
    console.log('  (none)');
    console.log('\n  To create a packet, Marc must capture a source_document with:');
    console.log('    title:       [BRIDGE-PACKET] <description>');
    console.log('    source_type: system_generated');
    console.log('    raw_text:    { scope, acceptance_criteria, target_agent: "cursor", target_repo: "fine-diet-platform" }');
  } else {
    for (const d of packets) {
      console.log(`  [${d.id}] ${d.title}`);
      console.log(`         created: ${d.created_at ?? 'unknown'}`);
    }
  }

  return packets;
}

async function cmdGetPacket(id) {
  if (!id) throw new Error('Usage: get-packet <source_document_id>');
  console.log(`Fetching packet: ${id}\n`);

  // Packets are always source_documents. No fallback to other record types.
  const result = await callTool('get_source_document', {
    source_document_id: id,
    include_raw_text: true,
  });

  if (!result) throw new Error(`No source document found with id: ${id}`);

  const { valid, errors, parsed } = validatePacket(result);

  console.log(JSON.stringify(result, null, 2));

  if (!valid) {
    console.warn('\n⚠  Schema validation warnings:');
    for (const e of errors) console.warn(`   - ${e}`);
    console.warn('\n   This document may not conform to the bridge packet schema.');
    console.warn('   Confirm with Marc before proceeding.');
  } else {
    console.log('\n✓ Packet schema valid');
    if (parsed) {
      console.log(`  Scope: ${parsed.scope}`);
      console.log(`  Criteria: ${parsed.acceptance_criteria?.length ?? 0} item(s)`);
    }
  }

  return result;
}

async function cmdAcknowledge(packetId, packetTitle = 'unknown') {
  if (!packetId) throw new Error('Usage: acknowledge <packet_id> "<packet_title>"');
  console.log(`Acknowledging packet ${packetId} ("${packetTitle}")\n`);

  const result = await callTool('capture_source_document', {
    title: `[BRIDGE-ACK] ${packetTitle}`,
    source_type: 'system_generated',
    raw_text: JSON.stringify({
      bridge_schema_version: BRIDGE_SCHEMA_VERSION,
      bridge_action: 'acknowledge',
      packet_id: packetId,
      agent: 'cursor',
      repo: 'fine-diet-platform',
      acknowledged_at: new Date().toISOString(),
    }),
    metadata: {
      bridge_action: 'acknowledge',
      packet_id: packetId,
      agent: 'cursor',
    },
  });

  const ackId = result?.id ?? '(unknown)';
  console.log(`✓ ACK captured. source_document ID: ${ackId}`);
  return result;
}

async function cmdTransition(packetId, toStatus, packetTitle = 'unknown', branch = '(unknown)', reportId = undefined) {
  if (!packetId || !toStatus) {
    throw new Error(
      'Usage: transition <packet_id> <in_progress|needs_review> "<packet_title>" <branch> [report_id]'
    );
  }
  if (!['in_progress', 'needs_review'].includes(toStatus)) {
    throw new Error(`Status must be "in_progress" or "needs_review", got: "${toStatus}"`);
  }
  if (toStatus === 'needs_review' && !reportId) {
    throw new Error('needs_review transition requires a report_id (execution_report_id)');
  }

  console.log(`Transitioning packet ${packetId} → ${toStatus}\n`);

  const label = toStatus === 'in_progress' ? 'IN_PROGRESS' : 'NEEDS_REVIEW';
  const owner = toStatus === 'in_progress' ? 'cursor' : 'rashad';

  const notesObj =
    toStatus === 'in_progress'
      ? {
          packet_id: packetId,
          agent: 'cursor',
          repo: 'fine-diet-platform',
          branch,
          started_at: new Date().toISOString(),
        }
      : {
          packet_id: packetId,
          execution_report_id: reportId,
          agent: 'cursor',
          repo: 'fine-diet-platform',
          branch,
          completed_at: new Date().toISOString(),
        };

  const result = await callTool('capture_task', {
    title: `[BRIDGE-STATUS] ${label}: ${packetTitle}`,
    owner,
    priority: 'high',
    notes: JSON.stringify(notesObj),
  });

  const taskId = result?.id ?? '(unknown)';
  console.log(`✓ Status task created. task ID: ${taskId}`);
  return result;
}

async function cmdCreateReport(packetId, packetTitle = 'unknown', branch = '(unknown)') {
  if (!packetId) throw new Error('Usage: create-report <packet_id> "<packet_title>" [branch]');
  console.log(`Creating execution report for packet ${packetId} ("${packetTitle}")\n`);

  const now = new Date().toISOString();
  const contentMd = [
    '# Execution Report',
    '',
    `**Packet ID:** ${packetId}`,
    `**Packet Title:** ${packetTitle}`,
    '**Agent:** Cursor (fine-diet-platform)',
    `**Date:** ${now}`,
    `**Branch:** ${branch}`,
    '',
    '## Summary',
    '(replace with 1–3 sentence summary)',
    '',
    '## Files Changed',
    '- `path/to/file` — what changed',
    '',
    '## What Was Done',
    '(replace with detailed description)',
    '',
    '## Validation',
    '- [ ] `npm run build` — passed / not run (reason)',
    '- [ ] `npm run lint` — passed / not run (reason)',
    '- [ ] No existing functionality broken',
    '',
    '## Blockers / Questions',
    'None',
    '',
    '## Next Steps',
    'Rashad reviews this report and the PR.',
  ].join('\n');

  const result = await callTool('create_generated_document', {
    title: `[EXECUTION-REPORT] ${packetTitle}`,
    doc_type: 'handoff_doc',
    content_md: contentMd,
    abstract: `Cursor execution report for bridge packet: ${packetId}`,
  });

  const reportId = result?.id ?? '(unknown)';
  console.log(`✓ Execution report created. generated_document ID: ${reportId}`);
  console.log('\nThis skeleton report was created via CLI transport fallback.');
  console.log('If possible, use create_generated_document via MCP to write the full report directly.');
  return result;
}

async function cmdReviewQueue() {
  console.log('Bridge review queue\n');

  // Status tasks in needs_review
  const taskResult = await callTool('search_tasks', { status: 'needs_review', limit: 20 });
  const allTasks = toList(taskResult, 'tasks', 'results');
  const bridgeTasks = allTasks.filter(
    (t) => typeof t.title === 'string' && t.title.startsWith('[BRIDGE-STATUS] NEEDS_REVIEW:')
  );

  // Execution reports
  const reportResult = await callTool('list_generated_documents', { status: 'all', limit: 50 });
  const allReports = toList(reportResult, 'generated_documents', 'results');
  const bridgeReports = allReports.filter(
    (r) => typeof r.title === 'string' && r.title.startsWith('[EXECUTION-REPORT]')
  );

  console.log('=== NEEDS_REVIEW Status Tasks ===');
  if (!bridgeTasks.length) {
    console.log('  (none)');
  } else {
    for (const t of bridgeTasks) {
      console.log(`  [${t.id}] ${t.title}`);
      if (t.notes) {
        try {
          const n = JSON.parse(t.notes);
          console.log(`         packet:  ${n.packet_id ?? '?'}`);
          console.log(`         report:  ${n.execution_report_id ?? '?'}`);
          console.log(`         branch:  ${n.branch ?? '?'}`);
        } catch {
          console.log(`         notes:   ${t.notes}`);
        }
      }
    }
  }

  console.log('\n=== Execution Reports ===');
  if (!bridgeReports.length) {
    console.log('  (none)');
  } else {
    for (const r of bridgeReports) {
      console.log(`  [${r.id}] ${r.title} | status: ${r.status}`);
    }
  }

  return { tasks: bridgeTasks, reports: bridgeReports };
}

// ---------------------------------------------------------------------------
// CLI Dispatch
// ---------------------------------------------------------------------------

const COMMANDS = {
  'poll-inbox': {
    desc: 'Poll for pending [BRIDGE-PACKET] source documents',
    args: '',
    fn: () => cmdPollInbox(),
  },
  'get-packet': {
    desc: 'Fetch and validate a packet by source_document ID',
    args: '<packet_id>',
    fn: ([id]) => cmdGetPacket(id),
  },
  'acknowledge': {
    desc: 'Capture [BRIDGE-ACK] source document for a packet',
    args: '<packet_id> "<packet_title>"',
    fn: ([id, title]) => cmdAcknowledge(id, title),
  },
  'transition': {
    desc: 'Capture [BRIDGE-STATUS] task (in_progress or needs_review)',
    args: '<packet_id> <in_progress|needs_review> "<title>" <branch> [report_id]',
    fn: ([id, status, title, branch, reportId]) =>
      cmdTransition(id, status, title, branch, reportId),
  },
  'create-report': {
    desc: 'Create skeleton [EXECUTION-REPORT] generated document',
    args: '<packet_id> "<packet_title>" [branch]',
    fn: ([id, title, branch]) => cmdCreateReport(id, title, branch),
  },
  'review-queue': {
    desc: 'List NEEDS_REVIEW status tasks and execution reports',
    args: '',
    fn: () => cmdReviewQueue(),
  },
};

function printHelp() {
  const divider = '─'.repeat(60);
  console.log('bridge-client.mjs — Fine Diet bridge transport fallback\n');
  console.log('TRANSPORT FALLBACK ONLY. Use when the rashadtyler MCP server');
  console.log('is unavailable in Cursor. Same endpoint, same schema, same protocol.');
  console.log(`Endpoint: ${MCP_URL}\n`);
  console.log(divider);
  console.log('Commands:\n');
  for (const [cmd, { desc, args }] of Object.entries(COMMANDS)) {
    const sig = args ? `${cmd} ${args}` : cmd;
    console.log(`  ${cmd}`);
    if (args) console.log(`    args:  ${args}`);
    console.log(`    ${desc}\n`);
  }
  console.log(divider);
  console.log('Credentials (.env.local — both optional):\n');
  console.log('  SECOND_BRAIN_MCP_URL   default: https://mcp.rashadtyler.com/api/mcp');
  console.log('  SECOND_BRAIN_API_KEY   Bearer token if server requires auth\n');
  console.log(`Active endpoint: ${MCP_URL}`);
  console.log(`Auth:            ${API_KEY ? 'Bearer token set' : 'none configured'}`);
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || ['help', '--help', '-h'].includes(command)) {
    printHelp();
    process.exit(0);
  }

  const cmd = COMMANDS[command];
  if (!cmd) {
    console.error(`Unknown command: "${command}"\n`);
    printHelp();
    process.exit(1);
  }

  try {
    await initialize();
    await cmd.fn(args);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (err.message.startsWith('Network error') || err.message.includes('fetch')) {
      console.error('\nTroubleshooting:');
      console.error('  1. Confirm SECOND_BRAIN_MCP_URL is reachable');
      console.error('  2. Add SECOND_BRAIN_API_KEY to .env.local if auth is required');
      console.error('  3. Check internet connectivity');
    }
    process.exit(1);
  }
}

main();
