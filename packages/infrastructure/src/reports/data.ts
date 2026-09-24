import {
  REPORT_EXPORT_MAX_ROWS,
  type ReportActor,
  type ReportPage,
  type ReportQuery,
  type ReportRow,
  type ReportType,
} from '@gestschool/contracts';
import { Prisma, type GestSchoolPrismaClient } from '@gestschool/database';

export class ReportAccessError extends Error {
  constructor(
    readonly code: string,
    readonly status = 403,
  ) {
    super(code);
  }
}

type Raw = Record<string, bigint | Date | number | string | null> & { total_count: bigint };
export const reportSourcePermission: Record<ReportType, string> = {
  STUDENTS: 'students.read',
  ENROLLMENTS: 'enrollments.read',
  ACADEMIC: 'classes.read',
  RESULTS: 'grades.read',
  FINANCE: 'invoices.read',
  PAYMENTS: 'payments.read',
  OUTSTANDING_BALANCES: 'invoices.read',
  DOCUMENTS: 'documents.read',
  COMMUNICATIONS: 'communications.read',
};

export function reportGrant(actor: ReportActor, permission: string, scope?: string): boolean {
  return actor.grants.some(
    (item) =>
      item.permission === permission && item.scope !== 'NONE' && (!scope || item.scope === scope),
  );
}
export function reportTenant(actor: ReportActor, permission: string): boolean {
  return (
    reportGrant(actor, permission, 'TENANT') ||
    (actor.roles.includes('SUPER_ADMIN') && reportGrant(actor, permission, 'PLATFORM'))
  );
}
export function assertReportAccess(
  actor: ReportActor,
  type: ReportType,
  operation: 'read' | 'export' = 'read',
): void {
  if (
    !reportGrant(actor, operation === 'read' ? 'reports.read' : 'reports.export') ||
    !reportGrant(actor, reportSourcePermission[type])
  )
    throw new ReportAccessError('AUTH_FORBIDDEN');
}
// The aliases are fixed by the query registry, never supplied by a request.
export function reportStudentScope(actor: ReportActor, permission: string): Prisma.Sql {
  if (reportTenant(actor, permission)) return Prisma.sql`TRUE`;
  return Prisma.sql`(
    (${reportGrant(actor, permission, 'OWN')} AND s.user_id=${actor.userId}::uuid) OR
    (${reportGrant(actor, permission, 'CHILDREN')} AND EXISTS (
      SELECT 1 FROM student_guardians sg JOIN guardians g
        ON (g.tenant_id,g.id)=(sg.tenant_id,sg.guardian_id)
      WHERE sg.tenant_id=${actor.tenantId}::uuid AND sg.student_id=s.id
        AND g.user_id=${actor.userId}::uuid AND g.status='ACTIVE'
    )) OR
    (${reportGrant(actor, permission, 'ASSIGNED')} AND EXISTS (
      SELECT 1 FROM enrollments se JOIN class_subjects cs
        ON (cs.tenant_id,cs.school_class_id)=(se.tenant_id,se.school_class_id)
      JOIN teaching_assignments ta ON (ta.tenant_id,ta.class_subject_id)=(cs.tenant_id,cs.id)
      JOIN teachers t ON (t.tenant_id,t.id)=(ta.tenant_id,ta.teacher_id)
      WHERE se.tenant_id=${actor.tenantId}::uuid AND se.student_id=s.id
        AND se.status IN ('ACTIVE','PENDING') AND ta.status='ACTIVE'
        AND t.status='ACTIVE' AND t.user_id=${actor.userId}::uuid
    ))
  )`;
}
export function reportAssignedClass(actor: ReportActor, classExpression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM class_subjects acs
    JOIN teaching_assignments ata ON (ata.tenant_id,ata.class_subject_id)=(acs.tenant_id,acs.id)
    JOIN teachers at ON (at.tenant_id,at.id)=(ata.tenant_id,ata.teacher_id)
    WHERE acs.tenant_id=${actor.tenantId}::uuid AND acs.school_class_id=${classExpression}
      AND ata.status='ACTIVE' AND at.status='ACTIVE' AND at.user_id=${actor.userId}::uuid
  )`;
}
function common(q: ReportQuery, dateExpression?: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    ${q.academicYearId ? Prisma.sql`AND e.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
    ${q.classId ? Prisma.sql`AND e.school_class_id=${q.classId}::uuid` : Prisma.empty}
    ${q.levelId ? Prisma.sql`AND c.level_id=${q.levelId}::uuid` : Prisma.empty}
    ${q.dateFrom && dateExpression ? Prisma.sql`AND ${dateExpression}>=${q.dateFrom}::date` : Prisma.empty}
    ${q.dateTo && dateExpression ? Prisma.sql`AND ${dateExpression}<(${q.dateTo}::date+1)` : Prisma.empty}`;
}
function normalized(row: Raw): ReportRow {
  const output: ReportRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'total_count') continue;
    output[key] =
      typeof value === 'bigint'
        ? value.toString()
        : value instanceof Date
          ? value.toISOString()
          : value;
  }
  return output;
}

export class ReportDataEngine {
  constructor(private readonly db: GestSchoolPrismaClient) {}

  async page(type: ReportType, actor: ReportActor, q: ReportQuery): Promise<ReportPage> {
    assertReportAccess(actor, type);
    await this.validateFilters(actor, q, reportSourcePermission[type]);
    const rows = await this.rows(type, actor, q, q.pageSize, (q.page - 1) * q.pageSize);
    const items = rows.map(normalized);
    return {
      type,
      columns: items.length ? Object.keys(items[0] ?? {}) : columns[type],
      items,
      total: Number(rows[0]?.total_count ?? 0n),
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async snapshot(type: ReportType, actor: ReportActor, q: ReportQuery): Promise<ReportPage> {
    assertReportAccess(actor, type, 'export');
    await this.validateFilters(actor, q, reportSourcePermission[type]);
    const rows = await this.rows(type, actor, q, REPORT_EXPORT_MAX_ROWS + 1, 0);
    if (rows.length > REPORT_EXPORT_MAX_ROWS)
      throw new ReportAccessError('REPORT_ROW_LIMIT_EXCEEDED', 422);
    const items = rows.map(normalized);
    return {
      type,
      columns: items.length ? Object.keys(items[0] ?? {}) : columns[type],
      items,
      total: items.length,
      page: 1,
      pageSize: items.length,
    };
  }

  private async validateFilters(actor: ReportActor, q: ReportQuery, permission: string) {
    const tid = actor.tenantId;
    if (
      q.academicYearId &&
      !(await this.db.academicYear.findFirst({
        where: { id: q.academicYearId, tenantId: tid },
        select: { id: true },
      }))
    )
      throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    if (
      q.periodId &&
      !(await this.db.academicPeriod.findFirst({
        where: { id: q.periodId, tenantId: tid },
        select: { id: true },
      }))
    )
      throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    if (
      q.levelId &&
      !(await this.db.level.findFirst({
        where: { id: q.levelId, tenantId: tid },
        select: { id: true },
      }))
    )
      throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    if (
      q.subjectId &&
      !(await this.db.subject.findFirst({
        where: { id: q.subjectId, tenantId: tid },
        select: { id: true },
      }))
    )
      throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    if (q.studentId) {
      const visible = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id FROM students s WHERE s.tenant_id=${tid}::uuid AND s.id=${q.studentId}::uuid
          AND ${reportStudentScope(actor, permission)} LIMIT 1`);
      if (!visible.length) throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    }
    if (q.classId) {
      const access = reportTenant(actor, permission)
        ? Prisma.sql`TRUE`
        : reportGrant(actor, permission, 'ASSIGNED')
          ? reportAssignedClass(actor, Prisma.sql`c.id`)
          : Prisma.sql`EXISTS (SELECT 1 FROM enrollments e JOIN students s ON (s.tenant_id,s.id)=(e.tenant_id,e.student_id) WHERE e.tenant_id=${tid}::uuid AND e.school_class_id=c.id AND ${reportStudentScope(actor, permission)})`;
      const visible = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT c.id FROM school_classes c WHERE c.tenant_id=${tid}::uuid AND c.id=${q.classId}::uuid AND ${access} LIMIT 1`);
      if (!visible.length) throw new ReportAccessError('REPORT_FILTER_NOT_FOUND', 404);
    }
  }

  private async rows(
    type: ReportType,
    actor: ReportActor,
    q: ReportQuery,
    limit: number,
    offset: number,
  ): Promise<Raw[]> {
    const configured = (
      await this.db.tenantSetting.findUnique({
        where: { tenantId: actor.tenantId },
        select: { timezone: true },
      })
    )?.timezone;
    let timezone = configured ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    } catch {
      timezone = 'UTC';
    }
    return handlers[type](this.db, actor, q, limit, offset, timezone);
  }
}

type Handler = (
  db: GestSchoolPrismaClient,
  actor: ReportActor,
  q: ReportQuery,
  limit: number,
  offset: number,
  timezone: string,
) => Promise<Raw[]>;
const paging = (limit: number, offset: number) => Prisma.sql`LIMIT ${limit} OFFSET ${offset}`;
const search = (q: ReportQuery, expression: Prisma.Sql) =>
  q.search ? Prisma.sql`AND position(lower(${q.search}) in lower(${expression}))>0` : Prisma.empty;
const status = (q: ReportQuery, expression: Prisma.Sql) =>
  q.status ? Prisma.sql`AND ${expression}=${q.status}` : Prisma.empty;

const students: Handler = (db, a, q, limit, offset) =>
  db.$queryRaw<Raw[]>(Prisma.sql`
  SELECT s.matricule,s.last_name "lastName",s.first_name "firstName",c.name "className",l.name "levelName",
    s.status::text status,y.name "academicYear",count(*) over() total_count
  FROM students s LEFT JOIN LATERAL (
    SELECT x.* FROM enrollments x WHERE x.tenant_id=s.tenant_id AND x.student_id=s.id
      ${q.academicYearId ? Prisma.sql`AND x.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
    ORDER BY (x.status='ACTIVE') DESC,x.enrolled_on DESC LIMIT 1
  ) e ON TRUE LEFT JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
  LEFT JOIN levels l ON (l.tenant_id,l.id)=(c.tenant_id,c.level_id)
  LEFT JOIN academic_years y ON (y.tenant_id,y.id)=(e.tenant_id,e.academic_year_id)
  WHERE s.tenant_id=${a.tenantId}::uuid AND ${reportStudentScope(a, 'students.read')}
    ${q.classId ? Prisma.sql`AND e.school_class_id=${q.classId}::uuid` : Prisma.empty}
    ${q.levelId ? Prisma.sql`AND c.level_id=${q.levelId}::uuid` : Prisma.empty}
    ${status(q, Prisma.sql`s.status::text`)} ${search(q, Prisma.sql`s.matricule||' '||s.first_name||' '||s.last_name`)}
  ORDER BY s.last_name,s.first_name,s.id ${paging(limit, offset)}`);

const enrollments: Handler = (db, a, q, limit, offset) =>
  db.$queryRaw<Raw[]>(Prisma.sql`
  SELECT e.id::text reference,s.matricule,(s.first_name||' '||s.last_name) student,y.name "academicYear",
    c.name "className",l.name "levelName",e.status::text status,coalesce(e.type::text,'LEGACY') type,
    e.enrolled_on "enrolledOn",e.ended_on "endedOn",count(*) over() total_count
  FROM enrollments e JOIN students s ON (s.tenant_id,s.id)=(e.tenant_id,e.student_id)
  JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
  JOIN levels l ON (l.tenant_id,l.id)=(c.tenant_id,c.level_id)
  JOIN academic_years y ON (y.tenant_id,y.id)=(e.tenant_id,e.academic_year_id)
  WHERE e.tenant_id=${a.tenantId}::uuid AND ${reportStudentScope(a, 'enrollments.read')}
    ${common(q, Prisma.sql`e.enrolled_on`)} ${q.studentId ? Prisma.sql`AND e.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${status(q, Prisma.sql`e.status::text`)} ${search(q, Prisma.sql`s.matricule||' '||s.first_name||' '||s.last_name||' '||c.name`)}
  ORDER BY e.enrolled_on DESC,e.id DESC ${paging(limit, offset)}`);

const academic: Handler = (db, a, q, limit, offset) => {
  const access = reportTenant(a, 'classes.read')
    ? Prisma.sql`TRUE`
    : reportAssignedClass(a, Prisma.sql`c.id`);
  return db.$queryRaw<Raw[]>(Prisma.sql`
    SELECT y.name "academicYear",l.name "levelName",c.name "className",c.status::text status,
      count(e.id) FILTER (WHERE e.status='ACTIVE')::int "activeEnrollments",c.capacity,
      count(*) over() total_count
    FROM school_classes c JOIN academic_years y ON (y.tenant_id,y.id)=(c.tenant_id,c.academic_year_id)
    JOIN levels l ON (l.tenant_id,l.id)=(c.tenant_id,c.level_id)
    LEFT JOIN enrollments e ON (e.tenant_id,e.school_class_id)=(c.tenant_id,c.id)
    WHERE c.tenant_id=${a.tenantId}::uuid AND ${access}
      ${q.academicYearId ? Prisma.sql`AND c.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
      ${q.classId ? Prisma.sql`AND c.id=${q.classId}::uuid` : Prisma.empty}
      ${q.levelId ? Prisma.sql`AND c.level_id=${q.levelId}::uuid` : Prisma.empty}
      ${status(q, Prisma.sql`c.status::text`)} ${search(q, Prisma.sql`c.name||' '||l.name||' '||y.name`)}
    GROUP BY y.name,l.name,c.name,c.status,c.capacity,c.id ORDER BY y.name DESC,l.name,c.name ${paging(limit, offset)}`);
};

const results: Handler = (db, a, q, limit, offset) => {
  const visible = reportTenant(a, 'grades.read')
    ? Prisma.sql`TRUE`
    : reportGrant(a, 'grades.read', 'ASSIGNED')
      ? reportAssignedClass(a, Prisma.sql`c.id`)
      : Prisma.sql`(${reportStudentScope(a, 'grades.read')} AND r.status IN ('PUBLISHED','LOCKED'))`;
  return db.$queryRaw<Raw[]>(Prisma.sql`
    SELECT s.matricule,(s.first_name||' '||s.last_name) student,y.name "academicYear",p.name period,c.name "className",
      r.overall_average::text average,r.rank,r.status::text status,count(*) over() total_count
    FROM report_cards r JOIN students s ON (s.tenant_id,s.id)=(r.tenant_id,r.student_id)
    JOIN academic_years y ON (y.tenant_id,y.id)=(r.tenant_id,r.academic_year_id)
    JOIN academic_periods p ON (p.tenant_id,p.id)=(r.tenant_id,r.academic_period_id)
    JOIN school_classes c ON (c.tenant_id,c.id)=(r.tenant_id,r.school_class_id)
    WHERE r.tenant_id=${a.tenantId}::uuid AND ${visible}
      ${q.academicYearId ? Prisma.sql`AND r.academic_year_id=${q.academicYearId}::uuid` : Prisma.empty}
      ${q.periodId ? Prisma.sql`AND r.academic_period_id=${q.periodId}::uuid` : Prisma.empty}
      ${q.classId ? Prisma.sql`AND r.school_class_id=${q.classId}::uuid` : Prisma.empty}
      ${q.studentId ? Prisma.sql`AND r.student_id=${q.studentId}::uuid` : Prisma.empty}
      ${status(q, Prisma.sql`r.status::text`)} ${search(q, Prisma.sql`s.matricule||' '||s.first_name||' '||s.last_name||' '||c.name`)}
    ORDER BY r.created_at DESC,r.id DESC ${paging(limit, offset)}`);
};

const invoiceRows = (
  db: GestSchoolPrismaClient,
  a: ReportActor,
  q: ReportQuery,
  limit: number,
  offset: number,
  outstandingOnly: boolean,
) =>
  db.$queryRaw<Raw[]>(Prisma.sql`
  WITH paid AS (
    SELECT pa.invoice_id,sum(pa.amount_minor) amount FROM payment_allocations pa JOIN payments p
      ON (p.tenant_id,p.id)=(pa.tenant_id,pa.payment_id)
    WHERE pa.tenant_id=${a.tenantId}::uuid AND p.status='COMPLETED' GROUP BY pa.invoice_id
  )
  SELECT i.invoice_number "invoiceNumber",s.matricule,coalesce(i.student_name,s.first_name||' '||s.last_name) student,
    coalesce(i.class_name,c.name) "className",i.currency,i.total_amount_minor::text "invoicedMinor",
    coalesce(p.amount,0)::text "paidMinor",greatest(i.total_amount_minor-coalesce(p.amount,0),0)::text "balanceMinor",
    i.due_on "dueOn",i.status::text status,count(*) over() total_count
  FROM invoices i JOIN students s ON (s.tenant_id,s.id)=(i.tenant_id,i.student_id)
  LEFT JOIN enrollments e ON (e.tenant_id,e.id)=(i.tenant_id,i.enrollment_id)
  LEFT JOIN school_classes c ON (c.tenant_id,c.id)=(e.tenant_id,e.school_class_id)
  LEFT JOIN paid p ON p.invoice_id=i.id
  WHERE i.tenant_id=${a.tenantId}::uuid AND ${reportStudentScope(a, 'invoices.read')} AND i.status NOT IN ('DRAFT','VOID')
    ${common(q, Prisma.sql`i.issued_on`)} ${q.studentId ? Prisma.sql`AND i.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${outstandingOnly ? Prisma.sql`AND i.total_amount_minor-coalesce(p.amount,0)>0` : Prisma.empty}
    ${status(q, Prisma.sql`i.status::text`)} ${search(q, Prisma.sql`i.invoice_number||' '||coalesce(i.student_name,s.first_name||' '||s.last_name)`)}
  ORDER BY i.issued_on DESC,i.id DESC ${paging(limit, offset)}`);
const finance: Handler = (db, a, q, l, o) => invoiceRows(db, a, q, l, o, false);
const outstanding: Handler = (db, a, q, l, o) => invoiceRows(db, a, q, l, o, true);

const payments: Handler = (db, a, q, limit, offset, timezone) =>
  db.$queryRaw<Raw[]>(Prisma.sql`
  SELECT p.payment_reference "paymentReference",coalesce(s.matricule,'') matricule,
    coalesce(s.first_name||' '||s.last_name,'') student,p.amount_minor::text "amountMinor",p.currency,
    coalesce((SELECT sum(r.amount_minor) FROM payment_reversals r WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id)),0)::text "reversedMinor",
    CASE WHEN p.status='COMPLETED' THEN p.amount_minor ELSE 0 END::text "netMinor",p.method::text method,p.status::text status,p.paid_at "paidAt",count(*) over() total_count
  FROM payments p LEFT JOIN students s ON (s.tenant_id,s.id)=(p.tenant_id,p.student_id)
  WHERE p.tenant_id=${a.tenantId}::uuid AND (s.id IS NULL OR ${reportStudentScope(a, 'payments.read')})
    ${q.studentId ? Prisma.sql`AND p.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${q.dateFrom ? Prisma.sql`AND (p.paid_at AT TIME ZONE ${timezone})::date>=${q.dateFrom}::date` : Prisma.empty}
    ${q.dateTo ? Prisma.sql`AND (p.paid_at AT TIME ZONE ${timezone})::date<=${q.dateTo}::date` : Prisma.empty}
    ${status(q, Prisma.sql`p.status::text`)} ${search(q, Prisma.sql`p.payment_reference||' '||coalesce(s.matricule,'')||' '||coalesce(s.first_name||' '||s.last_name,'')`)}
  ORDER BY p.created_at DESC,p.id DESC ${paging(limit, offset)}`);

const documents: Handler = (db, a, q, limit, offset, timezone) =>
  db.$queryRaw<Raw[]>(Prisma.sql`
  SELECT d.reference,d.document_type::text "documentType",d.generation_status::text status,d.locale,
    s.matricule,(s.first_name||' '||s.last_name) student,d.issued_at "issuedAt",d.created_at "createdAt",count(*) over() total_count
  FROM documents d JOIN students s ON (s.tenant_id,s.id)=(d.tenant_id,d.student_id)
  WHERE d.tenant_id=${a.tenantId}::uuid AND d.document_type IS NOT NULL AND ${reportStudentScope(a, 'documents.read')}
    ${q.studentId ? Prisma.sql`AND d.student_id=${q.studentId}::uuid` : Prisma.empty}
    ${q.dateFrom ? Prisma.sql`AND (d.created_at AT TIME ZONE ${timezone})::date>=${q.dateFrom}::date` : Prisma.empty}
    ${q.dateTo ? Prisma.sql`AND (d.created_at AT TIME ZONE ${timezone})::date<=${q.dateTo}::date` : Prisma.empty}
    ${status(q, Prisma.sql`d.generation_status::text`)} ${search(q, Prisma.sql`d.reference||' '||s.matricule||' '||s.first_name||' '||s.last_name`)}
  ORDER BY d.created_at DESC,d.id DESC ${paging(limit, offset)}`);

const communications: Handler = (db, a, q, limit, offset, timezone) => {
  if (!reportTenant(a, 'communications.read') && !reportGrant(a, 'communications.read', 'ASSIGNED'))
    throw new ReportAccessError('AUTH_FORBIDDEN');
  return db.$queryRaw<Raw[]>(Prisma.sql`
    SELECT m.channel::text channel,m.event_type "eventType",coalesce(m.provider,'IN_APP') provider,m.status::text status,
      m.created_at "createdAt",m.sent_at "sentAt",m.delivered_at "deliveredAt",m.attempts,count(*) over() total_count
    FROM messages m WHERE m.tenant_id=${a.tenantId}::uuid
      ${reportGrant(a, 'communications.read', 'ASSIGNED') && !reportTenant(a, 'communications.read') ? Prisma.sql`AND m.sender_membership_id=${a.membershipId}::uuid` : Prisma.empty}
      ${q.dateFrom ? Prisma.sql`AND (m.created_at AT TIME ZONE ${timezone})::date>=${q.dateFrom}::date` : Prisma.empty}
      ${q.dateTo ? Prisma.sql`AND (m.created_at AT TIME ZONE ${timezone})::date<=${q.dateTo}::date` : Prisma.empty}
      ${status(q, Prisma.sql`m.status::text`)}
    ORDER BY m.created_at DESC,m.id DESC ${paging(limit, offset)}`);
};

const handlers: Record<ReportType, Handler> = {
  STUDENTS: students,
  ENROLLMENTS: enrollments,
  ACADEMIC: academic,
  RESULTS: results,
  FINANCE: finance,
  PAYMENTS: payments,
  OUTSTANDING_BALANCES: outstanding,
  DOCUMENTS: documents,
  COMMUNICATIONS: communications,
};
const columns: Record<ReportType, string[]> = {
  STUDENTS: [
    'matricule',
    'lastName',
    'firstName',
    'className',
    'levelName',
    'status',
    'academicYear',
  ],
  ENROLLMENTS: [
    'reference',
    'matricule',
    'student',
    'academicYear',
    'className',
    'levelName',
    'status',
    'type',
    'enrolledOn',
    'endedOn',
  ],
  ACADEMIC: ['academicYear', 'levelName', 'className', 'status', 'activeEnrollments', 'capacity'],
  RESULTS: [
    'matricule',
    'student',
    'academicYear',
    'period',
    'className',
    'average',
    'rank',
    'status',
  ],
  FINANCE: [
    'invoiceNumber',
    'matricule',
    'student',
    'className',
    'currency',
    'invoicedMinor',
    'paidMinor',
    'balanceMinor',
    'dueOn',
    'status',
  ],
  PAYMENTS: [
    'paymentReference',
    'matricule',
    'student',
    'amountMinor',
    'currency',
    'reversedMinor',
    'netMinor',
    'method',
    'status',
    'paidAt',
  ],
  OUTSTANDING_BALANCES: [
    'invoiceNumber',
    'matricule',
    'student',
    'className',
    'currency',
    'invoicedMinor',
    'paidMinor',
    'balanceMinor',
    'dueOn',
    'status',
  ],
  DOCUMENTS: [
    'reference',
    'documentType',
    'status',
    'locale',
    'matricule',
    'student',
    'issuedAt',
    'createdAt',
  ],
  COMMUNICATIONS: [
    'channel',
    'eventType',
    'provider',
    'status',
    'createdAt',
    'sentAt',
    'deliveredAt',
    'attempts',
  ],
};
