import type { InfrastructureConfig } from '@gestschool/config/environment';

import { PostgresHealth } from './database/postgres-health.js';
import { RedisHealth } from './redis/redis-health.js';
import { S3StorageAdapter } from './storage/s3-storage-adapter.js';

export type DependencyName = 'postgres' | 'redis' | 'storage';
export type DependencyState = 'down' | 'up';
export type DependencyStates = Readonly<Record<DependencyName, DependencyState>>;

export interface DependencyHealthCheck {
  check(): Promise<void>;
  close?(): Promise<void> | void;
  readonly name: DependencyName;
}

export type InfrastructureChecks = Readonly<{
  postgres: DependencyHealthCheck;
  redis: DependencyHealthCheck;
  storage: DependencyHealthCheck;
}>;

export function createInfrastructureChecks(config: InfrastructureConfig): InfrastructureChecks {
  return {
    postgres: new PostgresHealth(config.databaseUrl),
    redis: new RedisHealth(config.redisUrl),
    storage: new S3StorageAdapter(config.storage),
  };
}

async function stateOf(check: DependencyHealthCheck): Promise<DependencyState> {
  try {
    await check.check();
    return 'up';
  } catch {
    return 'down';
  }
}

export async function checkInfrastructure(checks: InfrastructureChecks): Promise<DependencyStates> {
  const [postgres, redis, storage] = await Promise.all([
    stateOf(checks.postgres),
    stateOf(checks.redis),
    stateOf(checks.storage),
  ]);

  return { postgres, redis, storage };
}

export async function closeInfrastructureChecks(checks: InfrastructureChecks): Promise<void> {
  await Promise.all(Object.values(checks).map(async (check) => check.close?.()));
}

export function isInfrastructureReady(states: DependencyStates): boolean {
  return Object.values(states).every((state) => state === 'up');
}
