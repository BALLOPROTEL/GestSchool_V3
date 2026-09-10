import {
  currencyDecimals,
  minorMaximum,
  type FinanceCurrency,
  type SessionView,
} from '@gestschool/contracts';
import { PeopleError, peopleRequest } from '../directory/people-client';
export const financeRequest = <T>(path: string, body?: unknown, method = 'GET', key?: string) =>
  peopleRequest<T>(`finance/${path}`, body, method, true, key ? { 'Idempotency-Key': key } : {});
export function canFinance(
  session: SessionView | undefined,
  permission = 'finance.read',
  scoped = true,
) {
  return Boolean(
    session?.grants.some(
      (g) =>
        g.permission === permission &&
        (g.scope === 'TENANT' ||
          (g.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN')) ||
          (scoped && ['OWN', 'CHILDREN'].includes(g.scope))),
    ),
  );
}
export function moneyMinor(amount: string, currency: string, locale: string) {
  if (!Object.hasOwn(currencyDecimals, currency)) throw new Error('Unsupported currency');
  const decimals = currencyDecimals[currency as FinanceCurrency],
    minor = BigInt(amount),
    negative = minor < 0n,
    absolute = negative ? -minor : minor,
    scale = 10n ** BigInt(decimals),
    whole = absolute / scale,
    remainder = absolute % scale;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const digits = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: Math.max(1, decimals),
  });
  return formatter
    .formatToParts(negative ? (whole === 0n ? -1n : -whole) : whole)
    .map((part) =>
      part.type === 'fraction'
        ? digits.format(remainder)
        : negative && whole === 0n && part.type === 'integer'
          ? new Intl.NumberFormat(locale, { useGrouping: false }).format(0n)
          : part.value,
    )
    .join('');
}
export function parseMoney(input: string, currency: FinanceCurrency): string {
  const decimals = currencyDecimals[currency],
    text = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new PeopleError('FINANCE_AMOUNT_INVALID');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new PeopleError('FINANCE_AMOUNT_INVALID');
  const amount =
    BigInt(whole ?? '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount > minorMaximum) throw new PeopleError('FINANCE_AMOUNT_INVALID');
  return String(amount);
}
export const financeErrors = {
  AUTH_INVALID_REQUEST: 'invalid',
  AUTH_FORBIDDEN: 'forbidden',
  AUTH_SESSION_EXPIRED: 'expired',
  FINANCE_NOT_FOUND: 'notFound',
  FINANCE_CONFLICT: 'conflict',
  FINANCE_REFERENCE_CONFLICT: 'referenceConflict',
  FINANCE_AMOUNT_INVALID: 'amountInvalid',
  FINANCE_AMOUNT_OUT_OF_RANGE: 'amountInvalid',
  FINANCE_INSUFFICIENT_BALANCE: 'insufficientBalance',
  FINANCE_OVERPAYMENT: 'overpayment',
  FINANCE_CURRENCY_MISMATCH: 'currencyMismatch',
  FINANCE_DUPLICATE_IDEMPOTENCY_KEY: 'idempotencyConflict',
  FINANCE_INVOICE_ALREADY_PAID: 'alreadyPaid',
  FINANCE_PAYMENT_ALREADY_VALIDATED: 'alreadyValidated',
  FINANCE_PAYMENT_CANCELLED: 'alreadyCancelled',
  FINANCE_CASH_SESSION_REQUIRED: 'cashRequired',
  FINANCE_CASH_SESSION_ALREADY_OPEN: 'cashAlreadyOpen',
  FINANCE_CASH_PENDING_PAYMENTS: 'cashPending',
  FINANCE_CASH_SESSION_INVALID: 'cashInvalid',
  FINANCE_INSTALLMENTS_INVALID: 'installmentsInvalid',
  FINANCE_ADJUSTMENT_INVALID: 'adjustmentInvalid',
  FINANCE_ENROLLMENT_NOT_ACTIVE: 'enrollmentInactive',
  FINANCE_STUDENT_ARCHIVED: 'studentArchived',
  FINANCE_YEAR_CLOSED: 'yearClosed',
  FINANCE_CLASS_ARCHIVED: 'classArchived',
  FINANCE_SCHEDULE_MISMATCH: 'scheduleMismatch',
  FINANCE_SCHEDULE_INVALID: 'scheduleInvalid',
  FINANCE_DATE_INVALID: 'dateInvalid',
  FINANCE_INVOICE_NOT_PAYABLE: 'notPayable',
  FINANCE_INVOICE_HAS_PAYMENTS: 'hasPayments',
  FINANCE_DUPLICATE_ALLOCATION: 'duplicateAllocation',
  FINANCE_ALLOCATION_REQUIRED: 'allocationRequired',
  FINANCE_STUDENT_MISMATCH: 'studentMismatch',
  FINANCE_INVALID_TRANSITION: 'invalidTransition',
  FINANCE_CANCELLATION_REQUEST_REQUIRED: 'requestRequired',
  FINANCE_FEE_TYPE_ARCHIVED: 'feeArchived',
  FINANCE_CLASS_YEAR_MISMATCH: 'classYearMismatch',
  FINANCE_ITEM_LIMIT: 'itemLimit',
} as const;
export function financeErrorKey(error: unknown) {
  return error instanceof PeopleError && Object.hasOwn(financeErrors, error.code)
    ? financeErrors[error.code as keyof typeof financeErrors]
    : 'unavailable';
}
