export function identifyCleanupEligibleBranch({ branches, targetRef, branchName, parentRef }) {
  if (typeof targetRef !== 'string' || !targetRef.trim()) throw new Error('Target project reference is empty');
  if (!Array.isArray(branches)) throw new Error('Branch inventory is not an array');
  const matches = branches.filter((branch) => branch?.project_ref === targetRef);
  if (matches.length !== 1) throw new Error('Target project is not exactly one branch');
  const branch = matches[0];
  if (branch.name !== branchName || branch.parent_project_ref !== parentRef) {
    throw new Error('Branch name or parent does not match the requested target');
  }
  if (branch.is_default || branch.persistent || branch.with_data !== false) {
    throw new Error('Branch is not an ephemeral zero-data nondefault branch');
  }
  if (typeof branch.project_ref !== 'string' || !branch.project_ref.trim()) {
    throw new Error('Verified branch has an empty project reference');
  }
  return branch;
}

export function armVerifiedBranchCleanup(evidence, branch) {
  if (typeof branch?.project_ref !== 'string' || !branch.project_ref.trim()) {
    throw new Error('Cannot arm cleanup without a nonempty independently verified project reference');
  }
  evidence.targetProjectRef = branch.project_ref;
  evidence.targetBranchName = branch.name;
  evidence.cleanup.armed = true;
}

export function assertBranchHealthy(branch) {
  if (branch?.preview_project_status !== 'ACTIVE_HEALTHY') {
    throw new Error('Branch preview database is not ACTIVE_HEALTHY');
  }
  return true;
}

export function validateProtectedPassfile(fileStat) {
  if (!fileStat?.isFile?.()) throw new Error('PGPASSFILE must identify an existing regular file');
  if ((fileStat.mode & 0o077) !== 0) throw new Error('PGPASSFILE permissions allow group or other access');
  return true;
}

export function parseExplainJsonOutput(stdout) {
  for (let start = 0; start < stdout.length; start += 1) {
    if (stdout[start] !== '[') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < stdout.length; end += 1) {
      const char = stdout[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '[') depth += 1;
      else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(stdout.slice(start, end + 1));
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.Plan) return parsed;
          } catch { /* keep scanning in case earlier output included bracket text */ }
          break;
        }
      }
    }
  }
  throw new Error('Could not find a complete EXPLAIN JSON array in psql output');
}

export function applyHostedSchemaAndMigration(evidence, applyFixture, applyMigration) {
  evidence.hostedDatabaseWrites = true;
  evidence.hostedSetupCompleted = false;
  evidence.candidateMigrationCompleted = false;
  applyFixture();
  evidence.hostedSetupCompleted = true;
  applyMigration();
  evidence.candidateMigrationCompleted = true;
}

export async function serviceRoleAuthoringCrud(client, table, rowId) {
  const updateResult = await client.from(table)
    .update({ status: 'published' }).eq('id', rowId).select('id');
  const deleteResult = await client.from(table)
    .delete().eq('id', rowId).select('id');
  return { updateResult, deleteResult };
}

export async function deleteAndVerifyBranch({
  targetProjectRef,
  branchRecord,
  parentRef,
  deleteBranch,
  listBranches,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 90_000,
}) {
  if (typeof targetProjectRef !== 'string' || !targetProjectRef.trim()) {
    throw new Error('Refusing branch deletion without a nonempty verified project reference');
  }
  if (
    branchRecord?.project_ref !== targetProjectRef || !branchRecord?.name ||
    branchRecord?.parent_project_ref !== parentRef || branchRecord?.is_default ||
    branchRecord?.persistent || branchRecord?.with_data !== false
  ) {
    throw new Error('Refusing branch deletion because the target reference is not bound to verified branch identity');
  }
  await deleteBranch(targetProjectRef);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const branches = await listBranches();
    if (!Array.isArray(branches)) throw new Error('Branch inventory response is not an array');
    if (!branches.some((branch) => branch?.project_ref === targetProjectRef)) return true;
    await wait(Math.min(3000, Math.max(0, deadline - Date.now())));
  }
  throw new Error('Temporary branch deletion absence was not verified before timeout');
}
