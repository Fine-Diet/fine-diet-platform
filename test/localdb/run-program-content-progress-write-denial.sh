#!/usr/bin/env bash
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_ROOT="$(mktemp -d /private/tmp/fd-progress-write-denial.XXXXXX)"
DATA_DIR="$RUN_ROOT/data"
SOCKET_DIR="$RUN_ROOT/socket"
PORT="${PG_TEST_PORT:-55447}"
mkdir -m 700 "$SOCKET_DIR"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$RUN_ROOT"
}
trap cleanup EXIT

MIGRATION_COUNT="$(find "$ROOT/supabase/migrations" -name '*_program_content_progress_direct_write_denial.sql' | wc -l | tr -d ' ')"
if [[ "$MIGRATION_COUNT" -ne 1 ]]; then
  printf 'expected one progress write-denial migration, found %s\n' "$MIGRATION_COUNT" >&2
  exit 1
fi
MIGRATION="$(find "$ROOT/supabase/migrations" -name '*_program_content_progress_direct_write_denial.sql' | sort)"
BASE_NAME="$(basename "$MIGRATION")"
if [[ "$BASE_NAME" < "20261109220000_program_content_entitlement_rls.sql" ]]; then
  printf 'migration %s does not sort after the curriculum migration\n' "$BASE_NAME" >&2
  exit 1
fi

if grep -E -n 'schema_migrations' "$MIGRATION"; then
  printf 'migration contains a ledger reference\n' >&2
  exit 1
fi

if grep -E -n -i \
  'insert into public\.program_content_progress|update public\.program_content_progress|delete from public\.program_content_progress|create or replace function programs_private' \
  "$MIGRATION"
then
  printf 'migration mutates progress rows or replaces the curriculum helper\n' >&2
  exit 1
fi

"$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth-local=trust --auth-host=reject -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$RUN_ROOT/postgres.log" \
  -o "-k $SOCKET_DIR -p $PORT -c listen_addresses='' -c fsync=off -c full_page_writes=off" \
  start >/dev/null

PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -U postgres -d postgres)
SQL_FILE="$ROOT/test/localdb/sql/programContentProgressWriteDenial.sql"

"${PSQL[@]}" -v migration_path="$MIGRATION" -f "$SQL_FILE"

"${PSQL[@]}" -v negative_plant=1 -f "$SQL_FILE"
set +e
"${PSQL[@]}" -f "$MIGRATION" >"$RUN_ROOT/unexpected-select.log" 2>&1
neg_status=$?
set -e
if [[ "$neg_status" -eq 0 ]]; then
  printf 'unexpected permissive SELECT policy did not reject the migration\n' >&2
  exit 1
fi
if ! grep -F 'progress write denial requires exactly the own-person SELECT policy' \
  "$RUN_ROOT/unexpected-select.log" >/dev/null
then
  printf 'unexpected SELECT rejection had the wrong error\n' >&2
  cat "$RUN_ROOT/unexpected-select.log" >&2
  exit 1
fi
if grep -E -q '^COMMIT$' "$RUN_ROOT/unexpected-select.log"; then
  printf 'unexpected SELECT rejection committed\n' >&2
  cat "$RUN_ROOT/unexpected-select.log" >&2
  exit 1
fi
"${PSQL[@]}" -v negative_assert=1 -f "$SQL_FILE"
printf 'PASS: unexpected permissive SELECT policy rolled back\n'

printf 'PASS: program content progress write denial on %s\n' "$("$PG_BIN/postgres" --version)"
