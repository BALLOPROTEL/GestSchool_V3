import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { certificationEnabled, roles, runBudgetMs, scenarios } from './config.js';
import { certify, type CertificationTasks, type SafeRecord } from './orchestrator.js';
import { requireStatus } from './http.js';

export const environment = (): NodeJS.ProcessEnv => ({
  LOT14_CERTIFICATION_RUN: 'true',
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  IAM_ENV: 'staging',
  APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app',
  DATABASE_URL: `postgresql://test:${randomUUID()}@dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com/gestschool_v3_postgres_staging?sslmode=verify-full`,
  ...Object.fromEntries(
    ['A', 'B'].flatMap((label) =>
      roles.map((role) => [
        `LOT14_BOOTSTRAP_${label}_${role}_PASSWORD`,
        randomBytes(24).toString('base64url'),
      ]),
    ),
  ),
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('certification deployment guards', () => {
  it.each([undefined, 'false'])(
    'is off with flag %s without reading secrets or requiring staging',
    (flag) => {
      expect(
        certificationEnabled(flag === undefined ? {} : { LOT14_CERTIFICATION_RUN: flag }),
      ).toBe(false);
    },
  );
  it('permits only the exact staged runtime with eight independent passwords', () =>
    expect(certificationEnabled(environment())).toBe(true));
  it.each(['', '1', 'TRUE', ' true', 'false ', 'yes'])('refuses invalid flag %s', (flag) => {
    expect(() => certificationEnabled({ ...environment(), LOT14_CERTIFICATION_RUN: flag })).toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
  });
  it.each([
    { APP_ENV: 'production' },
    { APP_ENV: 'local' },
    { APP_ENV: 'development' },
    { APP_ENV: undefined },
    { NODE_ENV: 'development' },
    { IAM_ENV: 'local' },
    { IAM_ENV: 'production' },
    { APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app/' },
    { DATABASE_URL: 'postgresql://localhost/gestschool' },
    { DATABASE_URL: 'postgresql://localhost/production' },
    { DATABASE_URL: undefined },
    { LOT14_BOOTSTRAP_A_STUDENT_PASSWORD: undefined },
  ])('rejects unsafe or missing configuration %#', (changes) => {
    expect(() => certificationEnabled({ ...environment(), ...changes })).toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
  });
  it('rejects shared credentials', () => {
    const env = environment();
    env.LOT14_BOOTSTRAP_A_STUDENT_PASSWORD = env.LOT14_BOOTSTRAP_A_PARENT_PASSWORD;
    expect(() => certificationEnabled(env)).toThrow('LOT14_CERTIFICATION_FAILED');
  });
});
function tasks(): CertificationTasks {
  return {
    prepare: vi.fn(async () => {}),
    scenario: vi.fn(async () => {}),
    worker: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}
describe('certification accounting and cleanup', () => {
  it('reports each of the 14 cases and only then runs the worker', async () => {
    const task = tasks(),
      records: SafeRecord[] = [];
    await certify(task, (record) => records.push(record));
    expect(records.slice(0, 14).map((row) => row.case)).toEqual(scenarios);
    expect(records[14]).toEqual({
      check: 'LOT14_TENANT_AB',
      status: 'PASS',
      pass: 14,
      fail: 0,
      skip: 0,
    });
    expect(records[15]).toEqual({
      check: 'LOT14_WORKER_E2E',
      status: 'PASS',
      workflow: 'report',
      terminal: 'completed',
    });
    expect(task.close).toHaveBeenCalledOnce();
    expect(vi.mocked(task.scenario).mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(task.worker).mock.invocationCallOrder[0]!,
    );
  });
  it.each(scenarios.map((_, index) => index))(
    'does not hide failure in scenario %s or launch a worker',
    async (index) => {
      const task = tasks(),
        records: SafeRecord[] = [];
      vi.mocked(task.scenario).mockImplementation(async (number) => {
        if (number === index) throw new Error('secret-driver-canary');
      });
      await expect(certify(task, (record) => records.push(record))).rejects.toThrow(
        'LOT14_CERTIFICATION_FAILED',
      );
      expect(records[14]).toMatchObject({ status: 'FAIL', pass: 13, fail: 1, skip: 0 });
      expect(records[index]).toMatchObject({ status: 'FAIL' });
      expect(task.worker).not.toHaveBeenCalled();
      expect(task.close).toHaveBeenCalledOnce();
      expect(JSON.stringify(records)).not.toContain('secret-driver-canary');
    },
  );
  it('counts preparation failure as 14 FAIL rather than SKIP, and closes clients', async () => {
    const task = tasks(),
      records: SafeRecord[] = [];
    vi.mocked(task.prepare).mockRejectedValue(new Error('private-runtime-canary'));
    await expect(certify(task, (record) => records.push(record))).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    expect(records[14]).toMatchObject({ pass: 0, fail: 14, skip: 0 });
    expect(task.scenario).not.toHaveBeenCalled();
    expect(task.worker).not.toHaveBeenCalled();
    expect(task.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(records)).not.toContain('private-runtime-canary');
  });
  it('preserves a worker FAIL after a successful tenant matrix', async () => {
    const task = tasks(),
      records: SafeRecord[] = [];
    vi.mocked(task.worker).mockRejectedValue(new Error('private-provider-canary'));
    await expect(certify(task, (record) => records.push(record))).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    expect(records[15]).toMatchObject({ check: 'LOT14_WORKER_E2E', status: 'FAIL' });
    expect(task.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(records)).not.toContain('private-provider-canary');
  });
  it('cleanup failure refuses certification', async () => {
    const task = tasks();
    vi.mocked(task.close).mockRejectedValue(new Error('private-close-canary'));
    await expect(certify(task, () => {})).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
  });
  it('aborts a hung cooperative request at the fixed total budget and cleans up', async () => {
    vi.useFakeTimers();
    const task = tasks();
    vi.mocked(task.prepare).mockImplementation(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('timeout'))),
        ),
    );
    const result = expect(certify(task, () => {})).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
    await vi.advanceTimersByTimeAsync(runBudgetMs);
    await result;
    expect(task.close).toHaveBeenCalledOnce();
    expect(task.worker).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([200, 400, 401, 403, 500, 503])(
    'does not treat HTTP %s as the required 404 isolation contract',
    (status) => {
      expect(() =>
        requireStatus(
          {
            status,
            body: { code: 'PERSON_NOT_FOUND' },
            data: {},
            bytes: Buffer.alloc(0),
            headers: {},
          },
          404,
          'PERSON_NOT_FOUND',
        ),
      ).toThrow();
    },
  );
  it('also refuses a 404 from the wrong endpoint/contract', () => {
    expect(() =>
      requireStatus(
        {
          status: 404,
          body: { code: 'ROUTE_NOT_FOUND' },
          data: {},
          bytes: Buffer.alloc(0),
          headers: {},
        },
        404,
        'PERSON_NOT_FOUND',
      ),
    ).toThrow();
  });
});
