import { Prisma } from '@gestschool/database';
import { financeConflict } from '../domain/policy.js';
export async function financeReference(
  db: Prisma.TransactionClient,
  tenantId: string,
  kind: 'invoice' | 'payment' | 'receipt' | 'reversal',
) {
  // Called only under the tenant row lock. Fixed SQL identifiers; UUID remains the identity.
  const table = {
    invoice: Prisma.sql`invoices`,
    payment: Prisma.sql`payments`,
    receipt: Prisma.sql`receipts`,
    reversal: Prisma.sql`payment_reversals`,
  }[kind];
  const column = {
    invoice: Prisma.sql`invoice_number`,
    payment: Prisma.sql`payment_reference`,
    receipt: Prisma.sql`receipt_number`,
    reversal: Prisma.sql`reversal_reference`,
  }[kind];
  const prefix = `${{ invoice: 'FAC', payment: 'PAY', receipt: 'REC', reversal: 'REV' }[kind]}-${new Date().getUTCFullYear()}-`;
  const rows = await db.$queryRaw<{ maximum: string }[]>(
    Prisma.sql`SELECT coalesce(max(substring(${column} from ${prefix.length + 1}::integer)::numeric),0)::text maximum FROM ${table} WHERE tenant_id=${tenantId}::uuid AND ${column} ~ ${`^${prefix}[0-9]+$`}`,
  );
  const reference = `${prefix}${String(BigInt(rows[0]?.maximum ?? '0') + 1n).padStart(6, '0')}`;
  if (reference.length > 50) financeConflict('FINANCE_REFERENCE_CONFLICT');
  return reference;
}
