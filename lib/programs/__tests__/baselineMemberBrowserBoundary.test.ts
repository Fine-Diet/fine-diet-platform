import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function localImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const specs = Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g)).map((match) => match[1]);
  return specs.flatMap((spec) => {
    if (spec.startsWith('@/')) {
      return [path.join(ROOT, spec.slice(2))];
    }
    if (spec.startsWith('.')) {
      return [path.resolve(path.dirname(file), spec)];
    }
    return [];
  });
}

function resolveExisting(specPath: string): string | null {
  const candidates = [
    specPath,
    `${specPath}.ts`,
    `${specPath}.tsx`,
    path.join(specPath, 'index.ts'),
    path.join(specPath, 'index.tsx'),
  ];
  return candidates.find((candidate) => {
    if (!fs.existsSync(candidate)) return false;
    return fs.statSync(candidate).isFile();
  }) ?? null;
}

function dependencyFiles(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const spec of localImports(current)) {
      const resolved = resolveExisting(spec);
      if (resolved) pending.push(resolved);
    }
  }
  return Array.from(seen);
}

describe('member browser import boundary', () => {
  it('does not reach the authored candidate from the member page or binding', () => {
    const page = path.join(ROOT, 'pages/journal/programs/[slug].tsx');
    const binding = path.join(ROOT, 'lib/programs/baselineMemberBinding.ts');
    const experience = path.join(ROOT, 'components/journal/programs/ProgramDeliveryExperience.tsx');
    const files = [
      ...dependencyFiles(page),
      ...dependencyFiles(binding),
      ...dependencyFiles(experience),
    ];
    const leaked = files.filter((file) =>
      file.endsWith('baselineDay0To21Candidate.ts')
      || file.endsWith('baselineMemberDraftImport.ts')
      || file.endsWith('programBlueprintStorage.ts'),
    );
    expect(leaked).toEqual([]);
    expect(files.some((file) => file.endsWith('baselineMemberBinding.ts'))).toBe(true);
  });
});
