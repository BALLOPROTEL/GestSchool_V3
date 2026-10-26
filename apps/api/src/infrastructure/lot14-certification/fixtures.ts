import { randomUUID } from 'node:crypto';
import { failure, type Role } from './config.js';
import { CertificationHttp, items, object, requireStatus, text } from './http.js';

export interface Account {
  http: CertificationHttp;
  userId: string;
  tenantId: string;
  membershipId: string;
  sessionId: string;
}
export interface Graph {
  accounts: Record<Role, Account>;
  student: string;
  otherStudent: string;
  guardian: string;
  teacher: string;
  year: string;
  period: string;
  classroom: string;
  otherClass: string;
  enrollment: string;
  feeType: string;
  assessment: string;
}

const id = (row: Record<string, unknown>) => text(row.id);
export async function owned(
  http: CertificationHttp,
  path: string,
  key: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = `${path.includes('?') ? '&' : '?'}page=1&pageSize=100`;
  const reply = await http.send(`${path}${query}`);
  const rows = items(reply);
  if (typeof reply.body.total !== 'number' || reply.body.total > 100) throw failure();
  const matches = rows.filter((row) => row[key] === input[key]);
  if (matches.length > 1) throw failure();
  if (matches[0]) {
    // Reruns never repair an ambiguous/corrupted fixture or overwrite data.
    for (const [field, value] of Object.entries(input)) {
      if (field === 'userId') continue; // Verified with a read-only, owned-row query by the runtime.
      if (matches[0][field] !== value) throw failure();
    }
    if (matches[0].status && !['ACTIVE', 'DRAFT', 'PENDING'].includes(String(matches[0].status)))
      throw failure();
    return matches[0];
  }
  const created = await http.send(path, 'POST', input);
  requireStatus(created, 201);
  id(created.body);
  return created.body;
}

export async function fixtures(label: 'A' | 'B', accounts: Record<Role, Account>): Promise<Graph> {
  const http = accounts.SCHOOL_ADMIN.http;
  const marker = `LOT14_RUN_V1_${label}`;
  const person = (firstName: string, reference: string, userId?: string) => ({
    firstName,
    lastName: marker,
    [reference]: `${marker}_${firstName}`,
    ...(userId ? { userId } : {}),
  });
  const student = id(
    await owned(
      http,
      'students',
      'matricule',
      person('Student', 'matricule', accounts.STUDENT.userId),
    ),
  );
  const otherStudent = id(
    await owned(http, 'students', 'matricule', person('Control', 'matricule')),
  );
  const guardian = id(
    await owned(
      http,
      'guardians',
      'guardianReference',
      person('Parent', 'guardianReference', accounts.PARENT.userId),
    ),
  );
  const teacher = id(
    await owned(
      http,
      'teachers',
      'employeeNumber',
      person('Teacher', 'employeeNumber', accounts.TEACHER.userId),
    ),
  );
  const links = items(await http.send(`students/${student}/guardians?pageSize=100`));
  if (
    links.length > 1 ||
    (links[0] && (links[0].guardianId !== guardian || links[0].receivesNotifications !== false))
  )
    throw failure();
  if (!links.length)
    requireStatus(
      await http.send(`students/${student}/guardians`, 'POST', {
        guardianId: guardian,
        relationship: 'parent',
        isPrimary: true,
        isFinancialContact: false,
        receivesNotifications: false,
      }),
      201,
    );
  const yearRow = await owned(http, 'academic-years', 'code', {
    code: marker,
    name: marker,
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
  });
  const year = id(yearRow);
  if (yearRow.status === 'DRAFT')
    requireStatus(await http.send(`academic-years/${year}/activate`, 'POST', {}), 200);
  else if (yearRow.status !== 'ACTIVE') throw failure();
  const period = id(
    await owned(http, `academic-years/${year}/periods`, 'name', {
      name: marker,
      type: 'SEMESTER',
      ordinal: 1,
      startsOn: '2026-01-01',
      endsOn: '2026-06-30',
    }),
  );
  const level = id(await owned(http, 'levels', 'code', { code: marker, name: marker }));
  const classroom = id(
    await owned(http, 'classes', 'code', {
      code: marker,
      name: marker,
      academicYearId: year,
      levelId: level,
    }),
  );
  const otherClass = id(
    await owned(http, 'classes', 'code', {
      code: `${marker}_CONTROL`,
      name: `${marker}_CONTROL`,
      academicYearId: year,
      levelId: level,
    }),
  );
  const subject = id(await owned(http, 'subjects', 'code', { code: marker, name: marker }));
  const classSubject = id(
    await owned(http, `classes/${classroom}/subjects`, 'subjectId', {
      subjectId: subject,
      coefficient: '1.00',
    }),
  );
  await owned(http, 'teaching-assignments', 'classSubjectId', {
    classSubjectId: classSubject,
    teacherId: teacher,
    academicPeriodId: period,
  });
  const enrollmentFor = async (studentId: string, classId: string) => {
    const row = await owned(http, `enrollments?studentId=${studentId}`, 'studentId', {
      studentId,
      academicYearId: year,
      classId,
      type: 'NEW',
      enrolledOn: '2026-01-01',
    });
    if (row.status === 'PENDING')
      requireStatus(await http.send(`enrollments/${id(row)}/confirm`, 'POST', {}), 200);
    else if (row.status !== 'ACTIVE') throw failure();
    return id(row);
  };
  const enrollment = await enrollmentFor(student, classroom);
  await enrollmentFor(otherStudent, otherClass);
  const feeType = id(
    await owned(http, 'finance/fee-types', 'code', { code: marker, name: marker }),
  );
  const assessment = id(
    await owned(http, 'assessments', 'reference', {
      reference: marker,
      title: marker,
      classSubjectId: classSubject,
      academicPeriodId: period,
      assessedOn: '2026-03-01',
      maxScore: '20.00',
      weight: '1.00',
    }),
  );
  return {
    accounts,
    student,
    otherStudent,
    guardian,
    teacher,
    year,
    period,
    classroom,
    otherClass,
    enrollment,
    feeType,
    assessment,
  };
}

