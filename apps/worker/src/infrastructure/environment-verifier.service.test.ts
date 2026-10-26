import { Logger } from '@nestjs/common';
import type { InfrastructureConfig } from '@gestschool/config/environment';
import { afterEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({ check: vi.fn(), close: vi.fn() }));
vi.mock('@gestschool/infrastructure', () => ({
  createInfrastructureChecks: () => ({}),
  checkInfrastructure: health.check,
  closeInfrastructureChecks: health.close,
  isInfrastructureReady: (states: Record<string, string>) =>
    Object.values(states).every((state) => state === 'up'),
}));

import { EnvironmentVerifier } from './environment-verifier.service.js';

afterEach(() => vi.restoreAllMocks());

describe('worker dependency failure diagnostics', () => {
  it('keeps a healthy worker ready without a warning', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const states = { postgres: 'up', redis: 'up', storage: 'up' };
    health.check.mockResolvedValue(states);
    const verifier = new EnvironmentVerifier({} as InfrastructureConfig);
    await expect(verifier.verify()).resolves.toEqual(states);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['postgres', 'redis', 'storage'])(
    'keeps %s failure closed and logs only fixed dependency states',
    async (dependency) => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const states = { postgres: 'up', redis: 'up', storage: 'up', [dependency]: 'down' };
      health.check.mockResolvedValue(states);
      const verifier = new EnvironmentVerifier({
        databaseUrl: 'postgresql://fixture:secret_canary@fixture.invalid/fixture',
      } as InfrastructureConfig);
      await expect(verifier.verify()).rejects.toThrow(
        `Worker dependencies unavailable: ${dependency}`,
      );
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `Worker dependencies unavailable (postgres=${states.postgres}, redis=${states.redis}, storage=${states.storage})`,
      );
    },
  );
});
