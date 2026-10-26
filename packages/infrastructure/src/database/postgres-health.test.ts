import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestClient = import('node:events').EventEmitter & {
  end: () => unknown;
  connection: { stream: { destroy: () => unknown } };
};

const driver = vi.hoisted(() => ({
  instance: undefined as TestClient | undefined,
  instances: [] as TestClient[],
  construct: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));
vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Client: class extends EventEmitter {
      constructor(options: unknown) {
        super();
        driver.construct(options);
        driver.instance = this;
        driver.instances.push(this);
      }
      connect = vi.fn(() => driver.connect());
      query = vi.fn((sql: string) => driver.query(sql));
      end = vi.fn(() => driver.end());
      connection = { stream: { destroy: vi.fn() } };
    },
  };
});

import { checkInfrastructure, isInfrastructureReady } from '../health.js';
import { PostgresHealth } from './postgres-health.js';

const canary =
  'postgresql://health-user:health-password@private-db.invalid/secret-db?sslmode=verify-full';
const raw = (code: string) =>
  Object.assign(new Error(`${canary} certificate SQL-data-canary`), { code });
const line = (event: Record<string, string | number>) => `${JSON.stringify(event)}\n`;
const health = () => new PostgresHealth(canary);
const states = (postgres = health()) =>
  checkInfrastructure({
    postgres,
    redis: { name: 'redis', async check() {} },
    storage: { name: 'storage', async check() {} },
  });

