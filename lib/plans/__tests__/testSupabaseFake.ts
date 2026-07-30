/**
 * Minimal in-memory fake of the Supabase PostgREST query builder, scoped to
 * exactly the operations `groceryListService.ts` issues against
 * `generated_grocery_lists` and `grocery_items`. Not a general-purpose
 * Supabase mock — just enough chaining (`select/eq/neq/is/in/contains/order`
 * + `insert/update/delete` + `single/maybeSingle`/await-as-array) to let the
 * service's multi-step flows run against real, mutable table state instead
 * of a brittle hand-wired mock per call.
 *
 * Also emulates a single partial-unique-index style constraint (one active
 * default list per person) so `ensureDefaultGroceryList` /
 * `unarchiveGroceryList` conflict handling can be exercised.
 */

export type Row = Record<string, unknown>;

interface UniqueConstraint {
  /** Whether this row participates in the constrained set at all. */
  participates: (row: Row) => boolean;
  /** Uniqueness key among participating rows. */
  key: (row: Row) => string;
  message: string;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createFakeSupabase(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const uniqueConstraints: Record<string, UniqueConstraint[]> = {
    generated_grocery_lists: [
      {
        participates: (row) => row.is_default === true && row.archived_at == null,
        key: (row) => String(row.person_id),
        message: 'duplicate key value violates unique constraint "idx_grocery_lists_person_default"',
      },
    ],
  };

  function table(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function checkUniqueConstraints(tableName: string, candidate: Row, excludeId?: unknown) {
    for (const constraint of uniqueConstraints[tableName] ?? []) {
      if (!constraint.participates(candidate)) continue;
      const key = constraint.key(candidate);
      const conflict = table(tableName).some(
        (row) => row.id !== excludeId && constraint.participates(row) && constraint.key(row) === key,
      );
      if (conflict) {
        return { code: '23505', message: constraint.message };
      }
    }
    return null;
  }

  function matchesFilters(row: Row, filters: Array<(row: Row) => boolean>): boolean {
    return filters.every((f) => f(row));
  }

  function from(tableName: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let insertRows: Row[] = [];
    let updatePatch: Row = {};
    let countOnly = false;
    let orderCol: string | null = null;
    let orderAsc = true;

    function rowsMatching(): Row[] {
      return table(tableName).filter((row) => matchesFilters(row, filters));
    }

    function applyOrder(rows: Row[]): Row[] {
      if (!orderCol) return rows;
      const col = orderCol;
      return [...rows].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return orderAsc ? cmp : -cmp;
      });
    }

    async function execute(kind: 'single' | 'maybeSingle' | 'many'): Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
      count?: number;
    }> {
      if (mode === 'select') {
        if (countOnly) {
          return { data: null, error: null, count: rowsMatching().length };
        }
        const rows = applyOrder(rowsMatching()).map((r) => ({ ...r }));
        if (kind === 'single') {
          if (rows.length !== 1) {
            return { data: null, error: { message: `expected exactly one row, got ${rows.length}` } };
          }
          return { data: rows[0], error: null };
        }
        if (kind === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      if (mode === 'insert') {
        const now = new Date().toISOString();
        const created: Row[] = [];
        for (const raw of insertRows) {
          const row: Row = {
            id: nextId(tableName),
            created_at: now,
            updated_at: now,
            ...raw,
          };
          const conflict = checkUniqueConstraints(tableName, row);
          if (conflict) return { data: null, error: conflict };
          created.push(row);
        }
        table(tableName).push(...created);
        const out = created.map((r) => ({ ...r }));
        if (kind === 'single') return { data: out[0] ?? null, error: null };
        if (kind === 'maybeSingle') return { data: out[0] ?? null, error: null };
        return { data: out, error: null };
      }

      if (mode === 'update') {
        const targets = rowsMatching();
        for (const row of targets) {
          const candidate = { ...row, ...updatePatch };
          const conflict = checkUniqueConstraints(tableName, candidate, row.id);
          if (conflict) return { data: null, error: conflict };
        }
        for (const row of targets) {
          Object.assign(row, updatePatch, { updated_at: new Date().toISOString() });
        }
        const out = targets.map((r) => ({ ...r }));
        if (kind === 'single') {
          if (out.length !== 1) {
            return { data: null, error: { message: `expected exactly one row, got ${out.length}` } };
          }
          return { data: out[0], error: null };
        }
        if (kind === 'maybeSingle') return { data: out[0] ?? null, error: null };
        return { data: out, error: null };
      }

      // delete
      const targets = rowsMatching();
      tables[tableName] = table(tableName).filter((row) => !targets.includes(row));
      const out = targets.map((r) => ({ ...r }));
      if (kind === 'single') return { data: out[0] ?? null, error: null };
      if (kind === 'maybeSingle') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }

    const builder: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        countOnly = Boolean(opts?.head && opts?.count);
        return builder;
      },
      insert(rows: Row | Row[]) {
        mode = 'insert';
        insertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      update(patch: Row) {
        mode = 'update';
        updatePatch = patch;
        return builder;
      },
      delete() {
        mode = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((row) => (val === null ? row[col] === null || row[col] === undefined : row[col] === val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      contains(col: string, obj: Record<string, unknown>) {
        filters.push((row) => {
          const value = (row[col] ?? {}) as Record<string, unknown>;
          return Object.entries(obj).every(([k, v]) => value[k] === v);
        });
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      single() {
        return execute('single');
      },
      maybeSingle() {
        return execute('maybeSingle');
      },
      then(onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) {
        return execute('many').then(onResolve, onReject);
      },
    };

    return builder;
  }

  return {
    from,
    tables,
    getTable: (name: string) => table(name),
  };
}
