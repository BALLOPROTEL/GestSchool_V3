import { failure, runBudgetMs, scenarios } from './config.js';
import { CertificationAuthFailure, rootFailure, type AuthFailureDetails } from './diagnostics.js';

export type Verdict = 'PASS' | 'FAIL' | 'SKIP';
export interface CertificationTasks {
  prepare(signal: AbortSignal): Promise<void>;
  scenario(index: number, signal: AbortSignal): Promise<void>;
  worker(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}
export interface SafeRecord extends Partial<Omit<AuthFailureDetails, 'code'>> {
  check:
    | 'LOT14_TENANT_AB_CASE'
    | 'LOT14_TENANT_AB'
    | 'LOT14_WORKER_E2E'
    | 'LOT14_CERTIFICATION'
    | 'LOT14_AUTH_STATE';
  status: Verdict;
  case?: (typeof scenarios)[number];
  pass?: number;
  fail?: number;
  skip?: number;
  code?:
    | 'ASSERTION_FAILED'
    | 'PREPARATION_FAILED'
    | 'TENANT_AB_FAILED'
    | 'CLEANUP_FAILED'
    | 'RUN_FAILED'
    | AuthFailureDetails['code'];
  tenants?: number;
  users?: number;
  memberships?: number;
  adminMfaEnrolled?: number;
  activeSessions?: number;
  expiredSessions?: number;
  unusedMfaChallenges?: number;
  usedMfaChallenges?: number;
  expiredMfaChallenges?: number;
  workflow?: 'report';
  terminal?: 'completed';
}

/** Catch opaque errors at the boundary: no exception message or response body reaches diagnostics. */
export async function certify(
  tasks: CertificationTasks,
  emit: (record: SafeRecord) => void,
): Promise<void> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  const deadline = setTimeout(stop, runBudgetMs);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let prepared = false;
  let passed = 0;
  let failed = 0;
  let ok = false;
  let preparationFailure: AuthFailureDetails | undefined;
  try {
    try {
      await tasks.prepare(abort.signal);
      abort.signal.throwIfAborted();
      prepared = true;
    } catch (error) {
      preparationFailure = rootFailure(error);
      if (preparationFailure)
        emit({ check: 'LOT14_CERTIFICATION', status: 'FAIL', ...preparationFailure });
      /* Every blocked case is FAIL, never silently skipped. */
    }
    for (const [index, name] of scenarios.entries()) {
      let status: Verdict = 'FAIL';
      if (prepared) {
        try {
          abort.signal.throwIfAborted();
          await tasks.scenario(index, abort.signal);
          abort.signal.throwIfAborted();
          status = 'PASS';
        } catch (error) {
          const root = rootFailure(error);
          if (root) emit({ check: 'LOT14_CERTIFICATION', status: 'FAIL', ...root });
          /* Sanitized below. */
        }
      }
      if (status === 'PASS') passed++;
      else failed++;
      emit({
        check: 'LOT14_TENANT_AB_CASE',
        case: name,
        status,
        ...(status === 'FAIL'
          ? { code: prepared ? ('ASSERTION_FAILED' as const) : ('PREPARATION_FAILED' as const) }
          : {}),
      });
    }
    emit({
      check: 'LOT14_TENANT_AB',
      status: failed ? 'FAIL' : 'PASS',
      pass: passed,
      fail: failed,
      skip: 0,
    });
    if (failed) {
      emit({ check: 'LOT14_WORKER_E2E', status: 'SKIP', code: 'TENANT_AB_FAILED' });
    } else {
      try {
        abort.signal.throwIfAborted();
        await tasks.worker(abort.signal);
        abort.signal.throwIfAborted();
        emit({
          check: 'LOT14_WORKER_E2E',
          status: 'PASS',
          workflow: 'report',
          terminal: 'completed',
        });
        ok = true;
      } catch (error) {
        const root = rootFailure(error);
        if (root) emit({ check: 'LOT14_CERTIFICATION', status: 'FAIL', ...root });
        emit({ check: 'LOT14_WORKER_E2E', status: 'FAIL', code: 'ASSERTION_FAILED' });
      }
    }
  } finally {
    clearTimeout(deadline);
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    try {
      await tasks.close();
    } catch {
      ok = false;
      emit({ check: 'LOT14_CERTIFICATION', status: 'FAIL', code: 'CLEANUP_FAILED' });
    }
  }
  if (!ok) throw preparationFailure ? new CertificationAuthFailure(preparationFailure) : failure();
  emit({ check: 'LOT14_CERTIFICATION', status: 'PASS' });
}
