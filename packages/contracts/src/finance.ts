import { z } from 'zod';

// Explicit supported ISO 4217 registry, not a permissive three-letter currency guess.
export const currencyDecimals = { XOF: 0, EUR: 2, USD: 2, GBP: 2 } as const;
export const financeCurrency = z.enum(['XOF', 'EUR', 'USD', 'GBP']);
export type FinanceCurrency = z.infer<typeof financeCurrency>;
export const minorMaximum = 9223372036854775807n;
export const minorAmount = z
  .string()
  .refine((value) => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= minorMaximum);
export const positiveMinorAmount = z
  .string()
  .refine((value) => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= minorMaximum);
export const signedMinorAmount = z
  .string()
  .refine(
    (value) =>
      /^-?[1-9][0-9]{0,18}$/.test(value) &&
      BigInt(value) >= -minorMaximum &&
      BigInt(value) <= minorMaximum,
  );
export const financeReadPermissions = [
  'finance.read',
  'invoices.read',
  'payments.read',
  'receipts.read',
] as const;
export const financePermissionCodes = [
  ...financeReadPermissions,
  'fee-types.create',
  'fee-types.update',
  'fee-schedules.create',
  'fee-schedules.update',
  'invoices.create',
  'invoices.adjust',
  'payments.create',
  'payments.validate',
  'payments.cancel',
  'cash-sessions.read',
  'cash-sessions.open',
  'cash-sessions.close',
] as const;
export const financeResources = [
  'fee-types',
  'fee-schedules',
  'invoices',
  'payments',
  'receipts',
  'cash-sessions',
] as const;
export type FinanceResource = (typeof financeResources)[number];
export const financeQuery = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).default(''),
    academicYearId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    enrollmentId: z.uuid().optional(),
    classId: z.uuid().optional(),
    status: z
      .enum([
        'ALL',
        'ACTIVE',
        'ARCHIVED',
        'DRAFT',
        'ISSUED',
        'PARTIALLY_PAID',
        'PAID',
        'VOID',
        'PENDING',
        'COMPLETED',
        'REVERSED',
        'FAILED',
        'OPEN',
        'CLOSED',
      ])
      .default('ALL'),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER']).optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    overdue: z.enum(['true', 'false']).optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo);
