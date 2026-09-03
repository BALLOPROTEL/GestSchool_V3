import { describe, expect, it } from 'vitest';

import { FOUNDATION_MESSAGE } from './foundation';

describe('foundation message', () => {
  it('identifies the ready foundation', () => {
    expect(FOUNDATION_MESSAGE).toBe('GestSchool — Foundation Ready');
  });
});
