import { describe, expect, it } from 'vitest';

import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('reports a healthy live status', () => {
    expect(new AppController().getLiveHealth()).toEqual({ status: 'ok' });
  });
});