export type FinanceQuery = z.infer<typeof financeQuery>;
const name = z.string().trim().min(1).max(120);
const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/);
const reason = z.string().trim().min(3).max(500);
const feeType = z.strictObject({ code, name });
const schedule = z.strictObject({
  code,
  name,
  academicYearId: z.uuid(),
  levelId: z.uuid().nullable().default(null),
  classId: z.uuid().nullable().default(null),
  currency: financeCurrency,
});
const installment = z.strictObject({
  amountMinor: positiveMinorAmount,
  dueOn: z.iso.date(),
  ordinal: z.number().int().min(1).max(100),
});
const item = z.strictObject({
  feeTypeId: z.uuid(),
  amountMinor: positiveMinorAmount,
  dueOn: z.iso.date(),
  installments: z.array(installment).max(100).default([]),
});
const empty = z.strictObject({});
const allocation = z.strictObject({ invoiceId: z.uuid(), amountMinor: positiveMinorAmount });
export const financePaymentInput = z.strictObject({
  studentId: z.uuid(),
  amountMinor: positiveMinorAmount,
  currency: financeCurrency,
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER']),
  cashSessionId: z.uuid().nullable().default(null),
  allocations: z.array(allocation).min(1).max(100),
});
export const financeCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('fee-type.create'), input: feeType }),
  z.strictObject({
    action: z.literal('fee-type.update'),
    id: z.uuid(),
    input: feeType.partial().refine((value) => Object.keys(value).length > 0),
  }),
  z.strictObject({ action: z.literal('fee-type.archive'), id: z.uuid(), input: empty }),
  z.strictObject({ action: z.literal('fee-type.restore'), id: z.uuid(), input: empty }),
  z.strictObject({ action: z.literal('schedule.create'), input: schedule }),
  z.strictObject({
    action: z.literal('schedule.update'),
    id: z.uuid(),
    input: schedule
      .omit({ levelId: true, classId: true })
      .partial()
      .extend({ levelId: z.uuid().nullable().optional(), classId: z.uuid().nullable().optional() })
      .refine((value) => Object.keys(value).length > 0),
  }),
  z.strictObject({ action: z.literal('item.create'), id: z.uuid(), input: item }),
  z.strictObject({ action: z.literal('item.update'), id: z.uuid(), itemId: z.uuid(), input: item }),
  z.strictObject({
    action: z.literal('item.delete'),
    id: z.uuid(),
    itemId: z.uuid(),
    input: empty,
  }),
  z.strictObject({
    action: z.literal('invoice.create'),
    input: z.strictObject({
      studentId: z.uuid(),
      enrollmentId: z.uuid(),
      feeScheduleId: z.uuid(),
      issuedOn: z.iso.date(),
    }),
  }),
  z.strictObject({
    action: z.literal('invoice.adjust'),
    id: z.uuid(),
    input: z.strictObject({
      kind: z.enum(['DISCOUNT', 'SCHOLARSHIP', 'CREDIT', 'DEBIT', 'CORRECTION']),
      amountMinor: signedMinorAmount,
      reason,
    }),
  }),
  z.strictObject({
    action: z.literal('invoice.void'),
    id: z.uuid(),
    input: z.strictObject({ reason }),
  }),
  z.strictObject({
    action: z.literal('payment.create'),
    key: z
      .string()
      .min(8)
      .max(100)
      .regex(/^[\w.:_-]+$/),
    input: financePaymentInput,
  }),
  z.strictObject({ action: z.literal('payment.validate'), id: z.uuid(), input: empty }),
  z.strictObject({
    action: z.literal('payment.reject'),
    id: z.uuid(),
    input: z.strictObject({ reason }),
  }),
  z.strictObject({
    action: z.literal('payment.request-cancellation'),
    id: z.uuid(),
    input: z.strictObject({ reason }),
  }),
  z.strictObject({
    action: z.literal('payment.cancel'),
    id: z.uuid(),
    input: z.strictObject({ reason, cashSessionId: z.uuid().nullable().default(null) }),
  }),
  z.strictObject({
    action: z.literal('cash.open'),
    input: z.strictObject({ currency: financeCurrency, openingAmountMinor: minorAmount }),
  }),
  z.strictObject({
    action: z.literal('cash.close'),
    id: z.uuid(),
    input: z.strictObject({ closingAmountMinor: minorAmount, reason }),
  }),
]);
export type FinanceCommand = z.infer<typeof financeCommand>;
export type FinancePaymentInput = z.infer<typeof financePaymentInput>;
export interface FeeTypeView {
  kind: 'fee-types';
  id: string;
  code: string;
  name: string;
  archivedAt: string | null;
}
export interface FeeItemView {
  id: string;
  feeTypeId: string;
  name: string;
  amountMinor: string;
  currency: string;
  dueOn: string | null;
  installments: {
    id: string;
    amountMinor: string;
    currency: string;
    dueOn: string;
    ordinal: number;
  }[];
}
export interface FeeScheduleView {
  kind: 'fee-schedules';
  id: string;
  code: string;
  name: string;
  academicYearId: string;
  yearName: string;
  levelId: string | null;
  classId: string | null;
  currency: string;
  items: FeeItemView[];
}
export interface InvoiceView {
  kind: 'invoices';
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  className: string | null;
  yearName: string | null;
  enrollmentId: string | null;
  academicYearId: string | null;
  currency: string;
  status: string;
  issuedOn: string;
  dueOn: string | null;
  subtotalMinor: string;
  adjustmentsMinor: string;
  totalAmountMinor: string;
  paidMinor: string;
  balanceMinor: string;
  overdueMinor: string;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitAmountMinor: string;
    totalAmountMinor: string;
    currency: string;
    dueOn: string | null;
    ordinal: number | null;
    balanceMinor: string;
  }[];
  adjustments: {
    id: string;
    kind: string;
    amountMinor: string;
    currency: string;
    reason: string;
    createdAt: string;
    actorMembershipId: string | null;
  }[];
}
export interface PaymentView {
  kind: 'payments';
  id: string;
  studentId: string | null;
  paymentReference: string;
  status: string;
  method: string;
  amountMinor: string;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  cashSessionId: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  allocations: { invoiceId: string; amountMinor: string; currency: string }[];
  reversals: {
    id: string;
    reversalReference: string;
    amountMinor: string;
    currency: string;
    reason: string;
    reversedAt: string;
    actorMembershipId: string | null;
  }[];
  receipts: ReceiptView[];
}
export interface ReceiptView {
  kind: 'receipts';
  id: string;
  paymentId: string;
  receiptNumber: string;
  amountMinor: string;
  currency: string;
  issuedAt: string;
  paymentStatus: string;
}
export interface CashSessionView {
  kind: 'cash-sessions';
  id: string;
  openedByMembershipId: string;
  status: string;
  currency: string;
  openingAmountMinor: string;
  closingAmountMinor: string | null;
  expectedClosingAmountMinor: string;
  differenceAmountMinor: string | null;
  closingReason: string | null;
  openedAt: string;
  closedAt: string | null;
}
export type FinanceView =
  FeeTypeView | FeeScheduleView | InvoiceView | PaymentView | ReceiptView | CashSessionView;
export interface FinanceList {
  items: FinanceView[];
  total: number;
  page: number;
  pageSize: number;
}
export interface FinanceSummary {
  currencies: {
    currency: string;
    invoicedMinor: string;
    collectedMinor: string;
    outstandingMinor: string;
    todayPaymentsMinor: string;
    unpaidInvoices: number;
    overdueMinor: string;
  }[];
}
