import {
  minorMaximum,
  type AccessScope,
  type FinanceCommand,
  type FinanceResource,
} from '@gestschool/contracts';
import { IamError, type RequestContext } from '../../iam/domain/context.js';
import { ScopePolicy } from '../../iam/domain/scope-policy.js';
export const financeReadScopes: AccessScope[] = ['PLATFORM', 'TENANT', 'OWN', 'CHILDREN'];
export const financeWriteScopes: AccessScope[] = ['PLATFORM', 'TENANT'];
export const resourcePermission: Record<FinanceResource, string> = {
  'fee-types': 'finance.read',
  'fee-schedules': 'finance.read',
  invoices: 'invoices.read',
  payments: 'payments.read',
  receipts: 'receipts.read',
  'cash-sessions': 'cash-sessions.read',
};
export function financeConflict(code: string): never {
  throw new IamError(code, 409);
}
export function financeFound<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new IamError('FINANCE_NOT_FOUND', 404);
  return value;
}
export function financeTenant(context: RequestContext, permission: string): boolean {
  return new ScopePolicy().allows(context, permission, { tenantId: context.tenantId });
}
export function financeAccess(context: RequestContext, permission: string, scoped = false) {
  if (financeTenant(context, permission)) return;
  if (
    scoped &&
    context.grants.some(
      (grant) => grant.permission === permission && ['OWN', 'CHILDREN'].includes(grant.scope),
    )
  )
    return;
  throw new IamError('AUTH_FORBIDDEN', 403);
}
export const commandPermission: Record<FinanceCommand['action'], string> = {
  'fee-type.create': 'fee-types.create',
  'fee-type.update': 'fee-types.update',
  'fee-type.archive': 'fee-types.update',
  'fee-type.restore': 'fee-types.update',
  'schedule.create': 'fee-schedules.create',
  'schedule.update': 'fee-schedules.update',
  'item.create': 'fee-schedules.update',
  'item.update': 'fee-schedules.update',
  'item.delete': 'fee-schedules.update',
  'invoice.create': 'invoices.create',
  'invoice.adjust': 'invoices.adjust',
  'invoice.void': 'invoices.adjust',
  'payment.create': 'payments.create',
  'payment.validate': 'payments.validate',
  'payment.reject': 'payments.validate',
  'payment.request-cancellation': 'payments.cancel',
  'payment.cancel': 'payments.cancel',
  'cash.open': 'cash-sessions.open',
  'cash.close': 'cash-sessions.close',
};
export function checkedMinor(value: bigint): bigint {
  if (value < 0n || value > minorMaximum) financeConflict('FINANCE_AMOUNT_OUT_OF_RANGE');
  return value;
}
export function invoiceBalance(total: bigint, paid: bigint) {
  if (paid > total) financeConflict('FINANCE_OVERPAYMENT');
  return checkedMinor(total - paid);
}
export function invoiceStatus(total: bigint, paid: bigint): 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' {
  invoiceBalance(total, paid);
  return paid === total ? 'PAID' : paid > 0n ? 'PARTIALLY_PAID' : 'ISSUED';
}
export function installmentPolicy(
  amount: bigint,
  dates: { startsOn: string; endsOn: string },
  installments: { amountMinor: string; dueOn: string; ordinal: number }[],
) {
  if (!installments.length) return;
  const ordered = installments.toSorted((a, b) => a.ordinal - b.ordinal);
  if (
    ordered.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) !== amount ||
    new Set(ordered.map((row) => row.ordinal)).size !== ordered.length ||
    ordered.some(
      (row, i) =>
        row.dueOn < dates.startsOn ||
        row.dueOn > dates.endsOn ||
        row.dueOn < (ordered[i - 1]?.dueOn ?? row.dueOn),
    )
  )
    financeConflict('FINANCE_INSTALLMENTS_INVALID');
}
export function adjustmentPolicy(kind: string, amount: bigint) {
  if (
    !amount ||
    (['DISCOUNT', 'SCHOLARSHIP', 'CREDIT'].includes(kind) && amount > 0n) ||
    (kind === 'DEBIT' && amount < 0n)
  )
    financeConflict('FINANCE_ADJUSTMENT_INVALID');
}
