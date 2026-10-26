import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const driver = vi.hoisted(() => ({
  instance: undefined as import('node:events').EventEmitter | undefined,
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
      }
      connect = driver.connect;
      query = driver.query;
      end = driver.end;
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
      const result = await states();
      expect(result).toEqual({ postgres: 'down', redis: 'up', storage: 'up' });
      expect(isInfrastructureReady(result)).toBe(false);
      expect(driver.connect).toHaveBeenCalledTimes(1);
      expect(driver.query).toHaveBeenCalledTimes(phase === 'connect' ? 0 : 1);
      expect(driver.end).toHaveBeenCalledTimes(1);
      expect(process.stderr.write).toHaveBeenCalledExactlyOnceWith(
        line({
          event: `POSTGRES_HEALTH_${classification}`,
          durationMs: 0,
        }),
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

  it('does not latch down after a timeout: a later check requires a new successful SELECT', async () => {
    driver.connect.mockRejectedValueOnce(new Error('timeout expired'));
    const postgres = health();
    expect((await states(postgres)).postgres).toBe('down');
    expect((await states(postgres)).postgres).toBe('up');
    expect(driver.construct).toHaveBeenCalledTimes(2);
    expect(driver.connect).toHaveBeenCalledTimes(2);
    expect(driver.query).toHaveBeenCalledTimes(1);
    expect(driver.end).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'tls', 'auth', 'query'] as const)(
    'keeps two consecutive %s checks down without retrying or stale success',
    async (kind) => {
      if (kind === 'query') driver.query.mockRejectedValue(raw('42601'));
      else
        driver.connect.mockRejectedValue(
          kind === 'timeout'
            ? new Error('timeout expired')
            : raw(kind === 'tls' ? 'ERR_TLS_CERT_ALTNAME_INVALID' : '28P01'),
        );
      const postgres = health();
      expect((await states(postgres)).postgres).toBe('down');
      expect((await states(postgres)).postgres).toBe('down');
      expect(driver.connect).toHaveBeenCalledTimes(2);
      expect(driver.end).toHaveBeenCalledTimes(2);
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
