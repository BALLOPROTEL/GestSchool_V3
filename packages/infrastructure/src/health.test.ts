import { describe, expect, it } from 'vitest';

import {
  checkInfrastructure,
  isInfrastructureReady,
  type DependencyHealthCheck,
  type InfrastructureChecks,
} from './health.js';

function check(name: DependencyHealthCheck['name'], available: boolean): DependencyHealthCheck {
  return {
    async check() {
      if (!available) throw new Error(`${name} unavailable`);
    },
    name,
  };
}

function checks(overrides: Partial<Record<DependencyHealthCheck['name'], boolean>> = {}) {
  return {
    postgres: check('postgres', overrides.postgres ?? true),
    redis: check('redis', overrides.redis ?? true),
    storage: check('storage', overrides.storage ?? true),
  } satisfies InfrastructureChecks;
}

describe('infrastructure readiness', () => {
  it('reports every healthy dependency', async () => {
    const result = await checkInfrastructure(checks());
    expect(result).toEqual({ postgres: 'up', redis: 'up', storage: 'up' });
    expect(isInfrastructureReady(result)).toBe(true);
  });

  it('keeps an isolated dependency failure visible', async () => {
    const result = await checkInfrastructure(checks({ postgres: false }));
    expect(result).toEqual({ postgres: 'down', redis: 'up', storage: 'up' });
    expect(isInfrastructureReady(result)).toBe(false);
  });
});
