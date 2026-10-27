import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  kill: vi.fn(),
  end: vi.fn(),
  complete: undefined as
    ((error: Error | null, stdout: string, stderr: string) => void) | undefined,
}));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
import { runStagingCertification } from './startup.js';
import { childBudgetMs, roles, scenarios } from './config.js';
const env = (): NodeJS.ProcessEnv => ({
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
const report = () =>
  [
    ...scenarios.map((name) => ({ check: 'LOT14_TENANT_AB_CASE', status: 'PASS', case: name })),
    { check: 'LOT14_TENANT_AB', status: 'PASS', pass: 14, fail: 0, skip: 0 },
    { check: 'LOT14_WORKER_E2E', status: 'PASS', workflow: 'report', terminal: 'completed' },
    { check: 'LOT14_CERTIFICATION', status: 'PASS' },
  ]
    .map((row) => JSON.stringify(row))
    .join('\n');
let term: number, int: number;
beforeEach(() => {
  vi.resetAllMocks();
  term = process.listenerCount('SIGTERM');
  int = process.listenerCount('SIGINT');
  mocks.exec.mockImplementation((_cmd, _args, _options, callback) => {
    mocks.complete = callback;
    return { kill: mocks.kill, stdin: { end: mocks.end } };
  });
});
afterEach(() => {
  mocks.complete?.(new Error('CLEANUP'), '', '');
  mocks.complete = undefined;
  expect(process.listenerCount('SIGTERM')).toBe(term);
  expect(process.listenerCount('SIGINT')).toBe(int);
});
function complete(error: Error | null = null, output = report()) {
  const callback = mocks.complete!;
  mocks.complete = undefined;
  callback(error, output, 'private-stderr-canary');
}
describe('bounded certification startup process', () => {
  it.each([undefined, 'false'])('does not create a child with flag %s', async (flag) => {
    await runStagingCertification(3001, flag ? { LOT14_CERTIFICATION_RUN: flag } : {});
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('spawns a compiled runtime entry with only a public port argument, environment-only credentials and no shell', async () => {
    const environment = env(),
      emit = vi.fn();
    const run = runStagingCertification(3001, environment, emit);
    expect(mocks.exec.mock.calls[0]?.[0]).toBe(process.execPath);
    expect(mocks.exec.mock.calls[0]?.[1]).toEqual([
      expect.stringMatching(/\/lot14-certification\/entry\.js$/),
      '3001',
    ]);
    expect(mocks.exec.mock.calls[0]?.[2]).toMatchObject({
      env: environment,
      shell: false,
      timeout: childBudgetMs,
      killSignal: 'SIGKILL',
      maxBuffer: 65536,
    });
    expect(mocks.end).toHaveBeenCalledOnce();
    complete();
    await run;
    expect(emit).toHaveBeenCalledTimes(17);
    const diagnostics = JSON.stringify(emit.mock.calls);
    for (const secret of Object.values(environment).filter(
      (value) => value?.length && value.length > 25,
    )) {
      if (secret !== environment.APP_PUBLIC_ORIGIN) expect(diagnostics).not.toContain(secret);
    }
  });
  it.each(['nonzero', 'timeout', 'maxBuffer'])(
    'refuses child %s without exposing its error or stderr',
    async (reason) => {
      const emit = vi.fn(),
        run = expect(runStagingCertification(3001, env(), emit)).rejects.toThrow(
          'LOT14_CERTIFICATION_FAILED',
        );
      complete(new Error(`private-driver-canary-${reason}`), report());
      await run;
      expect(JSON.stringify(emit.mock.calls)).not.toMatch(/private-driver|private-stderr/);
    },
  );
  it.each(['', 'not JSON', '{}', report().split('\n').slice(1).join('\n')])(
    'does not accept incomplete or invalid exit-zero output %#',
    async (output) => {
      const run = expect(runStagingCertification(3001, env(), () => {})).rejects.toThrow(
        'LOT14_CERTIFICATION_FAILED',
      );
      complete(null, output);
      await run;
    },
  );
  it('reconstructs only safe fields from child output', async () => {
    const emit = vi.fn(),
      run = runStagingCertification(3001, env(), emit);
    complete(
      null,
      report()
        .split('\n')
        .map((line) => JSON.stringify({ ...JSON.parse(line), extra: 'private-stdout-canary' }))
        .join('\n'),
    );
    await run;
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-stdout-canary');
  });
  it('does not publish a PASS from an incomplete exit-zero matrix', async () => {
    const emit = vi.fn();
    const run = expect(runStagingCertification(3001, env(), emit)).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    complete(null, report().split('\n').slice(1).join('\n'));
    await run;
    expect(emit).not.toHaveBeenCalled();
  });
  it('does not invent a successful worker terminal from malformed output', async () => {
    const emit = vi.fn();
    const run = expect(runStagingCertification(3001, env(), emit)).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    complete(null, report().replace('"terminal":"completed"', '"terminal":"failed"'));
    await run;
    expect(emit).not.toHaveBeenCalled();
  });
  it('kills on interruption and awaits the termination callback', async () => {
    const run = expect(runStagingCertification(3001, env(), () => {})).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    process.emit('SIGTERM');
    expect(mocks.kill).toHaveBeenCalledWith('SIGTERM');
    complete(new Error('interrupted'), '');
    await run;
  });
  it('forwards the whitelisted root code and correlation ID on nonzero exit, without extra child fields', async () => {
    const emit = vi.fn();
    const requestId = randomUUID();
    const run = expect(runStagingCertification(3001, env(), emit)).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
    complete(
      new Error('private-driver-canary'),
      JSON.stringify({
        check: 'LOT14_CERTIFICATION',
        status: 'FAIL',
        code: 'AUTH_LOGIN_UNAVAILABLE',
        operation: 'LOGIN',
        httpStatus: 503,
        requestId,
        responseCode: 'AUTH_UNAVAILABLE',
        extra: 'private-stdout-canary',
      }),
    );
    await run;
    expect(JSON.parse(emit.mock.calls[0]![0])).toEqual({
      check: 'LOT14_CERTIFICATION',
      status: 'FAIL',
      code: 'AUTH_LOGIN_UNAVAILABLE',
      operation: 'LOGIN',
      httpStatus: 503,
      requestId,
      responseCode: 'AUTH_UNAVAILABLE',
    });
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-');
  });
  it('allows only the bounded safe state counters before an otherwise complete PASS', async () => {
    const emit = vi.fn();
    const run = runStagingCertification(3001, env(), emit);
    complete(
      null,
      JSON.stringify({
        check: 'LOT14_AUTH_STATE',
        status: 'PASS',
        tenants: 2,
        users: 8,
        memberships: 8,
        adminMfaEnrolled: 2,
        activeSessions: 1,
        expiredSessions: 0,
        unusedMfaChallenges: 0,
        usedMfaChallenges: 4,
        expiredMfaChallenges: 0,
        extra: 'private-stdout-canary',
      }) +
        '\n' +
        report(),
    );
    await run;
    expect(emit).toHaveBeenCalledTimes(18);
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-');
  });
  it('preserves PREPARATION_FAILED and the reason for the conditional worker SKIP', async () => {
    const emit = vi.fn(),
      run = expect(runStagingCertification(3001, env(), emit)).rejects.toThrow(
        'LOT14_CERTIFICATION_FAILED',
      );
    const rows = report()
      .split('\n')
      .map((line) => JSON.parse(line));
    for (let index = 0; index < 14; index++)
      rows[index] = { ...rows[index], status: 'FAIL', code: 'PREPARATION_FAILED' };
    rows[14] = { check: 'LOT14_TENANT_AB', status: 'FAIL', pass: 0, fail: 14, skip: 0 };
    rows[15] = { check: 'LOT14_WORKER_E2E', status: 'SKIP', code: 'TENANT_AB_FAILED' };
    rows[16] = { check: 'LOT14_CERTIFICATION', status: 'FAIL', code: 'RUN_FAILED' };
    complete(new Error('failed'), rows.map((row) => JSON.stringify(row)).join('\n'));
    await run;
    expect(JSON.parse(emit.mock.calls[0]![0])).toMatchObject({
      status: 'FAIL',
      code: 'PREPARATION_FAILED',
    });
    expect(JSON.parse(emit.mock.calls[15]![0])).toMatchObject({
      status: 'SKIP',
      code: 'TENANT_AB_FAILED',
    });
  });
  it('refuses malformed flags and nonstaging without spawning', async () => {
    await expect(
      runStagingCertification(3001, { ...env(), APP_ENV: 'production' }),
    ).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
    await expect(
      runStagingCertification(3001, { LOT14_CERTIFICATION_RUN: 'TRUE' }),
    ).rejects.toThrow('LOT14_CERTIFICATION_FAILED');
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('sanitizes synchronous process errors', async () => {
    mocks.exec.mockImplementation(() => {
      throw new Error('private-exec-canary');
    });
    await expect(runStagingCertification(3001, env())).rejects.toThrow(
      'LOT14_CERTIFICATION_FAILED',
    );
  });
});
