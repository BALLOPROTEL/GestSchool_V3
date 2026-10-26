import { certificationEnabled } from './config.js';
import { certify } from './orchestrator.js';
import { productionTasks } from './runtime.js';

try {
  if (!certificationEnabled(process.env)) throw new Error();
  const port = Number(process.argv[2]);
  if (process.argv.length !== 3 || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error();
  await certify(productionTasks(port, process.env), (record) => {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  });
} catch {
  process.stdout.write('{"check":"LOT14_CERTIFICATION","status":"FAIL","code":"RUN_FAILED"}\n');
  process.exitCode = 1;
}
