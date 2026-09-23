import { describe, expect, it } from 'vitest';
import { formatMinorAmount } from './money.js';

describe('Finance snapshot amount formatting', () => {
  it('respects the configured ISO currency exponent without floating point', () => {
    expect(formatMinorAmount(300000n, 'XOF')).toBe('300000 XOF');
    expect(formatMinorAmount(1250n, 'EUR')).toBe('12.50 EUR');
    expect(formatMinorAmount(9223372036854775807n, 'USD')).toBe('92233720368547758.07 USD');
  });
});