describe('PostgresHealth safe failure diagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    driver.instance = undefined;
    driver.instances = [];
    driver.connect.mockResolvedValue(undefined);
    driver.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    driver.end.mockResolvedValue(undefined);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports up only after a real successful connect and SELECT, and closes the client', async () => {
    expect(isInfrastructureReady(await states())).toBe(true);
    expect(driver.connect).toHaveBeenCalledTimes(1);
    expect(driver.query).toHaveBeenCalledExactlyOnceWith('SELECT 1');
    expect(driver.end).toHaveBeenCalledTimes(1);
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it.each([
    ['connect', new Error('timeout expired'), 'CONNECT_TIMEOUT'],
    ['connect', raw('ETIMEDOUT'), 'CONNECT_TIMEOUT'],
    ['query', new Error('Query read timeout'), 'QUERY_TIMEOUT'],
    ['query', raw('ETIMEDOUT'), 'QUERY_TIMEOUT'],
    ['connect', raw('ERR_TLS_CERT_ALTNAME_INVALID'), 'TLS_ERROR'],
    ['connect', raw('ERR_SSL_WRONG_VERSION_NUMBER'), 'TLS_ERROR'],
    ['connect', new Error('The server does not support SSL connections'), 'TLS_ERROR'],
    ['connect', new Error('There was an error establishing an SSL connection'), 'TLS_ERROR'],
    ['connect', raw('CERT_HAS_EXPIRED'), 'TLS_ERROR'],
    ['connect', raw('SELF_SIGNED_CERT_IN_CHAIN'), 'TLS_ERROR'],
    ['connect', raw('28P01'), 'CONNECTION_ERROR'],
    ['connect', raw('28000'), 'CONNECTION_ERROR'],
    ['connect', raw('EAI_AGAIN'), 'CONNECTION_ERROR'],
    ['query', raw('ECONNRESET'), 'CONNECTION_ERROR'],
    ['query', raw('08006'), 'CONNECTION_ERROR'],
    ['query', raw('42601'), 'QUERY_ERROR'],
    // A server cancellation does not establish a timeout.
    ['query', raw('57014'), 'QUERY_ERROR'],
    ['connect', canary, 'CONNECTION_ERROR'],
    ['query', { code: canary, message: canary, detail: canary }, 'QUERY_ERROR'],
  ] as const)(
    'keeps %s failures down and classifies %s as %s without secrets',
    async (phase, error, classification) => {
      const operation = phase === 'connect' ? driver.connect : driver.query;
      operation.mockRejectedValue(error);
      const pending = states();
      const attempts = classification === 'CONNECT_TIMEOUT' ? 2 : 1;
      if (attempts === 2) await vi.advanceTimersByTimeAsync(200);
      const result = await pending;
      expect(result).toEqual({ postgres: 'down', redis: 'up', storage: 'up' });
      expect(isInfrastructureReady(result)).toBe(false);
      expect(driver.connect).toHaveBeenCalledTimes(attempts);
      expect(driver.query).toHaveBeenCalledTimes(phase === 'connect' ? 0 : 1);
      expect(driver.end).toHaveBeenCalledTimes(attempts);
      for (const client of driver.instances) {
        expect(client.end).toHaveBeenCalledTimes(1);
        expect(client.connection.stream.destroy).toHaveBeenCalledTimes(1);
      }
      expect(vi.mocked(process.stderr.write).mock.calls).toEqual(
        Array.from({ length: attempts }, () => [
          line({ event: `POSTGRES_HEALTH_${classification}`, durationMs: 0 }),
        ]),
      );
      expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toMatch(
        /health-user|health-password|private-db|secret-db|certificate|SQL-data-canary/,
      );
    },
  );

  it('throws only the fixed classification, never a driver error or cause', async () => {
    driver.query.mockRejectedValue(raw('42601'));
    const failure = await health()
      .check()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('POSTGRES_HEALTH_QUERY_ERROR');
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain(canary);
    expect(driver.end).toHaveBeenCalledTimes(1);
  });

  it('recovers from a connect timeout only after a closed first client, bounded backoff and successful SELECT', async () => {
    driver.connect.mockRejectedValueOnce(new Error('timeout expired'));
    let completed = false;
    const pending = states().then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(completed).toBe(false);
    expect(driver.construct).toHaveBeenCalledTimes(1);
    expect(driver.connect).toHaveBeenCalledTimes(1);
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.instances[0]!.end).toHaveBeenCalledTimes(1);
    expect(driver.instances[0]!.connection.stream.destroy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(isInfrastructureReady(await pending)).toBe(true);
    expect(driver.construct).toHaveBeenCalledTimes(2);
    expect(driver.connect).toHaveBeenCalledTimes(2);
    expect(driver.query).toHaveBeenCalledExactlyOnceWith('SELECT 1');
    expect(driver.end).toHaveBeenCalledTimes(2);
    expect(driver.instances[1]).not.toBe(driver.instances[0]);
    expect(driver.instances[1]!.end).toHaveBeenCalledTimes(1);
    expect(driver.instances[1]!.connection.stream.destroy).toHaveBeenCalledTimes(1);
    expect(performance.now()).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
      line({ event: 'POSTGRES_HEALTH_CONNECT_TIMEOUT', durationMs: 0 }),
    );
    expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toMatch(
      /health-user|health-password|private-db|secret-db|certificate|SQL-data-canary/,
    );
  });

  it.each(['timeout', 'tls', 'auth', 'query'] as const)(
    'keeps consecutive %s checks down with only the permitted bounded retries',
    async (kind) => {
      if (kind === 'query') driver.query.mockRejectedValue(raw('42601'));
      else
        driver.connect.mockRejectedValue(
          kind === 'timeout'
            ? new Error('timeout expired')
            : raw(kind === 'tls' ? 'ERR_TLS_CERT_ALTNAME_INVALID' : '28P01'),
        );
      const postgres = health();
      for (let check = 0; check < 2; check++) {
        const pending = states(postgres);
        if (kind === 'timeout') await vi.advanceTimersByTimeAsync(200);
        expect((await pending).postgres).toBe('down');
      }
      const attempts = kind === 'timeout' ? 4 : 2;
      expect(driver.connect).toHaveBeenCalledTimes(attempts);
      expect(driver.end).toHaveBeenCalledTimes(attempts);
      for (const client of driver.instances) expect(client.end).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('records monotonic total elapsed time without increasing the existing driver timeout budgets', async () => {
    driver.connect.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1_900)));
    driver.query.mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query read timeout')), 2_000),
        ),
    );
    const pending = states();
    await vi.advanceTimersByTimeAsync(3_900);
    expect((await pending).postgres).toBe('down');
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
      line({ event: 'POSTGRES_HEALTH_QUERY_TIMEOUT', durationMs: 3_900 }),
    );
    expect(driver.construct).toHaveBeenCalledExactlyOnceWith({
      connectionString: canary,
      connectionTimeoutMillis: 2_000,
      query_timeout: 2_000,
    });
    expect(driver.end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the client even if the diagnostic sink throws', async () => {
    driver.connect.mockRejectedValue(raw('28P01'));
    vi.mocked(process.stderr.write).mockImplementation(() => {
      throw new Error('sink unavailable');
    });
    await expect(health().check()).rejects.toThrow('POSTGRES_HEALTH_CONNECTION_ERROR');
    expect(driver.end).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'suppresses raw cleanup errors without changing SELECT readiness (%s)',
    async (connected) => {
      if (!connected) driver.connect.mockRejectedValue(raw('28P01'));
      driver.end.mockRejectedValue(raw('cleanup-canary'));
      expect((await states()).postgres).toBe(connected ? 'up' : 'down');
      expect(driver.end).toHaveBeenCalledTimes(1);
      expect(process.stderr.write).toHaveBeenCalledTimes(connected ? 0 : 1);
    },
  );

  it.each([
    ['ECONNRESET', 'CONNECTION_ERROR'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_ERROR'],
  ])(
    'sanitizes asynchronous pg events (%s) and preserves down and cleanup',
    async (code, classification) => {
      driver.query.mockImplementationOnce(async () => {
        driver.instance!.emit('error', raw(code!));
        throw new Error('Client has encountered a connection error and is not queryable');
      });
      expect((await states()).postgres).toBe('down');
      expect(driver.end).toHaveBeenCalledTimes(1);
      expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
        line({ event: `POSTGRES_HEALTH_${classification}`, durationMs: 0 }),
      );
    },
  );

  it('bounds two hung connections to 4.2s, closes both and never tries a third time', async () => {
    driver.connect.mockImplementation(() => new Promise(() => undefined));
    let completed = false;
    const pending = states().then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(4_199);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).postgres).toBe('down');
    expect(performance.now()).toBe(4_200);
    expect(driver.construct).toHaveBeenCalledTimes(2);
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.end).toHaveBeenCalledTimes(2);
    for (const client of driver.instances) {
      expect(client.end).toHaveBeenCalledTimes(1);
      expect(client.connection.stream.destroy).toHaveBeenCalledTimes(1);
    }
    expect(vi.mocked(process.stderr.write).mock.calls).toEqual(
      Array.from({ length: 2 }, () => [
        line({ event: 'POSTGRES_HEALTH_CONNECT_TIMEOUT', durationMs: 2_000 }),
      ]),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(driver.construct).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds hung cleanup: two connect timeouts and disposal finish within 4.7s', async () => {
    driver.connect.mockImplementation(() => new Promise(() => undefined));
    driver.end.mockImplementation(() => new Promise(() => undefined));
    let completed = false;
    const pending = states().then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(4_699);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).postgres).toBe('down');
    expect(performance.now()).toBe(4_700);
    expect(driver.end).toHaveBeenCalledTimes(2);
    for (const client of driver.instances) {
      expect(client.end).toHaveBeenCalledTimes(1);
      expect(client.connection.stream.destroy).toHaveBeenCalledTimes(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds the longest retry path, including second-query timeout and cleanup, below 6.7s', async () => {
    driver.connect.mockImplementationOnce(() => new Promise(() => undefined));
    driver.connect.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 1_999)),
    );
    driver.query.mockImplementation(() => new Promise(() => undefined));
    driver.end.mockImplementation(() => new Promise(() => undefined));
    const pending = states();
    await vi.advanceTimersByTimeAsync(6_699);
    expect((await pending).postgres).toBe('down');
    expect(driver.connect).toHaveBeenCalledTimes(2);
    expect(driver.query).toHaveBeenCalledExactlyOnceWith('SELECT 1');
    expect(driver.end).toHaveBeenCalledTimes(2);
    expect(performance.now()).toBe(6_699);
    expect(vi.getTimerCount()).toBe(0);
    expect(vi.mocked(process.stderr.write).mock.calls).toEqual([
      [line({ event: 'POSTGRES_HEALTH_CONNECT_TIMEOUT', durationMs: 2_000 })],
      [line({ event: 'POSTGRES_HEALTH_QUERY_TIMEOUT', durationMs: 3_999 })],
    ]);
  });

  it.each([
    ['connect', raw('28P01'), 'CONNECTION_ERROR'],
    ['connect', raw('ERR_TLS_CERT_ALTNAME_INVALID'), 'TLS_ERROR'],
    ['query', new Error('Query read timeout'), 'QUERY_TIMEOUT'],
    ['query', raw('42601'), 'QUERY_ERROR'],
  ] as const)(
    'never retries the second-attempt %s failure (%s)',
    async (phase, error, classification) => {
      driver.connect.mockRejectedValueOnce(new Error('timeout expired'));
      if (phase === 'connect') driver.connect.mockRejectedValueOnce(error);
      else driver.query.mockRejectedValueOnce(error);
      const pending = states();
      await vi.advanceTimersByTimeAsync(200);
      expect((await pending).postgres).toBe('down');
      expect(driver.connect).toHaveBeenCalledTimes(2);
      expect(driver.end).toHaveBeenCalledTimes(2);
      expect(driver.query).toHaveBeenCalledTimes(phase === 'query' ? 1 : 0);
      expect(process.stderr.write).toHaveBeenLastCalledWith(
        line({ event: `POSTGRES_HEALTH_${classification}`, durationMs: 0 }),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('requires a new successful SELECT on a later check after both timeouts', async () => {
    driver.connect
      .mockRejectedValueOnce(new Error('timeout expired'))
      .mockRejectedValueOnce(new Error('timeout expired'));
    const postgres = health();
    const pending = states(postgres);
    await vi.advanceTimersByTimeAsync(200);
    expect((await pending).postgres).toBe('down');
    expect((await states(postgres)).postgres).toBe('up');
    expect(driver.connect).toHaveBeenCalledTimes(3);
    expect(driver.query).toHaveBeenCalledExactlyOnceWith('SELECT 1');
    expect(driver.end).toHaveBeenCalledTimes(3);
  });

  it('sanitizes constructor failures without pretending a client was created', async () => {
    driver.construct.mockImplementation(() => {
      throw raw('invalid-config-canary');
    });
    await expect(health().check()).rejects.toThrow('POSTGRES_HEALTH_CONNECTION_ERROR');
    expect(driver.end).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
      line({ event: 'POSTGRES_HEALTH_CONNECTION_ERROR', durationMs: 0 }),
    );
  });
});
