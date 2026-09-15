/**
 * Resolve pinned embedded PostgreSQL binaries for the current runtime.
 *
 * Platform packages are optionalDependencies at a single pinned version. npm
 * skips an incompatible optional package instead of failing the whole install
 * (the EBADPLATFORM defect of an unconditional darwin-arm64 root dependency).
 * Absence of the current platform's binaries is a hard error at launch time,
 * not a silent fallback to another architecture.
 */

import fs from 'fs';
import path from 'path';

export const EMBEDDED_POSTGRES_VERSION = '17.10.0-beta.17';

/** npm package name keyed by `${process.platform}-${process.arch}`. */
export const EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME = {
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
  'linux-x64': '@embedded-postgres/linux-x64',
} as const;

export type EmbeddedPostgresRuntimeKey = keyof typeof EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME;

export function embeddedPostgresRuntimeKey(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  return `${platform}-${arch}`;
}

export function isSupportedEmbeddedPostgresRuntime(
  platform: string = process.platform,
  arch: string = process.arch,
): platform is NodeJS.Platform & string {
  return embeddedPostgresRuntimeKey(platform, arch) in EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME;
}

export function embeddedPostgresPackageName(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  const key = embeddedPostgresRuntimeKey(platform, arch);
  const pkg = EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME[key as EmbeddedPostgresRuntimeKey];
  if (!pkg) {
    throw new Error(
      `No pinned embedded PostgreSQL binaries for ${key}. ` +
        `Supported runtimes: ${Object.keys(EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME).join(', ')} ` +
        `at ${EMBEDDED_POSTGRES_VERSION}.`,
    );
  }
  return pkg;
}

export function resolveEmbeddedPostgresBinDir(options: {
  cwd?: string;
  platform?: string;
  arch?: string;
} = {}): string {
  const pkg = embeddedPostgresPackageName(options.platform, options.arch);
  const cwd = options.cwd ?? process.cwd();
  const parts = pkg.split('/');
  return path.join(cwd, 'node_modules', ...parts, 'native', 'bin');
}

export function assertEmbeddedPostgresBinaries(binDir: string): void {
  const postgres = path.join(binDir, 'postgres');
  if (!fs.existsSync(postgres)) {
    const key = embeddedPostgresRuntimeKey();
    const pkg = isSupportedEmbeddedPostgresRuntime()
      ? embeddedPostgresPackageName()
      : '(unsupported runtime)';
    throw new Error(
      `Pinned PostgreSQL binaries are missing at ${binDir}. ` +
        `Install optionalDependency ${pkg}@${EMBEDDED_POSTGRES_VERSION} ` +
        `for this runtime (${key}). Local disposable PostgreSQL verification ` +
        'cannot substitute a different architecture.',
    );
  }
}
