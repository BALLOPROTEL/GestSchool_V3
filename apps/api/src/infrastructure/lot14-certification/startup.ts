import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { certificationEnabled, childBudgetMs, failure, scenarios } from './config.js';
import type { SafeRecord } from './orchestrator.js';
import { authFailureSchema, authStateSchema } from './diagnostics.js';

function safeOutput(stdout: string): SafeRecord[] {
  const records: SafeRecord[] = [];
  for (const line of stdout.trim().split('\n')) {
    const data: unknown = JSON.parse(line);
    if (!data || typeof data !== 'object') throw failure();
    const row = data as SafeRecord;
    if (!['PASS', 'FAIL', 'SKIP'].includes(row.status)) throw failure();
    if (row.check === 'LOT14_AUTH_STATE') {
      records.push(authStateSchema.parse(data));
    } else if (row.check === 'LOT14_TENANT_AB_CASE' && scenarios.includes(row.case!)) {
      records.push({
        check: row.check,
        status: row.status,
        case: row.case!,
        ...(row.code === 'ASSERTION_FAILED' || row.code === 'PREPARATION_FAILED'
          ? { code: row.code }
          : {}),
      });
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
        ...(row.code === 'TENANT_AB_FAILED' ? { code: row.code } : {}),
        ...(row.status === 'PASS'
          ? { workflow: 'report' as const, terminal: 'completed' as const }
          : {}),
      });
    } else if (row.check === 'LOT14_CERTIFICATION') {
      const details = row.status === 'FAIL' ? authFailureSchema.safeParse(data) : undefined;
      records.push({
        check: row.check,
        status: row.status,
        ...(details?.success
          ? details.data
          : ['RUN_FAILED', 'CLEANUP_FAILED'].includes(row.code ?? '')
            ? { code: row.code as 'RUN_FAILED' | 'CLEANUP_FAILED' }
            : {}),
      });
    } else throw failure();
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
  const core = records.filter((row) => row.check !== 'LOT14_AUTH_STATE');
  const cases = core.filter((row) => row.check === 'LOT14_TENANT_AB_CASE');
  const invalid =
    !outcome.ok ||
    core.length !== 17 ||
    cases.length !== 14 ||
    cases.some((row, index) => row.case !== scenarios[index] || row.status !== 'PASS') ||
    core[14]?.check !== 'LOT14_TENANT_AB' ||
    core[14].status !== 'PASS' ||
    core[14].pass !== 14 ||
    core[14].fail !== 0 ||
    core[14].skip !== 0 ||
    core[15]?.check !== 'LOT14_WORKER_E2E' ||
    core[15].status !== 'PASS' ||
    core[16]?.check !== 'LOT14_CERTIFICATION' ||
    core[16].status !== 'PASS';
  if (outcome.ok && invalid) throw failure();
  // Child exit zero alone is insufficient; require the complete exact matrix and terminal result.
  for (const row of records) {
    // A failed/timed-out process can never publish an overall PASS.
    if (!outcome.ok && row.check === 'LOT14_CERTIFICATION' && row.status === 'PASS') continue;
    emit(JSON.stringify(row));
  }
  if (invalid) throw failure();
}
