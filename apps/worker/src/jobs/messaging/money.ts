import { currencyDecimals, type FinanceCurrency } from '@gestschool/contracts';

// Keep the original Finance snapshot exact: Number would lose precision for
// supported BIGINT amounts and a frontend-calculated figure is not authoritative.
export function formatMinorAmount(amount: bigint, currency: FinanceCurrency): string {
  const decimals = currencyDecimals[currency];
  const scale = 10n ** BigInt(decimals);
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const sign = amount < 0n ? '-' : '';
  return `${sign}${whole}${decimals ? `.${String(fraction).padStart(decimals, '0')}` : ''} ${currency}`;
}
