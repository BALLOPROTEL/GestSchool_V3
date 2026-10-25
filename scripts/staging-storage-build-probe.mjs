import { main } from './staging-storage-probe.mjs';

const enabled = process.env.LOT14_STORAGE_PROBE;
if (enabled === 'true') await main();
else if (enabled !== undefined && enabled !== 'false') {
  process.stdout.write(
    `${JSON.stringify({ event: 'LOT14_STORAGE_PROBE', check: 'configuration', result: 'FAIL' })}\n`,
  );
  process.exitCode = 1;
}
