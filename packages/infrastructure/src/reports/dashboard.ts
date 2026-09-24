import type { DashboardQuery, DashboardSummary, ReportActor } from '@gestschool/contracts';
import { Prisma, type GestSchoolPrismaClient } from '@gestschool/database';
import { ReportAccessError, reportAssignedClass, reportGrant, reportStudentScope } from './data.js';

const number = (value: bigint | undefined) => Number(value ?? 0n);
function safeTimezone(value: string | undefined): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch {
    return 'UTC';
  }
}
export class DashboardDataEngine {
  constructor(private readonly db: GestSchoolPrismaClient) {}

  async summary(actor: ReportActor, query: DashboardQuery): Promise<DashboardSummary> {
    if (!reportGrant(actor, 'dashboards.read')) throw new ReportAccessError('AUTH_FORBIDDEN');
    const year = query.academicYearId
      ? await this.db.academicYear.findFirst({
          where: { tenantId: actor.tenantId, id: query.academicYearId },
        })
      : await this.db.academicYear.findFirst({
          where: { tenantId: actor.tenantId, status: 'ACTIVE' },
          orderBy: { startsOn: 'desc' },
        });
    if (query.academicYearId && !year) throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    const period = query.periodId
      ? await this.db.academicPeriod.findFirst({
          where: {
            tenantId: actor.tenantId,
            id: query.periodId,
            ...(year ? { academicYearId: year.id } : {}),
          },
        })
      : year
        ? await this.db.academicPeriod.findFirst({
            where: { tenantId: actor.tenantId, academicYearId: year.id, status: 'ACTIVE' },
            orderBy: { ordinal: 'asc' },
          })
        : null;
    if (query.periodId && !period) throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    const tid = actor.tenantId;
    const timezone = safeTimezone(
      (
        await this.db.tenantSetting.findUnique({
          where: { tenantId: tid },
          select: { timezone: true },
        })
      )?.timezone,
    );
    const counts: Record<string, number> = {};
    let classEnrollment: { label: string; value: number }[] = [];
    let students: DashboardSummary['students'] = [];
    if (reportGrant(actor, 'students.read')) {
      const rows = await this.db.$queryRaw<
        { students: bigint; enrollments: bigint; teachers: bigint; classes: bigint }[]
      >(Prisma.sql`
        SELECT
          count(DISTINCT s.id) FILTER (WHERE s.status='ACTIVE') students,
          count(DISTINCT e.id) FILTER (WHERE e.status='ACTIVE') enrollments,
          (SELECT count(*) FROM teachers t WHERE t.tenant_id=${tid}::uuid AND t.status='ACTIVE') teachers,
          count(DISTINCT c.id) classes
        FROM students s LEFT JOIN enrollments e ON (e.tenant_id,e.student_id)=(s.tenant_id,s.id)
          ${year ? Prisma.sql`AND e.academic_year_id=${year.id}::uuid` : Prisma.empty}
        LEFT JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
        WHERE s.tenant_id=${tid}::uuid AND ${reportStudentScope(actor, 'students.read')}`);
      counts['activeStudents'] = number(rows[0]?.students);
      counts['activeEnrollments'] = number(rows[0]?.enrollments);
      if (
        reportGrant(actor, 'teachers.read', 'TENANT') ||
        reportGrant(actor, 'teachers.read', 'PLATFORM')
      )
        counts['activeTeachers'] = number(rows[0]?.teachers);
      counts['classes'] = number(rows[0]?.classes);
      const grouped = await this.db.$queryRaw<{ label: string; value: bigint }[]>(Prisma.sql`
        SELECT c.name label,count(DISTINCT e.id) value FROM enrollments e
        JOIN students s ON (s.tenant_id,s.id)=(e.tenant_id,e.student_id)
        JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
        WHERE e.tenant_id=${tid}::uuid AND e.status='ACTIVE' AND ${reportStudentScope(actor, 'students.read')}
          ${year ? Prisma.sql`AND e.academic_year_id=${year.id}::uuid` : Prisma.empty}
        GROUP BY c.id,c.name ORDER BY c.name LIMIT 20`);
      classEnrollment = grouped.map((row) => ({ label: row.label, value: number(row.value) }));
      students = await this.db.$queryRaw<DashboardSummary['students']>(Prisma.sql`
        SELECT s.id,s.first_name||' '||s.last_name name,s.matricule,c.name "className",y.name "academicYear"
        FROM students s LEFT JOIN enrollments e ON (e.tenant_id,e.student_id)=(s.tenant_id,s.id) AND e.status='ACTIVE'
          ${year ? Prisma.sql`AND e.academic_year_id=${year.id}::uuid` : Prisma.empty}
        LEFT JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
        LEFT JOIN academic_years y ON (y.tenant_id,y.id)=(e.tenant_id,e.academic_year_id)
        WHERE s.tenant_id=${tid}::uuid AND s.status='ACTIVE' AND ${reportStudentScope(actor, 'students.read')}
        ORDER BY s.last_name,s.first_name LIMIT 20`);
    }
    const money: DashboardSummary['money'] = [];
    let feeTypeBreakdown: DashboardSummary['feeTypeBreakdown'] = [];
    if (reportGrant(actor, 'invoices.read')) {
      const rows = await this.db.$queryRaw<
        {
          currency: string;
          invoiced: bigint;
          collected: bigint;
          reversed: bigint;
          outstanding: bigint;
        }[]
      >(Prisma.sql`
        WITH selected AS (
          SELECT i.* FROM invoices i JOIN students s ON (s.tenant_id,s.id)=(i.tenant_id,i.student_id)
          WHERE i.tenant_id=${tid}::uuid AND i.status NOT IN ('DRAFT','VOID') AND ${reportStudentScope(actor, 'invoices.read')}
            ${year ? Prisma.sql`AND i.academic_year_id=${year.id}::uuid` : Prisma.empty}
        ), paid AS (
          SELECT pa.invoice_id,sum(pa.amount_minor) amount FROM payment_allocations pa JOIN payments p
            ON (p.tenant_id,p.id)=(pa.tenant_id,pa.payment_id)
          JOIN selected i ON i.id=pa.invoice_id WHERE p.status='COMPLETED' GROUP BY pa.invoice_id
        ), reversals AS (
          SELECT p.currency,sum(r.amount_minor) amount FROM payment_reversals r JOIN payments p
            ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id)
          JOIN students s ON (s.tenant_id,s.id)=(p.tenant_id,p.student_id)
          WHERE p.tenant_id=${tid}::uuid AND ${reportStudentScope(actor, 'invoices.read')} GROUP BY p.currency
        )
        SELECT i.currency,sum(i.total_amount_minor) invoiced,sum(coalesce(p.amount,0)) collected,
          coalesce(max(r.amount),0) reversed,sum(greatest(i.total_amount_minor-coalesce(p.amount,0),0)) outstanding
        FROM selected i LEFT JOIN paid p ON p.invoice_id=i.id LEFT JOIN reversals r ON r.currency=i.currency
        GROUP BY i.currency ORDER BY i.currency`);
      money.push(
        ...rows.map((row) => ({
          currency: row.currency,
          invoicedMinor: String(row.invoiced),
          collectedMinor: String(row.collected),
          reversedMinor: String(row.reversed),
          // LOT 8 excludes REVERSED payments from allocations, so this value is already net.
          netCollectedMinor: String(row.collected),
          outstandingMinor: String(row.outstanding),
        })),
      );
      const financeCounts = await this.db.$queryRaw<
        {
          issued: bigint;
          paid: bigint;
          partial: bigint;
          unpaid: bigint;
          today: bigint;
          period: bigint;
        }[]
      >(Prisma.sql`
        SELECT count(DISTINCT i.id) FILTER (WHERE i.status NOT IN ('DRAFT','VOID')) issued,
          count(DISTINCT i.id) FILTER (WHERE i.status='PAID') paid,
          count(DISTINCT i.id) FILTER (WHERE i.status='PARTIALLY_PAID') partial,
          count(DISTINCT i.id) FILTER (WHERE i.status='ISSUED') unpaid,
          count(DISTINCT p.id) FILTER (WHERE p.status='COMPLETED'
            AND (p.paid_at AT TIME ZONE ${timezone})::date=(now() AT TIME ZONE ${timezone})::date) today,
          count(DISTINCT p.id) FILTER (WHERE p.status='COMPLETED') period
        FROM students s LEFT JOIN invoices i ON (i.tenant_id,i.student_id)=(s.tenant_id,s.id)
          ${year ? Prisma.sql`AND i.academic_year_id=${year.id}::uuid` : Prisma.empty}
        LEFT JOIN payments p ON (p.tenant_id,p.student_id)=(s.tenant_id,s.id)
        WHERE s.tenant_id=${tid}::uuid AND ${reportStudentScope(actor, 'invoices.read')}
          ${query.dateFrom ? Prisma.sql`AND (p.paid_at IS NULL OR (p.paid_at AT TIME ZONE ${timezone})::date>=${query.dateFrom}::date)` : Prisma.empty}
          ${query.dateTo ? Prisma.sql`AND (p.paid_at IS NULL OR (p.paid_at AT TIME ZONE ${timezone})::date<=${query.dateTo}::date)` : Prisma.empty}`);
      counts['invoicesIssued'] = number(financeCounts[0]?.issued);
      counts['invoicesPaid'] = number(financeCounts[0]?.paid);
      counts['invoicesPartiallyPaid'] = number(financeCounts[0]?.partial);
      counts['invoicesUnpaid'] = number(financeCounts[0]?.unpaid);
      counts['paymentsToday'] = number(financeCounts[0]?.today);
      counts['paymentsPeriod'] = number(financeCounts[0]?.period);
      if (reportGrant(actor, 'cash-sessions.read', 'TENANT'))
        counts['openCashSessions'] = await this.db.cashSession.count({
          where: { tenantId: tid, status: 'OPEN' },
        });
      const feeRows = await this.db.$queryRaw<
        { label: string; currency: string; amountMinor: bigint }[]
      >(Prisma.sql`
        SELECT coalesce(f.name,l.description) label,i.currency,sum(l.total_amount_minor) "amountMinor"
        FROM invoice_lines l JOIN invoices i ON (i.tenant_id,i.id)=(l.tenant_id,l.invoice_id)
        JOIN students s ON (s.tenant_id,s.id)=(i.tenant_id,i.student_id)
        LEFT JOIN fee_types f ON (f.tenant_id,f.id)=(l.tenant_id,l.fee_type_id)
        WHERE i.tenant_id=${tid}::uuid AND i.status NOT IN ('DRAFT','VOID') AND ${reportStudentScope(actor, 'invoices.read')}
          ${year ? Prisma.sql`AND i.academic_year_id=${year.id}::uuid` : Prisma.empty}
        GROUP BY coalesce(f.name,l.description),i.currency ORDER BY coalesce(f.name,l.description) LIMIT 20`);
      feeTypeBreakdown = feeRows.map((item) => ({
        label: item.label,
        currency: item.currency,
        amountMinor: String(item.amountMinor),
      }));
    }
    if (reportGrant(actor, 'academic-years.read')) {
      counts['academicYears'] = await this.db.academicYear.count({
        where: { tenantId: tid, status: { not: 'ARCHIVED' } },
      });
      counts['academicPeriods'] = await this.db.academicPeriod.count({
        where: { tenantId: tid, status: 'ACTIVE', ...(year ? { academicYearId: year.id } : {}) },
      });
      counts['levels'] = await this.db.level.count({ where: { tenantId: tid, status: 'ACTIVE' } });
    }
    let academicAverages: DashboardSummary['academicAverages'] = [];
    if (reportGrant(actor, 'grades.read')) {
      const resultRows = await this.db.$queryRaw<{ published: bigint; cards: bigint }[]>(Prisma.sql`
        SELECT count(DISTINCT g.id) FILTER (WHERE g.status IN ('PUBLISHED','LOCKED')) published,
          count(DISTINCT r.id) FILTER (WHERE r.status IN ('PUBLISHED','LOCKED')) cards
        FROM students s LEFT JOIN grades g ON (g.tenant_id,g.student_id)=(s.tenant_id,s.id)
        LEFT JOIN report_cards r ON (r.tenant_id,r.student_id)=(s.tenant_id,s.id)
        WHERE s.tenant_id=${tid}::uuid AND ${reportStudentScope(actor, 'grades.read')}
          ${period ? Prisma.sql`AND (r.academic_period_id IS NULL OR r.academic_period_id=${period.id}::uuid)` : Prisma.empty}`);
      counts['publishedResults'] = number(resultRows[0]?.published);
      counts['publishedReportCards'] = number(resultRows[0]?.cards);
      const assessmentAccess =
        reportGrant(actor, 'grades.read', 'TENANT') || reportGrant(actor, 'grades.read', 'PLATFORM')
          ? Prisma.sql`TRUE`
          : reportGrant(actor, 'grades.read', 'ASSIGNED')
            ? reportAssignedClass(actor, Prisma.sql`c.id`)
            : Prisma.sql`FALSE`;
      const workflow = await this.db.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
        SELECT a.status::text status,count(*) FROM assessments a
        JOIN class_subjects cs ON (cs.tenant_id,cs.id)=(a.tenant_id,a.class_subject_id)
        JOIN school_classes c ON (c.tenant_id,c.id)=(cs.tenant_id,cs.school_class_id)
        WHERE a.tenant_id=${tid}::uuid AND ${assessmentAccess}
          ${period ? Prisma.sql`AND a.academic_period_id=${period.id}::uuid` : Prisma.empty}
        GROUP BY a.status`);
      counts['assessments'] = workflow.reduce((sum, row) => sum + number(row.count), 0);
      for (const row of workflow)
        counts[`results${row.status[0]}${row.status.slice(1).toLowerCase()}`] = number(row.count);
      academicAverages = await this.db.$queryRaw<{ label: string; average: string }[]>(Prisma.sql`
        SELECT c.name label,round(avg(r.overall_average),2)::text average FROM report_cards r
        JOIN school_classes c ON (c.tenant_id,c.id)=(r.tenant_id,r.school_class_id)
        JOIN students s ON (s.tenant_id,s.id)=(r.tenant_id,r.student_id)
        WHERE r.tenant_id=${tid}::uuid AND r.status IN ('PUBLISHED','LOCKED') AND r.overall_average IS NOT NULL
          AND ${reportStudentScope(actor, 'grades.read')}
          ${period ? Prisma.sql`AND r.academic_period_id=${period.id}::uuid` : Prisma.empty}
        GROUP BY c.id,c.name ORDER BY c.name LIMIT 20`);
    }
    if (reportGrant(actor, 'documents.read')) {
      const rows = await this.db.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
        SELECT d.generation_status::text status,count(*) FROM documents d
        JOIN students s ON (s.tenant_id,s.id)=(d.tenant_id,d.student_id)
        WHERE d.tenant_id=${tid}::uuid AND d.generation_status IS NOT NULL
          AND ${reportStudentScope(actor, 'documents.read')} GROUP BY d.generation_status`);
      for (const row of rows)
        counts[`documents${row.status[0]}${row.status.slice(1).toLowerCase()}`] = number(row.count);
      counts['readyDocuments'] = number(rows.find((row) => row.status === 'READY')?.count);
    }
    let messageDelivery: { label: string; value: number }[] = [];
    if (reportGrant(actor, 'communications.read')) {
      const rows = await this.db.$queryRaw<{ label: string; value: bigint }[]>(
        Prisma.sql`SELECT status::text label,count(*) value FROM messages WHERE tenant_id=${tid}::uuid AND status IN ('SENT','DELIVERED','FAILED') GROUP BY status ORDER BY status`,
      );
      messageDelivery = rows.map((row) => ({ label: row.label, value: number(row.value) }));
      for (const row of rows)
        counts[`messages${row.label[0]}${row.label.slice(1).toLowerCase()}`] = number(row.value);
    }
    const recentPayments = reportGrant(actor, 'payments.read')
      ? await this.db.$queryRaw<
          { reference: string; amountMinor: bigint; currency: string; paidAt: Date }[]
        >(Prisma.sql`
      SELECT p.payment_reference reference,p.amount_minor "amountMinor",p.currency,p.paid_at "paidAt"
      FROM payments p JOIN students s ON (s.tenant_id,s.id)=(p.tenant_id,p.student_id)
      WHERE p.tenant_id=${tid}::uuid AND p.status='COMPLETED' AND ${reportStudentScope(actor, 'payments.read')}
      ORDER BY p.paid_at DESC NULLS LAST,p.id DESC LIMIT 5`)
      : [];
    return {
      role: actor.roles.find((role) => role !== 'SUPER_ADMIN') ?? actor.roles[0] ?? 'UNKNOWN',
      reference: { academicYearId: year?.id ?? null, periodId: period?.id ?? null },
      counts,
      money,
      classEnrollment,
      feeTypeBreakdown,
      academicAverages,
      students,
      messageDelivery,
      recentPayments: recentPayments.map((row) => ({
        reference: row.reference,
        amountMinor: String(row.amountMinor),
        currency: row.currency,
        paidAt: row.paidAt.toISOString(),
      })),
    };
  }
}
