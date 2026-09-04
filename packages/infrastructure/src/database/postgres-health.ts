import { Client } from 'pg';

import type { DependencyHealthCheck } from '../health.js';

export class PostgresHealth implements DependencyHealthCheck {
  readonly name = 'postgres';

  constructor(
    private readonly databaseUrl: string,
    private readonly timeoutMilliseconds = 2_000,
  ) {}

  async check(): Promise<void> {
    const client = new Client({
      connectionString: this.databaseUrl,
      connectionTimeoutMillis: this.timeoutMilliseconds,
      query_timeout: this.timeoutMilliseconds,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
