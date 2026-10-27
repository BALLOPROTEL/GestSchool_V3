import { Client } from 'pg';

import type { DependencyHealthCheck } from '../health.js';

type Phase = 'connect' | 'query';
type Failure =
  | 'POSTGRES_HEALTH_CONNECT_TIMEOUT'
  | 'POSTGRES_HEALTH_QUERY_TIMEOUT'
  | 'POSTGRES_HEALTH_TLS_ERROR'
  | 'POSTGRES_HEALTH_CONNECTION_ERROR'
  | 'POSTGRES_HEALTH_QUERY_ERROR';

const tlsCodes = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
const connectionCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

function classify(error: unknown, phase: Phase): Failure {
  // Inspect only for classification; never serialize driver fields, causes or stacks.
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  if (
    tlsCodes.has(code) ||
    code.startsWith('ERR_TLS_') ||
    code.startsWith('ERR_SSL_') ||
    (error instanceof Error &&
      (error.message === 'The server does not support SSL connections' ||
        error.message === 'There was an error establishing an SSL connection'))
  )
    return 'POSTGRES_HEALTH_TLS_ERROR';
  // Exact messages emitted by the pinned pg driver; arbitrary message text is not logged.
  if (
    code === 'ETIMEDOUT' ||
    (phase === 'connect' && error instanceof Error && error.message === 'timeout expired')
  )
    return phase === 'connect'
      ? 'POSTGRES_HEALTH_CONNECT_TIMEOUT'
      : 'POSTGRES_HEALTH_QUERY_TIMEOUT';
  if (phase === 'query' && error instanceof Error && error.message === 'Query read timeout')
    return 'POSTGRES_HEALTH_QUERY_TIMEOUT';
  if (
    connectionCodes.has(code) ||
    /^08[A-Z0-9]{3}$/.test(code) ||
    code === '28P01' ||
    code === '28000'
  )
    return 'POSTGRES_HEALTH_CONNECTION_ERROR';
  return phase === 'connect' ? 'POSTGRES_HEALTH_CONNECTION_ERROR' : 'POSTGRES_HEALTH_QUERY_ERROR';
}

const retryBackoffMilliseconds = 200;
const cleanupTimeoutMilliseconds = 250;

async function within<T>(
  operation: () => Promise<T>,
  milliseconds: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function close(client: Client): Promise<void> {
  try {
    await within(
      () => client.end(),
      cleanupTimeoutMilliseconds,
      'POSTGRES_HEALTH_CONNECTION_ERROR',
    );
  } catch {
    // Cleanup failures must not leak raw driver errors or extend the readiness budget.
  } finally {
    // end() can wait for a socket indefinitely. Force disposal after the bounded grace period.
    try {
      client.connection.stream.destroy();
    } catch {
      // Never serialize socket errors.
    }
  }
}

export class PostgresHealth implements DependencyHealthCheck {
  readonly name = 'postgres';

  constructor(
    private readonly databaseUrl: string,
    private readonly timeoutMilliseconds = 2_000,
  ) {}

  async check(): Promise<void> {
    let failure = await this.attempt();
    if (failure === 'POSTGRES_HEALTH_CONNECT_TIMEOUT') {
      await new Promise<void>((resolve) => setTimeout(resolve, retryBackoffMilliseconds));
      failure = await this.attempt();
    }
    // At most two attempts, with a fresh, closed client each time. Only SELECT success is up.
    // Default worst-case budget: 2s connect + 250ms cleanup + 200ms backoff +
    // 2s connect + 2s query + 250ms cleanup = 6.7s (two connect timeouts: 4.7s).
    if (failure) throw new Error(failure);
  }

  private async attempt(): Promise<Failure | undefined> {
    const started = performance.now();
    let phase: Phase = 'connect';
    let client: Client | undefined;
    let connectionFailure: unknown;
    try {
      client = new Client({
        connectionString: this.databaseUrl,
        connectionTimeoutMillis: this.timeoutMilliseconds,
        query_timeout: this.timeoutMilliseconds,
      });
      // pg also emits asynchronous socket errors; never let EventEmitter print a raw one.
      client.on('error', (error: Error) => {
        connectionFailure = error;
      });
      await within(() => client!.connect(), this.timeoutMilliseconds, 'timeout expired');
      phase = 'query';
      await within(() => client!.query('SELECT 1'), this.timeoutMilliseconds, 'Query read timeout');
      return undefined;
    } catch (error) {
      const event = classify(connectionFailure ?? error, phase);
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      try {
        process.stderr.write(`${JSON.stringify({ event, durationMs })}\n`);
      } catch {
        // A logging failure must not replace the safe classification or skip cleanup.
      }
      return event;
    } finally {
      if (client) await close(client);
    }
  }
}
