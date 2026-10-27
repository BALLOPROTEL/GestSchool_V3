import { createServer } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { startWorkerHealthServer, workerHealthPort } from './http-health.js';

const unusedPort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_PORT_UNAVAILABLE');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
};

describe('staging worker HTTP health', () => {
  it('stays disabled by default and refuses activation outside production-mode staging', () => {
    expect(workerHealthPort({})).toBeNull();
    expect(workerHealthPort({ WORKER_HTTP_HEALTH_ENABLED: 'false' })).toBeNull();
    const stage = {
      WORKER_HTTP_HEALTH_ENABLED: 'true',
      APP_ENV: 'staging',
      NODE_ENV: 'production',
      PORT: '10000',
    };
    expect(workerHealthPort(stage)).toBe(10000);
    for (const invalid of [
      { APP_ENV: 'production' },
      { NODE_ENV: 'test' },
      { PORT: '0' },
      { PORT: '65536' },
      { PORT: '10000x' },
      { WORKER_HTTP_HEALTH_ENABLED: '1' },
    ])
      expect(() => workerHealthPort({ ...stage, ...invalid })).toThrow(
        'WORKER_HEALTH_CONFIGURATION_INVALID',
      );
  });

  it.each([true, false])(
    'reports dependency readiness without leaking errors (%s)',
    async (ready) => {
      const port = await unusedPort();
      const verifyReady = vi.fn(async () => {
        if (!ready) throw new Error('credential-and-stack-canary');
      });
      const server = await startWorkerHealthServer({ port, host: '127.0.0.1', verifyReady });
      try {
        const base = `http://127.0.0.1:${port}`;
        const response = await fetch(`${base}/health`);
        expect(response.status).toBe(ready ? 200 : 503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ status: ready ? 'ok' : 'unavailable' });
        const head = await fetch(`${base}/health/ready`, { method: 'HEAD' });
        expect(head.status).toBe(ready ? 200 : 503);
        expect(await head.text()).toBe('');
        expect(verifyReady).toHaveBeenCalledTimes(1);
        expect((await fetch(`${base}/health/live`)).status).toBe(200);
        expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
        expect((await fetch(`${base}/jobs`)).status).toBe(404);
      } finally {
        await server.close();
      }
      await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
    },
  );
});
