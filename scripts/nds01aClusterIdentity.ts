import fs from 'fs';

import { startNdsFixture } from '../test/localdb/harness';

async function main(): Promise<void> {
  const fixture = await startNdsFixture();
  const version = await fixture.sql<{ version: string }>('SELECT version() AS version');
  const listen = await fixture.sql<{ listen_addresses: string }>('SHOW listen_addresses');
  const leftoverBefore = fixture.descriptor.dataDirectory;
  process.stdout.write(
    `${JSON.stringify(
      {
        postgresVersion: fixture.postgresVersion,
        versionRow: version[0],
        listenAddresses: listen[0],
        descriptor: fixture.descriptor,
        guard: fixture.guard,
        serverLogPath: fixture.serverLogPath,
      },
      null,
      2,
    )}\n`,
  );
  await fixture.destroy();
  process.stdout.write(
    `${JSON.stringify(
      {
        destroyed: true,
        dataDirectoryExists: fs.existsSync(leftoverBefore),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
