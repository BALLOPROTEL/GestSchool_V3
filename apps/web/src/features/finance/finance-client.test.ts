import { describe, expect, it } from 'vitest';
import { moneyMinor, parseMoney } from './finance-client';
describe('LOT 8 exact localized money', () => {
  it.each(['fr', 'en', 'ar'])('formats a EUR fraction without floating point in %s', (locale) => {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
    }).formatToParts(12n);
    const fraction = new Intl.NumberFormat(locale, { useGrouping: false }).format(50n);
    expect(moneyMinor('1250', 'EUR', locale)).toBe(
      parts.map((p) => (p.type === 'fraction' ? fraction : p.value)).join(''),
    );
  });
  it('preserves XOF above 2^53', () =>
    expect(moneyMinor('9007199254740993', 'XOF', 'en')).toContain('9,007,199,254,740,993'));
  it('preserves EUR above 2^53', () =>
    expect(moneyMinor('9007199254740993', 'EUR', 'en')).toContain('90,071,992,547,409.93'));
  it('preserves negative sub-unit amounts', () =>
    expect(moneyMinor('-50', 'EUR', 'en')).toBe('-€0.50'));
  it('parses EUR decimals as exact integers', () =>
    expect(parseMoney('12,50', 'EUR')).toBe('1250'));
  it('parses whole XOF', () => expect(parseMoney('125000', 'XOF')).toBe('125000'));
  it.each(['1.1', '-1', 'NaN', 'Infinity', '1e3', '1 000'])(
    'rejects invalid XOF input %s',
    (value) => expect(() => parseMoney(value, 'XOF')).toThrow('FINANCE_AMOUNT_INVALID'),
  );
  it('rejects excess EUR precision', () =>
    expect(() => parseMoney('0.001', 'EUR')).toThrow('FINANCE_AMOUNT_INVALID'));
});
