import { execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = new URL('../../../../', import.meta.url);
const script = fileURLToPath(new URL('scripts/staging-bootstrap.mjs', repository));
const failureCode = 'LOT14_BOOTSTRAP_STARTUP_FAILED';

interface Outcome {
  ok: boolean;
  stdout: string;
}

function execute(environment: NodeJS.ProcessEnv): Promise<Outcome> {
  return new Promise((resolve) => {
    let child: ChildProcess | undefined;
    let interrupted = false;
    const stop = () => {
      interrupted = true;
      try {
        child?.kill('SIGKILL');
      } catch {
        /* Never expose process errors. */
      }
    };
    const cleanup = () => {
      process.off('SIGTERM', stop);
      process.off('SIGINT', stop);
    };
    try {
      child = execFile(
        process.execPath,
        [script, '--apply'],
        {
          cwd: fileURLToPath(repository),
          env: environment,
          shell: false,
          encoding: 'utf8',
          timeout: 120_000,
          killSignal: 'SIGKILL',
          maxBuffer: 16_384,
          windowsHide: true,
        },
        (error, stdout) => {
          // execFile calls back after the child has terminated and its pipes have closed.
          // stderr and error (which may embed driver output) are intentionally discarded.
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
      // If spawning succeeded, wait for execFile's termination callback after killing.
    }
  });
}

export async function runStagingBootstrapStartup(
  environment: NodeJS.ProcessEnv = process.env,
  emit: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Promise<void> {
  const flag = environment.LOT14_BOOTSTRAP_APPLY;
  if (flag === undefined || flag === 'false') return;
  if (
    flag !== 'true' ||
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging' ||
    environment.APP_PUBLIC_ORIGIN !== 'https://gestschool-v3-staging.vercel.app'
  )
    throw new Error(failureCode);

  const outcome = await execute(environment);
  let summary: { check: string; status: string; created: boolean } | undefined;
  if (outcome.ok) {
    try {
      const report: unknown = JSON.parse(outcome.stdout);
      if (
        typeof report === 'object' &&
        report !== null &&
        'check' in report &&
        report.check === 'LOT14_BOOTSTRAP' &&
        'status' in report &&
        report.status === 'PASS' &&
        'created' in report &&
        typeof report.created === 'boolean'
      ) {
        // Forward only constants and a boolean, never arbitrary child fields or text.
        summary = { check: 'LOT14_BOOTSTRAP', status: 'PASS', created: report.created };
      }
    } catch {
      /* Unexpected or extra output is fail-closed, without logging it. */
    }
  }
  if (!summary) throw new Error(failureCode);
  emit(JSON.stringify(summary));
}
