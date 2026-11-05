#!/usr/bin/env bash
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_ROOT="$(mktemp -d /private/tmp/fd-program-content-rls.XXXXXX)"
DATA_DIR="$RUN_ROOT/data"
SOCKET_DIR="$RUN_ROOT/socket"
PORT="${PG_TEST_PORT:-55439}"
mkdir -m 700 "$SOCKET_DIR"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$RUN_ROOT"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth-local=trust --auth-host=reject -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$RUN_ROOT/postgres.log" \
  -o "-k $SOCKET_DIR -p $PORT -c listen_addresses='' -c fsync=off -c full_page_writes=off" \
  start >/dev/null

"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 \
  -h "$SOCKET_DIR" -p "$PORT" -U postgres -d postgres \
  -f "$ROOT/test/localdb/sql/programContentEntitlementRls.sql"

printf 'PASS: program content entitlement RLS role checks on %s\n' "$("$PG_BIN/postgres" --version)"
