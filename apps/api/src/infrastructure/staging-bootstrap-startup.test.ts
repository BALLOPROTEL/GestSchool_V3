import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  kill: vi.fn(),
  end: vi.fn(),
  create: vi.fn(),
  listen: vi.fn(),
  configure: vi.fn(),
  complete: undefined as
    ((error: Error | null, stdout: string, stderr: string) => void) | undefined,
  events: [] as string[],
}));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('@nestjs/core', () => ({ NestFactory: { create: mocks.create } }));
vi.mock('../app.module.js', () => ({
  AppModule: class {
    readonly testStub = true;
  },
}));
vi.mock('../modules/iam/presentation/http/security.js', () => ({
  configureIamHttp: mocks.configure,
}));

import { runStagingBootstrapStartup } from './staging-bootstrap-startup.js';

const canary = 'DRIVER_SECRET_CANARY';
const environment = (): NodeJS.ProcessEnv => ({
  LOT14_BOOTSTRAP_APPLY: 'true',
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  IAM_ENV: 'staging',
  APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app',
  DATABASE_URL: canary,
  LOT14_BOOTSTRAP_A_SCHOOL_ADMIN_PASSWORD: canary,
});
const pass = (created = true) =>
  JSON.stringify({ check: 'LOT14_BOOTSTRAP', status: 'PASS', created });
