import { setTimeout } from 'node:timers/promises';
import { createClient } from 'redis';
import { IamError } from '../domain/context.js';
import { tokenHash } from './crypto.js';

const countScript = `local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; return value`;
export class RateLimiter {
  readonly client: ReturnType<typeof createClient>;
  constructor(
    url: string,
    private readonly prefix: string,
  ) {
    this.client = createClient({ url, socket: { connectTimeout: 2000, reconnectStrategy: false } });
    this.client.on('error', () => undefined); // Never log Redis URLs or credentials.
  }
  async open(): Promise<void> {
    await this.client.connect();
  }
  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.close();
  }
  async check(endpoint: string, ip: string, identifier?: string): Promise<void> {
    const sensitive = /login|forgot-password|reset-password|refresh|activation|mfa/.test(endpoint);
    if (!sensitive) return;
    const refresh = endpoint.endsWith('/refresh');
    const limits: [string, number][] = [[`ip:${tokenHash(ip)}`, refresh ? 120 : 40]];
    if (identifier) limits.push([`identity:${tokenHash(identifier)}`, refresh ? 60 : 10]);
    try {
      for (const [key, limit] of limits) {
        const count = Number(
          await this.client.eval(countScript, {
            keys: [`${this.prefix}:${endpoint}:${key}`],
            arguments: ['60000'],
          }),
        );
        if (count > limit) throw new IamError('AUTH_RATE_LIMITED', 429);
        if (!refresh && count > 3) await setTimeout(Math.min(600, (count - 3) * 75));
      }
    } catch (error) {
      if (error instanceof IamError) throw error;
      throw new IamError('AUTH_UNAVAILABLE', 503);
    }
  }
}
