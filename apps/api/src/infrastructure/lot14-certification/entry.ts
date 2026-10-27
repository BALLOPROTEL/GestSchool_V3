import { certificationEnabled } from './config.js';
import { certify } from './orchestrator.js';
import { productionTasks } from './runtime.js';
import { rootFailure } from './diagnostics.js';
import type { SafeRecord } from './orchestrator.js';
const emit = (record: SafeRecord) => {
  process.stdout.write(`${JSON.stringify(record)}\n`);
};

try {
  if (!certificationEnabled(process.env)) throw new Error();
  const port = Number(process.argv[2]);
  if (process.argv.length !== 3 || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error();
  await certify(productionTasks(port, process.env, emit), emit);
} catch (error) {
  emit({
    check: 'LOT14_CERTIFICATION',
    status: 'FAIL',
    ...(rootFailure(error) ?? { code: 'RUN_FAILED' as const }),
  });
  process.exitCode = 1;
}