function close(error: Error | null = null, stdout = pass(), stderr = '') {
  const callback = mocks.complete;
  mocks.complete = undefined;
  expect(callback).toBeDefined();
  mocks.events.push('child-close');
  callback!(error, stdout, stderr);
}
let termListeners: number;
let intListeners: number;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.complete = undefined;
  mocks.events = [];
  termListeners = process.listenerCount('SIGTERM');
  intListeners = process.listenerCount('SIGINT');
  mocks.exec.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      mocks.events.push('child-start');
      mocks.complete = callback;
      return { kill: mocks.kill, stdin: { end: mocks.end } };
    },
  );
  mocks.kill.mockReturnValue(true);
  mocks.create.mockImplementation(async () => {
    mocks.events.push('api-create');
    return {
      getHttpServer: () => ({}),
      get: () => ({ apiPort: 3001, apiHost: '127.0.0.1' }),
      listen: mocks.listen,
    };
  });
  mocks.listen.mockImplementation(async () => {
    mocks.events.push('api-listen');
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('TEST_API_EXIT');
  });
});
afterEach(() => {
  if (mocks.complete) close(new Error('TEST_CLEANUP'), '', '');
  expect(process.listenerCount('SIGTERM')).toBe(termListeners);
  expect(process.listenerCount('SIGINT')).toBe(intListeners);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('guarded bootstrap startup', () => {
  it.each([undefined, 'false'])(
    'is completely inactive when flag=%s, including production',
    async (flag) => {
      const env: NodeJS.ProcessEnv = { ...environment(), APP_ENV: 'production' };
      if (flag === undefined) delete env.LOT14_BOOTSTRAP_APPLY;
      else env.LOT14_BOOTSTRAP_APPLY = flag;
      const emit = vi.fn();
      await runStagingBootstrapStartup(env, emit);
      expect(mocks.exec).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'TRUE', '1', '0', ' true', 'false ', 'yes'])(
    'rejects invalid flag %s without spawning',
    async (flag) => {
      await expect(
        runStagingBootstrapStartup({ ...environment(), LOT14_BOOTSTRAP_APPLY: flag }),
      ).rejects.toThrow('LOT14_BOOTSTRAP_STARTUP_FAILED');
      expect(mocks.exec).not.toHaveBeenCalled();
    },
  );

  it.each([
    { APP_ENV: 'production' },
    { APP_ENV: 'development' },
    { APP_ENV: undefined },
    { NODE_ENV: 'test' },
    { IAM_ENV: 'production' },
    { APP_PUBLIC_ORIGIN: 'https://gestschool.vercel.app' },
    { APP_PUBLIC_ORIGIN: 'https://gestschool-v3-staging.vercel.app/' },
  ])('refuses a non-exact staging environment (%j)', async (change) => {
    await expect(runStagingBootstrapStartup({ ...environment(), ...change })).rejects.toThrow(
      'LOT14_BOOTSTRAP_STARTUP_FAILED',
    );
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'accepts only PASS after child termination, including idempotent created=%s',
    async (created) => {
      const env = environment(),
        emit = vi.fn();
      const pending = runStagingBootstrapStartup(env, emit);
      expect(mocks.exec).toHaveBeenCalledTimes(1);
      const [command, args, options] = mocks.exec.mock.calls[0]!;
      expect(command).toBe(process.execPath);
      expect(args).toHaveLength(2);
      expect(args[0]).toMatch(/[/]scripts[/]staging-bootstrap\.mjs$/);
      expect(args[1]).toBe('--apply');
      expect(JSON.stringify([command, args])).not.toContain(canary);
      expect(options).toMatchObject({
        shell: false,
        encoding: 'utf8',
        timeout: 120_000,
        killSignal: 'SIGKILL',
        maxBuffer: 16_384,
      });
      expect(options.env).toBe(env);
      expect(options.cwd).not.toContain('/dist');
      expect(mocks.end).toHaveBeenCalledTimes(1);
      expect(emit).not.toHaveBeenCalled();
      close(
        null,
        JSON.stringify({
          check: 'LOT14_BOOTSTRAP',
          status: 'PASS',
          created,
          password: canary,
          hash: canary,
          totp: canary,
        }),
        canary,
      );
      await pending;
      expect(emit).toHaveBeenCalledExactlyOnceWith(pass(created));
      expect(JSON.stringify(emit.mock.calls)).not.toContain(canary);
    },
  );

  it.each(['exit-nonzero', 'timeout', 'max-buffer'])(
    'refuses child failure %s without logging its buffers/errors',
    async (kind) => {
      const emit = vi.fn();
      const pending = runStagingBootstrapStartup(environment(), emit);
      const failure = Object.assign(new Error(canary), {
        code:
          kind === 'timeout'
            ? 'ETIMEDOUT'
            : kind === 'max-buffer'
              ? 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
              : 1,
      });
      close(failure, pass(), canary);
      const error = await pending.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('LOT14_BOOTSTRAP_STARTUP_FAILED');
      expect(error).not.toHaveProperty('cause');
      expect(String(error)).not.toContain(canary);
      expect(emit).not.toHaveBeenCalled();
      expect(process.stderr.write).not.toHaveBeenCalled();
    },
  );

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'kills and waits for the child before refusing on %s, then removes handlers',
    async (signal) => {
      const before = new Set(process.listeners(signal));
      const pending = runStagingBootstrapStartup(environment());
      const added = process.listeners(signal).filter((handler) => !before.has(handler));
      expect(added).toHaveLength(1);
      added[0]!(signal);
      expect(mocks.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
      close();
      await expect(pending).rejects.toThrow('LOT14_BOOTSTRAP_STARTUP_FAILED');
      expect(process.stdout.write).not.toHaveBeenCalled();
    },
  );

  it('sanitizes a synchronous spawn failure', async () => {
    mocks.exec.mockImplementation(() => {
      throw new Error(canary);
    });
    await expect(runStagingBootstrapStartup(environment())).rejects.toThrow(
      'LOT14_BOOTSTRAP_STARTUP_FAILED',
    );
    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it.each([
    canary,
    pass() + '\n' + canary,
    JSON.stringify({ check: 'LOT14_BOOTSTRAP', status: 'PLAN', created: true }),
    JSON.stringify({ check: 'LOT14_BOOTSTRAP', status: 'FAIL', code: canary }),
    JSON.stringify({ check: 'LOT14_BOOTSTRAP', status: 'PASS', created: canary }),
  ])('refuses exit 0 without a safe PASS report (%s)', async (output) => {
    const pending = runStagingBootstrapStartup(environment());
    close(null, output);
    await expect(pending).rejects.toThrow('LOT14_BOOTSTRAP_STARTUP_FAILED');
    expect(process.stdout.write).not.toHaveBeenCalled();
  });
});

describe('API startup ordering', () => {
  function configure(flag: string | undefined) {
    for (const [key, value] of Object.entries(environment())) vi.stubEnv(key, value);
    vi.stubEnv('LOT14_BOOTSTRAP_APPLY', flag);
  }

  it.each([undefined, 'false'])(
    'starts normally with flag=%s and no bootstrap process',
    async (flag) => {
      configure(flag);
      await import('../main.js');
      expect(mocks.exec).not.toHaveBeenCalled();
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.configure).toHaveBeenCalledTimes(1);
      expect(mocks.listen).toHaveBeenCalledExactlyOnceWith(3001, '127.0.0.1');
    },
  );

  it('cannot create or listen before a successful bootstrap, then follows normal startup', async () => {
    configure('true');
    const pending = import('../main.js');
    await vi.waitFor(() => expect(mocks.exec).toHaveBeenCalledTimes(1));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
    close();
    await pending;
    expect(mocks.events).toEqual(['child-start', 'child-close', 'api-create', 'api-listen']);
    expect(mocks.configure).toHaveBeenCalledTimes(1);
  });

  it.each(['child-failure', 'timeout', 'invalid-flag'])(
    'refuses API creation/listen on %s with a generic diagnostic',
    async (kind) => {
      configure(kind === 'invalid-flag' ? '1' : 'true');
      const pending = import('../main.js');
      const rejected = expect(pending).rejects.toThrow('TEST_API_EXIT');
      if (kind !== 'invalid-flag') {
        await vi.waitFor(() => expect(mocks.exec).toHaveBeenCalledTimes(1));
        close(
          Object.assign(new Error(canary), { code: kind === 'timeout' ? 'ETIMEDOUT' : 1 }),
          pass(),
          canary,
        );
      }
      await rejected;
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.listen).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
        '{"check":"LOT14_BOOTSTRAP_STARTUP","status":"FAIL","code":"LOT14_BOOTSTRAP_STARTUP_FAILED"}\n',
      );
      expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toContain(canary);
    },
  );
});
