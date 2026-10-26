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

export class PostgresHealth implements DependencyHealthCheck {
  readonly name = 'postgres';

  constructor(
    private readonly databaseUrl: string,
    private readonly timeoutMilliseconds = 2_000,
  ) {}

  async check(): Promise<void> {
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
      await client.connect();
      phase = 'query';
      await client.query('SELECT 1');
    } catch (error) {
      const event = classify(connectionFailure ?? error, phase);
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      try {
        process.stderr.write(`${JSON.stringify({ event, durationMs })}\n`);
      } catch {
        // A logging failure must not replace the safe classification or skip cleanup.
      }
      // Keep readiness down and prevent upstream logging of the original sensitive error.
      // oxlint-disable-next-line preserve-caught-error -- Raw driver causes may contain credentials.
      throw new Error(event);
    } finally {
      try {
        await client?.end();
      } catch {
        // Cleanup must not leak raw errors or replace the diagnostic failure.
      }
    }
  }
}
