import { Prisma } from '@gestschool/database';
import type { FinanceQuery } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { financeTenant } from '../domain/policy.js';
export function studentScope(
  context: RequestContext,
  permission: string,
): Prisma.StudentWhereInput {
  if (financeTenant(context, permission)) return { tenantId: context.tenantId };
  const OR: Prisma.StudentWhereInput[] = [];
  if (context.grants.some((g) => g.permission === permission && g.scope === 'OWN'))
    OR.push({ userId: context.userId });
  if (context.grants.some((g) => g.permission === permission && g.scope === 'CHILDREN'))
    OR.push({
      guardians: {
        some: {
          tenantId: context.tenantId,
          guardian: { userId: context.userId, status: 'ACTIVE' },
        },
      },
    });
  return { tenantId: context.tenantId, OR };
}
// Alias s is fixed by the callers, never taken from request input.
export function studentSqlScope(context: RequestContext, permission: string): Prisma.Sql {
  if (financeTenant(context, permission)) return Prisma.sql`TRUE`;
  const own = context.grants.some((g) => g.permission === permission && g.scope === 'OWN');
  const children = context.grants.some(
    (g) => g.permission === permission && g.scope === 'CHILDREN',
  );
  return Prisma.sql`((${own} AND s.user_id=${context.userId}::uuid) OR (${children} AND EXISTS (SELECT 1 FROM student_guardians sg JOIN guardians g ON (g.tenant_id,g.id)=(sg.tenant_id,sg.guardian_id) WHERE sg.tenant_id=${context.tenantId}::uuid AND sg.student_id=s.id AND g.user_id=${context.userId}::uuid AND g.status='ACTIVE')))`;
}
export function invoiceFilters(q: FinanceQuery): Prisma.InvoiceWhereInput {
  return {
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.enrollmentId ? { enrollmentId: q.enrollmentId } : {}),
    ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
    ...(q.classId ? { enrollment: { schoolClassId: q.classId } } : {}),
  };
}
export function paymentWhere(
  context: RequestContext,
  q: FinanceQuery,
  permission = 'payments.read',
): Prisma.PaymentWhereInput {
  return {
    tenantId: context.tenantId,
    student: { is: studentScope(context, permission) },
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.status === 'ALL'
      ? {}
      : {
          status: {
            in: (['PENDING', 'COMPLETED', 'REVERSED', 'FAILED'] as const).filter(
              (s) => s === q.status,
            ),
          },
        }),
    ...(q.paymentMethod ? { method: q.paymentMethod } : {}),
    ...(q.search ? { paymentReference: { contains: q.search, mode: 'insensitive' } } : {}),
    ...(q.dateFrom || q.dateTo
      ? {
          createdAt: {
            ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
            ...(q.dateTo ? { lt: new Date(new Date(q.dateTo).getTime() + 86400000) } : {}),
          },
        }
      : {}),
    ...(q.academicYearId || q.enrollmentId || q.classId
      ? { allocations: { some: { tenantId: context.tenantId, invoice: invoiceFilters(q) } } }
      : {}),
  };
}
export function invoiceCte(
  context: RequestContext,
  q: FinanceQuery,
  permission = 'invoices.read',
): Prisma.Sql {
  const tid = context.tenantId;
  return Prisma.sql`WITH selected AS (
    SELECT i.* FROM invoices i JOIN students s ON (s.tenant_id,s.id)=(i.tenant_id,i.student_id)
    WHERE i.tenant_id=${tid}::uuid AND ${studentSqlScope(context, permission)}
    ${q.studentId ? Prisma.sql`AND i.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${q.enrollmentId ? Prisma.sql`AND i.enrollment_id=${q.enrollmentId}::uuid` : Prisma.empty}
    ${q.academicYearId ? Prisma.sql`AND i.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
    ${q.classId ? Prisma.sql`AND EXISTS (SELECT 1 FROM enrollments e WHERE (e.tenant_id,e.id)=(i.tenant_id,i.enrollment_id) AND e.school_class_id=${q.classId}::uuid)` : Prisma.empty}
    ${q.status === 'ALL' ? Prisma.empty : Prisma.sql`AND i.status::text=${q.status}`}
    ${q.search ? Prisma.sql`AND position(lower(${q.search}) in lower(i.invoice_number || ' ' || coalesce(i.student_name,s.first_name || ' ' || s.last_name)))>0` : Prisma.empty}
    ${q.dateFrom ? Prisma.sql`AND i.issued_on>=${q.dateFrom}::date` : Prisma.empty}
    ${q.dateTo ? Prisma.sql`AND i.issued_on<=${q.dateTo}::date` : Prisma.empty}
  ), paid AS (
    SELECT a.invoice_id,sum(a.amount_minor) amount, sum(a.amount_minor) FILTER (WHERE p.paid_at>=CURRENT_DATE AND p.paid_at<CURRENT_DATE+1) today
    FROM payment_allocations a JOIN payments p ON (p.tenant_id,p.id)=(a.tenant_id,a.payment_id) JOIN selected i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id)
    WHERE a.tenant_id=${tid}::uuid AND p.status='COMPLETED' GROUP BY a.invoice_id
  ), adjustments AS (
    SELECT a.invoice_id,sum(a.amount_minor) amount FROM invoice_adjustments a JOIN selected i ON (i.tenant_id,i.id)=(a.tenant_id,a.invoice_id) WHERE a.tenant_id=${tid}::uuid GROUP BY a.invoice_id
  ), matured AS (
    SELECT l.invoice_id,sum(l.total_amount_minor) amount FROM invoice_lines l JOIN selected i ON (i.tenant_id,i.id)=(l.tenant_id,l.invoice_id) WHERE l.tenant_id=${tid}::uuid AND coalesce(l.due_on,i.due_on)<CURRENT_DATE GROUP BY l.invoice_id
  ), balances AS (
    SELECT i.*,coalesce(p.amount,0) paid,coalesce(p.today,0) today,
      i.total_amount_minor-coalesce(p.amount,0) balance,
      CASE WHEN i.status IN ('DRAFT','VOID') THEN 0 ELSE greatest(0,least(i.total_amount_minor,coalesce(m.amount,0)+CASE WHEN coalesce(a.amount,0)<0 OR i.due_on<CURRENT_DATE THEN coalesce(a.amount,0) ELSE 0 END)-coalesce(p.amount,0)) END overdue
    FROM selected i LEFT JOIN paid p ON p.invoice_id=i.id LEFT JOIN adjustments a ON a.invoice_id=i.id LEFT JOIN matured m ON m.invoice_id=i.id
  ), filtered AS (SELECT * FROM balances ${q.overdue === 'true' ? Prisma.sql`WHERE overdue>0` : q.overdue === 'false' ? Prisma.sql`WHERE overdue=0` : Prisma.empty})`;
}
