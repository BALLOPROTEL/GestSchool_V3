import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  listen: vi.fn(),
  close: vi.fn(),
  configure: vi.fn(),
  run: vi.fn(),
  bootstrap: vi.fn(),
}));
vi.mock('@nestjs/core', () => ({ NestFactory: { create: mocks.create } }));
vi.mock('../../app.module.js', () => ({
  AppModule: class {
    readonly testStub = true;
  },
}));
vi.mock('../../modules/iam/presentation/http/security.js', () => ({
  configureIamHttp: mocks.configure,
}));
vi.mock('../staging-bootstrap-startup.js', () => ({ runStagingBootstrapStartup: mocks.bootstrap }));
vi.mock('./startup.js', () => ({ runStagingCertification: mocks.run }));
import { roles } from './config.js';
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({
    getHttpServer: () => ({}),
    get: () => ({ apiPort: 3001, apiHost: '127.0.0.1' }),
    listen: mocks.listen,
    close: mocks.close,
  });
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('TEST_EXIT');
  });
  vi.stubEnv('LOT14_CERTIFICATION_RUN', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function enable() {
  for (const [key, value] of Object.entries({
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
  }))
    vi.stubEnv(key, value);
}
describe('API certification lifecycle', () => {
  it('preserves normal API startup while inactive', async () => {
    await import('../../main.js');
    expect(mocks.listen).toHaveBeenCalledWith(3001, '127.0.0.1');
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it('starts the real listener before invoking the one-shot runner', async () => {
    enable();
    await import('../../main.js');
    expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.run.mock.invocationCallOrder[0]!,
    );
    expect(mocks.run).toHaveBeenCalledWith(3001);
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it.each(['assertion', 'timeout'])(
    'closes API and exits nonzero on certification %s failure with a fixed diagnostic',
    async (reason) => {
      enable();
      mocks.run.mockRejectedValue(new Error(`private-runtime-canary-${reason}`));
      await expect(import('../../main.js')).rejects.toThrow('TEST_EXIT');
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(process.stderr.write).toHaveBeenCalledWith(
        '{"check":"LOT14_CERTIFICATION","status":"FAIL","code":"RUN_FAILED"}\n',
      );
      expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toContain(
        'private-runtime-canary',
      );
    },
  );
  it('rejects an invalid flag before creating API or applying bootstrap', async () => {
    vi.stubEnv('LOT14_CERTIFICATION_RUN', 'TRUE');
    await expect(import('../../main.js')).rejects.toThrow('TEST_EXIT');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
});
