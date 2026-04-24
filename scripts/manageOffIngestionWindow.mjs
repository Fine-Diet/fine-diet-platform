#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

const PID_FILE = '/tmp/fine-diet-off-import.pid';
const LOG_FILE = '/tmp/fine-diet-off-window.log';
const WINDOW_TZ = 'America/Chicago';
const WINDOW_START_HOUR = 21;
const WINDOW_END_HOUR = 6;
const CHECK_INTERVAL_MS = 60_000;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function getArg(flag, fallback = '') {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

function getCtHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WINDOW_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((part) => part.type === 'hour');
  return hourPart ? Number(hourPart.value) : NaN;
}

function isInsideWindow() {
  const hour = getCtHour();
  return hour >= WINDOW_START_HOUR || hour < WINDOW_END_HOUR;
}

function readState() {
  if (!existsSync(PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  writeFileSync(PID_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid, signal) {
  process.kill(-pid, signal);
}

function startImport(file, batchSize, flushDelayMs) {
  const delayArg = flushDelayMs > 0 ? ` --flush-delay-ms ${flushDelayMs}` : '';
  const command = `OFF_FILE="${file}" && npx tsx scripts/importOpenFoodFactsPhase1.ts --file "$OFF_FILE" --batch ${batchSize}${delayArg}`;
  const child = spawn('zsh', ['-lc', command], {
    cwd: '/Users/rashadtyler/code/fine-diet',
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const state = {
    pid: child.pid,
    status: 'running',
    file,
    batchSize,
    flushDelayMs,
    startedAt: new Date().toISOString(),
    lastTransitionAt: new Date().toISOString(),
  };
  writeState(state);
  log(`Started OFF import process group ${child.pid}`);
  return state;
}

function reconcileExitedProcess(state) {
  if (!state) return null;
  if (processExists(state.pid)) return state;
  log(`Observed OFF import process group ${state.pid} exited; clearing manager state`);
  clearState();
  return null;
}

function tick(file, batchSize, flushDelayMs) {
  let state = reconcileExitedProcess(readState());
  const insideWindow = isInsideWindow();

  if (!state) {
    if (insideWindow) startImport(file, batchSize, flushDelayMs);
    return;
  }

  if (insideWindow && state.status === 'paused') {
    signalGroup(state.pid, 'SIGCONT');
    state.status = 'running';
    state.lastTransitionAt = new Date().toISOString();
    writeState(state);
    log(`Resumed OFF import process group ${state.pid} for ingestion window`);
    return;
  }

  if (!insideWindow && state.status === 'running') {
    signalGroup(state.pid, 'SIGSTOP');
    state.status = 'paused';
    state.lastTransitionAt = new Date().toISOString();
    writeState(state);
    log(`Paused OFF import process group ${state.pid} outside ingestion window`);
  }
}

async function main() {
  const file = getArg('--file');
  const batchSize = Number(getArg('--batch', '100')) || 100;
  const flushDelayMs = Number(getArg('--flush-delay-ms', '0')) || 0;

  if (!file) {
    console.error('Usage: node scripts/manageOffIngestionWindow.mjs --file <path> [--batch 100] [--flush-delay-ms 0]');
    process.exit(1);
  }

  log(`OFF ingestion window manager started (${WINDOW_START_HOUR}:00-${WINDOW_END_HOUR}:00 ${WINDOW_TZ})`);
  log(`Managing file=${file} batch=${batchSize} flushDelayMs=${flushDelayMs}`);
  tick(file, batchSize, flushDelayMs);
  setInterval(() => tick(file, batchSize, flushDelayMs), CHECK_INTERVAL_MS);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
