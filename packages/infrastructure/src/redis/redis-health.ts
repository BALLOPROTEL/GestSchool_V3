import { createClient } from 'redis';

import type { DependencyHealthCheck } from '../health.js';

export class RedisHealth implements DependencyHealthCheck {
  readonly name = 'redis';

  constructor(
    private readonly redisUrl: string,
    private readonly timeoutMilliseconds = 2_000,
  ) {}

  async check(): Promise<void> {
    const client = createClient({
      socket: {
        connectTimeout: this.timeoutMilliseconds,
        reconnectStrategy: false,
      },
      url: this.redisUrl,
    });
    client.on('error', () => undefined);

    try {
      await client.connect();
      const response = await client.ping();
      if (response !== 'PONG') throw new Error(`Unexpected Redis PING response: ${response}`);
    } finally {
      if (client.isOpen) await client.close().catch(() => undefined);
    }
  }
}