async function get(http: CertificationHttp, path: string, expectedId: string) {
  const reply = await http.send(path);
  requireStatus(reply, 200);
  if (reply.body.id !== expectedId) throw failure();
}
async function deny(
  http: CertificationHttp,
  path: string,
  code: string,
  method = 'GET',
  input?: unknown,
) {
  requireStatus(
    await http.send(
      path,
      method,
      input,
      method === 'POST' ? { 'Idempotency-Key': randomUUID() } : {},
    ),
    404,
    code,
  );
}
async function listOnly(http: CertificationHttp, path: string, ownId: string, forbidden: string[]) {
  const reply = await http.send(path);
  const rows = items(reply);
  if (
    !rows.some((row) => row.id === ownId) ||
    rows.some((row) => forbidden.includes(String(row.id)))
  )
    throw failure();
  if (reply.body.total !== rows.length) throw failure();
}

export async function scenario(index: number, a: Graph, b: Graph): Promise<void> {
  const own = a.accounts.SCHOOL_ADMIN.http,
    foreign = b.accounts.SCHOOL_ADMIN.http;
  const crossPeople = async (left: Graph, right: Graph) => {
    const http = left.accounts.SCHOOL_ADMIN.http;
    await get(http, `students/${left.student}`, left.student);
    await deny(http, `students/${right.student}`, 'PERSON_NOT_FOUND');
  };
  switch (index) {
    case 0:
      return crossPeople(a, b);
    case 1:
      return crossPeople(b, a);
    case 2:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        await deny(
          left.accounts.SCHOOL_ADMIN.http,
          `students/${right.student}`,
          'PERSON_NOT_FOUND',
          'PATCH',
          { firstName: 'IDOR_MUST_NOT_WRITE' },
        );
        await get(right.accounts.SCHOOL_ADMIN.http, `students/${right.student}`, right.student);
        const unchanged = await right.accounts.SCHOOL_ADMIN.http.send(`students/${right.student}`);
        if (unchanged.body.firstName !== 'Student') throw failure();
      }
      return;
    case 3:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        await listOnly(left.accounts.SCHOOL_ADMIN.http, 'students?pageSize=100', left.student, [
          right.student,
        ]);
        requireStatus(
          await left.accounts.SCHOOL_ADMIN.http.send('auth/switch-tenant', 'POST', {
            membershipId: right.accounts.SCHOOL_ADMIN.membershipId,
          }),
          401,
          'AUTH_INVALID_CREDENTIALS',
        );
      }
      return;
    case 4:
    case 5:
    case 6:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        const role = (['TEACHER', 'PARENT', 'STUDENT'] as const)[index - 4]!;
        const http = left.accounts[role].http;
        await get(http, `students/${left.student}`, left.student);
        await deny(http, `students/${left.otherStudent}`, 'PERSON_NOT_FOUND');
        await deny(http, `students/${right.student}`, 'PERSON_NOT_FOUND');
        await listOnly(http, 'students?pageSize=100', left.student, [
          left.otherStudent,
          right.student,
        ]);
        if (role === 'TEACHER') {
          await get(http, `classes/${left.classroom}`, left.classroom);
          await deny(http, `classes/${left.otherClass}`, 'ACADEMIC_NOT_FOUND');
          const rows = items(await http.send('me/teaching-assignments?pageSize=100'));
          if (rows.length !== 1 || rows[0]?.teacherId !== left.teacher) throw failure();
        }
      }
      return;
    case 7:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        await crossPeople(left, right);
        await get(left.accounts.SCHOOL_ADMIN.http, `guardians/${left.guardian}`, left.guardian);
        await get(left.accounts.SCHOOL_ADMIN.http, `teachers/${left.teacher}`, left.teacher);
        await deny(
          left.accounts.SCHOOL_ADMIN.http,
          `guardians/${right.guardian}`,
          'PERSON_NOT_FOUND',
        );
        await deny(
          left.accounts.SCHOOL_ADMIN.http,
          `teachers/${right.teacher}`,
          'PERSON_NOT_FOUND',
        );
      }
      return;
    case 8:
      await get(own, `classes/${a.classroom}`, a.classroom);
      await get(foreign, `classes/${b.classroom}`, b.classroom);
      await deny(own, `classes/${b.classroom}`, 'ACADEMIC_NOT_FOUND');
      return deny(foreign, `academic-years/${a.year}`, 'ACADEMIC_NOT_FOUND');
    case 9:
      await get(own, `enrollments/${a.enrollment}`, a.enrollment);
      await get(foreign, `enrollments/${b.enrollment}`, b.enrollment);
      await deny(own, `enrollments/${b.enrollment}`, 'ENROLLMENT_NOT_FOUND');
      return deny(foreign, `enrollments/${a.enrollment}`, 'ENROLLMENT_NOT_FOUND');
    case 10:
      await get(own, `finance/fee-types/${a.feeType}`, a.feeType);
      await get(foreign, `finance/fee-types/${b.feeType}`, b.feeType);
      await deny(own, `finance/fee-types/${b.feeType}`, 'FINANCE_NOT_FOUND');
      return deny(foreign, `finance/fee-types/${a.feeType}`, 'FINANCE_NOT_FOUND');
    case 11:
      await get(own, `assessments/${a.assessment}`, a.assessment);
      await get(foreign, `assessments/${b.assessment}`, b.assessment);
      await deny(own, `assessments/${b.assessment}`, 'RESULT_NOT_FOUND');
      return deny(foreign, `assessments/${a.assessment}`, 'RESULT_NOT_FOUND');
    case 12:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        const http = left.accounts.SCHOOL_ADMIN.http;
        const sources = await http.send(
          `documents/sources?documentType=SCHOOL_CERTIFICATE&studentId=${left.student}`,
        );
        requireStatus(sources, 200);
        if (
          !Array.isArray(sources.data) ||
          !sources.data.some((row) => object(row).id === left.enrollment)
        )
          throw failure();
        await deny(http, 'documents/generate', 'DOCUMENT_NOT_FOUND', 'POST', {
          documentType: 'SCHOOL_CERTIFICATE',
          sourceId: right.enrollment,
          locale: 'fr',
        });
      }
      return;
    case 13:
      for (const [left, right] of [
        [a, b],
        [b, a],
      ] as const) {
        const http = left.accounts.SCHOOL_ADMIN.http;
        const rows = items(await http.send(`reports/students?classId=${left.classroom}`));
        if (
          rows.length !== 1 ||
          rows[0]?.matricule !== `LOT14_RUN_V1_${left === a ? 'A' : 'B'}_Student`
        )
          throw failure();
        await deny(http, `reports/students?studentId=${right.student}`, 'REPORT_FILTER_NOT_FOUND');
      }
      return;
    default:
      throw failure();
  }
}
