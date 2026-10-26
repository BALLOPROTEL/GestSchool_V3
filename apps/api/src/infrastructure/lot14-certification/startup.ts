import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { certificationEnabled, childBudgetMs, failure, scenarios } from './config.js';
import type { SafeRecord } from './orchestrator.js';

function safeOutput(stdout: string): SafeRecord[] {
  const records: SafeRecord[] = [];
  for (const line of stdout.trim().split('\n')) {
    const data: unknown = JSON.parse(line);
    if (!data || typeof data !== 'object') throw failure();
    const row = data as SafeRecord;
    if (!['PASS', 'FAIL', 'SKIP'].includes(row.status)) throw failure();
    if (row.check === 'LOT14_TENANT_AB_CASE' && scenarios.includes(row.case!)) {
      records.push({ check: row.check, status: row.status, case: row.case! });
    } else if (
      row.check === 'LOT14_TENANT_AB' &&
      [row.pass, row.fail, row.skip].every(
        (value) => Number.isInteger(value) && value! >= 0 && value! <= 14,
      )
    ) {
      records.push({
        check: row.check,
        status: row.status,
        pass: row.pass!,
        fail: row.fail!,
        skip: row.skip!,
      });
    } else if (
      row.check === 'LOT14_WORKER_E2E' &&
      (row.status !== 'PASS' || (row.workflow === 'report' && row.terminal === 'completed'))
    ) {
      records.push({
        check: row.check,
        status: row.status,
        ...(row.status === 'PASS'
          ? { workflow: 'report' as const, terminal: 'completed' as const }
          : {}),
      });
    } else if (row.check === 'LOT14_CERTIFICATION')
      records.push({ check: row.check, status: row.status });
    else throw failure();
  }
  return records;
}

export async function runStagingCertification(
  port: number,
  environment = process.env,
  emit: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Promise<void> {
  if (!certificationEnabled(environment)) return;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw failure();
  const outcome = await new Promise<{ ok: boolean; stdout: string }>((resolve) => {
    let child: ReturnType<typeof execFile> | undefined;
    let interrupted = false;
    let forceStop: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      interrupted = true;
      try {
        child?.kill('SIGTERM');
        forceStop ??= setTimeout(() => {
          try {
            child?.kill('SIGKILL');
          } catch {
            /* Safe boundary. */
          }
        }, 25_000);
      } catch {
        /* Safe boundary. */
      }
    };
    const cleanup = () => {
      clearTimeout(forceStop);
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    };
    try {
      child = execFile(
        process.execPath,
        [fileURLToPath(new URL('entry.js', import.meta.url)), String(port)],
        {
          env: environment,
          shell: false,
          encoding: 'utf8',
          timeout: childBudgetMs,
          killSignal: 'SIGKILL',
          maxBuffer: 65_536,
          windowsHide: true,
        },
        (error, stdout) => {
          cleanup();
          resolve({ ok: !error && !interrupted, stdout });
        },
      );
      process.once('SIGTERM', stop);
      process.once('SIGINT', stop);
      child.stdin?.end();
    } catch {
      stop();
      if (!child) {
        cleanup();
        resolve({ ok: false, stdout: '' });
      }
    }
  });
  let records: SafeRecord[];
  try {
    records = safeOutput(outcome.stdout);
  } catch {
    throw failure();
  }
  const cases = records.filter((row) => row.check === 'LOT14_TENANT_AB_CASE');
  const invalid =
    !outcome.ok ||
    records.length !== 17 ||
    cases.length !== 14 ||
    cases.some((row, index) => row.case !== scenarios[index] || row.status !== 'PASS') ||
    records[14]?.check !== 'LOT14_TENANT_AB' ||
    records[14].status !== 'PASS' ||
    records[14].pass !== 14 ||
    records[14].fail !== 0 ||
    records[14].skip !== 0 ||
    records[15]?.check !== 'LOT14_WORKER_E2E' ||
    records[15].status !== 'PASS' ||
    records[16]?.check !== 'LOT14_CERTIFICATION' ||
    records[16].status !== 'PASS';
  if (outcome.ok && invalid) throw failure();
  // Child exit zero alone is insufficient; require the complete exact matrix and terminal result.
  for (const row of records) {
    // A failed/timed-out process can never publish an overall PASS.
    if (!outcome.ok && row.check === 'LOT14_CERTIFICATION' && row.status === 'PASS') continue;
    emit(JSON.stringify(row));
  }
  if (invalid) throw failure();
}
