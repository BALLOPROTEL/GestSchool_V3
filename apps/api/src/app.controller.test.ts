import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('reports a healthy live status without checking dependencies', () => {
    const readiness = {
      async check() {
        throw new Error('the liveness endpoint must not call readiness');
      },
    };
    expect(new AppController(readiness).getLiveHealth()).toEqual({ status: 'ok' });
  });

  it('reports every ready dependency', async () => {
    const controller = new AppController({
      async check() {
        return { postgres: 'up', redis: 'up', storage: 'up' };
      },
    });

    await expect(controller.getReadyHealth()).resolves.toEqual({
      dependencies: { postgres: 'up', redis: 'up', storage: 'up' },
      status: 'ok',
    });
  });

  it('returns a service unavailable exception when a dependency is down', async () => {
    const controller = new AppController({
      async check() {
        return { postgres: 'down', redis: 'up', storage: 'up' };
      },
    });

    let captured: unknown;
    try {
      await controller.getReadyHealth();
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ServiceUnavailableException);
    if (!(captured instanceof ServiceUnavailableException)) {
      throw new Error('Expected ServiceUnavailableException');
    }
    expect(captured.getStatus()).toBe(503);
    expect(captured.getResponse()).toEqual({
      dependencies: { postgres: 'down', redis: 'up', storage: 'up' },
      status: 'error',
    });
  });
});
