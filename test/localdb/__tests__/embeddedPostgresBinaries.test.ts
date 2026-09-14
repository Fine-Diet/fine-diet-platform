import path from 'path';

import {
  EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME,
  EMBEDDED_POSTGRES_VERSION,
  assertEmbeddedPostgresBinaries,
  embeddedPostgresPackageName,
  embeddedPostgresRuntimeKey,
  resolveEmbeddedPostgresBinDir,
} from '../embeddedPostgresBinaries';

describe('embedded PostgreSQL platform binaries', () => {
  it('pins a single version across supported runtimes', () => {
    expect(EMBEDDED_POSTGRES_VERSION).toBe('17.10.0-beta.17');
    expect(Object.keys(EMBEDDED_POSTGRES_PACKAGE_BY_RUNTIME).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
    ]);
  });

  it('maps linux/x64 and darwin/arm64 without cross-wiring architectures', () => {
    expect(embeddedPostgresRuntimeKey('linux', 'x64')).toBe('linux-x64');
    expect(embeddedPostgresPackageName('linux', 'x64')).toBe('@embedded-postgres/linux-x64');
    expect(embeddedPostgresPackageName('darwin', 'arm64')).toBe(
      '@embedded-postgres/darwin-arm64',
    );
    expect(resolveEmbeddedPostgresBinDir({ cwd: '/tmp/app', platform: 'linux', arch: 'x64' })).toBe(
      path.join('/tmp/app', 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin'),
    );
  });

  it('refuses an unsupported runtime instead of substituting another binary', () => {
    expect(() => embeddedPostgresPackageName('win32', 'x64')).toThrow(/win32-x64/);
  });

  it('fails closed when the current platform package is not installed', () => {
    const missing = path.join('/tmp', 'definitely-missing-nds01c-pg', 'native', 'bin');
    expect(() => assertEmbeddedPostgresBinaries(missing)).toThrow(
      /Pinned PostgreSQL binaries are missing/,
    );
  });
});
