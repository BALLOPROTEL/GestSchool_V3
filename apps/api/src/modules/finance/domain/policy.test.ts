import { describe, expect, it } from 'vitest';
import {
  financeCommand,
  financeQuery,
  minorMaximum,
  positiveMinorAmount,
  roleGrants,
  type SystemRole,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import {
  adjustmentPolicy,
  checkedMinor,
  financeAccess,
  invoiceBalance,
  invoiceStatus,
  installmentPolicy,
} from './policy.js';
function context(role: SystemRole): RequestContext {
  return {
    tenantId: 'tenant',
    userId: 'user',
    membershipId: 'member',
    sessionId: 'session',
    roles: [role],
    grants: [...roleGrants[role]],
    requestId: 'request',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
  };
}
describe('LOT 8 money and permission policy', () => {
  it.each(['0', '-1', '1.2', '1e3', 'NaN', 'Infinity', '01', '9223372036854775808'])(
    'rejects non-positive/noncanonical/out-of-range money %s',
    (input) => expect(positiveMinorAmount.safeParse(input).success).toBe(false),
  );
  it('preserves money beyond JS safe integer', () => {
    expect(positiveMinorAmount.parse('9007199254740993')).toBe('9007199254740993');
    expect(invoiceBalance(9007199254740993n, 1250n)).toBe(9007199254739743n);
  });
  it('accepts the BIGINT maximum exactly', () =>
    expect(checkedMinor(minorMaximum)).toBe(minorMaximum));
  it('rejects total overflow', () =>
    expect(() => checkedMinor(minorMaximum + 1n)).toThrow('FINANCE_AMOUNT_OUT_OF_RANGE'));
  it('rejects an overpayment', () =>
    expect(() => invoiceBalance(100n, 101n)).toThrow('FINANCE_OVERPAYMENT'));
  it('computes both partial payments', () => {
    expect(invoiceBalance(300000n, 100000n)).toBe(200000n);
    expect(invoiceBalance(300000n, 150000n)).toBe(150000n);
    expect(invoiceStatus(300000n, 150000n)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus(300000n, 300000n)).toBe('PAID');
  });
  it('allows a zero-total invoice after a full scholarship', () =>
    expect(invoiceStatus(0n, 0n)).toBe('PAID'));
  it.each(['DISCOUNT', 'SCHOLARSHIP', 'CREDIT'])('requires a negative %s', (kind) => {
    expect(() => adjustmentPolicy(kind, 1n)).toThrow('FINANCE_ADJUSTMENT_INVALID');
    expect(() => adjustmentPolicy(kind, -1n)).not.toThrow();
  });
  it('requires a positive debit', () =>
    expect(() => adjustmentPolicy('DEBIT', -1n)).toThrow('FINANCE_ADJUSTMENT_INVALID'));
  const dates = { startsOn: '2026-09-01', endsOn: '2027-06-30' };
  const parts = [
    { amountMinor: '100', ordinal: 1, dueOn: '2026-09-30' },
    { amountMinor: '200', ordinal: 2, dueOn: '2027-01-31' },
  ];
  it('accepts a complete chronological installment plan', () =>
    expect(() => installmentPolicy(300n, dates, parts)).not.toThrow());
  it('rejects an incomplete plan', () =>
    expect(() => installmentPolicy(301n, dates, parts)).toThrow('FINANCE_INSTALLMENTS_INVALID'));
  it('rejects duplicate ordinals', () =>
    expect(() =>
      installmentPolicy(
        300n,
        dates,
        parts.map((p) => ({ ...p, ordinal: 1 })),
      ),
    ).toThrow('FINANCE_INSTALLMENTS_INVALID'));
  it('rejects an out-of-year due date', () =>
    expect(() =>
      installmentPolicy(
        300n,
        dates,
        parts.map((p) => ({ ...p, dueOn: '2028-01-01' })),
      ),
    ).toThrow('FINANCE_INSTALLMENTS_INVALID'));
  it('rejects reversed chronology', () =>
    expect(() =>
      installmentPolicy(300n, dates, [{ ...parts[0]!, dueOn: '2027-02-01' }, parts[1]!]),
    ).toThrow('FINANCE_INSTALLMENTS_INVALID'));
  it.each(['SCHOOL_ADMIN', 'ACCOUNTANT'] as const)('%s may capture and cancel', (role) => {
    expect(() => financeAccess(context(role), 'payments.create')).not.toThrow();
    expect(() => financeAccess(context(role), 'payments.cancel')).not.toThrow();
  });
  it.each(['TEACHER', 'ACADEMIC_STAFF', 'PARENT', 'STUDENT', 'DIRECTOR'] as const)(
    '%s cannot capture payments',
    (role) =>
      expect(() => financeAccess(context(role), 'payments.create')).toThrow('AUTH_FORBIDDEN'),
  );
  it('keeps accountant grades.update forbidden', () =>
    expect(() => financeAccess(context('ACCOUNTANT'), 'grades.update')).toThrow('AUTH_FORBIDDEN'));
  it.each(['PARENT', 'STUDENT'] as const)('%s has scoped reading only', (role) => {
    expect(() => financeAccess(context(role), 'invoices.read', true)).not.toThrow();
    expect(() => financeAccess(context(role), 'cash-sessions.read')).toThrow('AUTH_FORBIDDEN');
    expect(() => financeAccess(context(role), 'finance.read')).toThrow('AUTH_FORBIDDEN');
  });
  it('denies a forged platform grant without SUPER_ADMIN', () =>
    expect(() =>
      financeAccess(
        { ...context('TEACHER'), grants: [{ permission: 'payments.create', scope: 'PLATFORM' }] },
        'payments.create',
      ),
    ).toThrow('AUTH_FORBIDDEN'));
  it('rejects tenant injection in queries', () =>
    expect(financeQuery.safeParse({ tenantId: 'foreign' }).success).toBe(false));
  it('bounds pagination', () =>
    expect(financeQuery.safeParse({ pageSize: 101 }).success).toBe(false));
  it('rejects tenant or total injection in commands', () =>
    expect(
      financeCommand.safeParse({
        action: 'fee-type.create',
        input: { name: 'Fee', code: 'FEE', tenantId: 'foreign' },
      }).success,
    ).toBe(false));
});
