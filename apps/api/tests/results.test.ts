import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@gestschool/database';
import type {
  AssessmentView,
  ClassResults,
  GradeChangeView,
  GradeSheet,
  ReportCardView,
  ResultList,
  EnrollmentView,
} from '@gestschool/contracts';
import {
  financeHarness,
  type FinanceAccount,
  type FinanceGraph,
  type FinanceHarness,
} from './finance-helpers.js';

let h: FinanceHarness, a: FinanceGraph, otherClass: FinanceGraph, foreign: FinanceGraph;
let admin: FinanceAccount,
  director: FinanceAccount,
  staff: FinanceAccount,
  teacher: FinanceAccount,
  parent: FinanceAccount,
  pupil: FinanceAccount,
  otherPupil: FinanceAccount,
  accountant: FinanceAccount,
  foreignAdmin: FinanceAccount;
let periodId: string,
  secondPeriodId: string,
  foreignPeriodId: string,
  mathId: string,
  frenchId: string,
  teacherId: string,
  secondStudentId: string,
  thirdStudentId: string,
  guardianId: string,
  lateStudentId: string,
  pendingStudentId: string;
let math: AssessmentView, french: AssessmentView, report: ReportCardView;
const entries = (scores: string[]) =>
  [a.student.id, secondStudentId, thirdStudentId].map((studentId, index) => ({
    studentId,
    score: scores[index],
    outcome: 'SCORED',
  }));
async function create(
  actor: FinanceAccount,
  classSubjectId = mathId,
  extra: Record<string, unknown> = {},
) {
  return actor.browser.send<AssessmentView>(
    'assessments',
    {
      classSubjectId,
      academicPeriodId: periodId,
      title: 'Évaluation LOT 9',
      assessedOn: '2026-03-15',
      maxScore: '20',
      weight: '1',
      ...extra,
    },
    'POST',
  );
}
async function detail(id = math.id) {
  return (await admin.browser.send<AssessmentView>(`assessments/${id}`)).body;
}
async function action(
  actor: FinanceAccount,
  id: string,
  verb: string,
  extra: Record<string, unknown> = {},
) {
  const current = await detail(id);
  return actor.browser.send<AssessmentView>(
    `assessments/${id}/${verb}`,
    { expectedVersion: current.version, ...extra },
    'POST',
  );
}
async function save(actor: FinanceAccount, id: string, scores = ['12', '14', '14']) {
  const current = await detail(id);
  return actor.browser.send<GradeSheet>(
    `assessments/${id}/grades`,
    { expectedVersion: current.version, grades: entries(scores) },
    'PUT',
  );
}
async function failure(
  reply: Promise<{ status: number; body: unknown }>,
  status: number,
  code?: string,
) {
  const response = await reply;
  expect(response.status).toBe(status);
  if (code) expect(response.body).toMatchObject({ code });
  expect(JSON.stringify(response.body)).not.toContain('Prisma');
}
beforeAll(async () => {
  h = await financeHarness();
  const tenant = await h.tenant(),
    other = await h.tenant();
  admin = await h.account(tenant.id, 'SCHOOL_ADMIN');
  director = await h.account(tenant.id, 'DIRECTOR');
  staff = await h.account(tenant.id, 'ACADEMIC_STAFF');
  teacher = await h.account(tenant.id, 'TEACHER');
  parent = await h.account(tenant.id, 'PARENT');
  pupil = await h.account(tenant.id, 'STUDENT');
  otherPupil = await h.account(tenant.id, 'STUDENT');
  accountant = await h.account(tenant.id, 'ACCOUNTANT');
  foreignAdmin = await h.account(other.id, 'SCHOOL_ADMIN');
  a = await h.graph(tenant.id, admin.browser, pupil.userId);
  otherClass = await h.graph(tenant.id, admin.browser);
  foreign = await h.graph(other.id, foreignAdmin.browser);
  periodId = (
    await h.db.academicPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: a.year.id,
        name: 'Semestre 1',
        type: 'SEMESTER',
        ordinal: 1,
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-06-30'),
      },
    })
  ).id;
  secondPeriodId = (
    await h.db.academicPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: a.year.id,
        name: 'Semestre 2',
        type: 'SEMESTER',
        ordinal: 2,
        startsOn: new Date('2026-07-01'),
        endsOn: new Date('2026-12-31'),
      },
    })
  ).id;
  foreignPeriodId = (
    await h.db.academicPeriod.create({
      data: {
        tenantId: other.id,
        academicYearId: foreign.year.id,
        name: 'Autre école',
        type: 'SEMESTER',
        ordinal: 1,
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-06-30'),
      },
    })
  ).id;
  const mathSubject = await h.db.subject.create({
    data: { tenantId: tenant.id, code: 'LOT9-MATH', name: 'Mathématiques' },
  });
  const frenchSubject = await h.db.subject.create({
    data: { tenantId: tenant.id, code: 'LOT9-FR', name: 'Français' },
  });
  mathId = (
    await h.db.classSubject.create({
      data: {
        tenantId: tenant.id,
        schoolClassId: a.classroom.id,
        subjectId: mathSubject.id,
        coefficient: '4',
      },
    })
  ).id;
  frenchId = (
    await h.db.classSubject.create({
      data: {
        tenantId: tenant.id,
        schoolClassId: a.classroom.id,
        subjectId: frenchSubject.id,
        coefficient: '3',
      },
    })
  ).id;
  teacherId = (
    await h.db.teacher.create({
      data: {
        tenantId: tenant.id,
        userId: teacher.userId,
        employeeNumber: 'LOT9-TEACHER',
        firstName: 'Professeur',
        lastName: 'Math',
      },
    })
  ).id;
  const frenchTeacher = await h.db.teacher.create({
    data: {
      tenantId: tenant.id,
      employeeNumber: 'LOT9-FRENCH',
      firstName: 'Professeur',
      lastName: 'Français',
    },
  });
  await h.db.teachingAssignment.createMany({
    data: [
      { tenantId: tenant.id, teacherId, classSubjectId: mathId, academicPeriodId: periodId },
      {
        tenantId: tenant.id,
        teacherId: frenchTeacher.id,
        classSubjectId: frenchId,
        academicPeriodId: periodId,
      },
    ],
  });
  async function student(name: string, enrolledOn: string, confirm = true, userId?: string) {
    const value = await h.db.student.create({
      data: {
        tenantId: tenant.id,
        matricule: name,
        firstName: name,
        lastName: 'LOT 9',
        ...(userId ? { userId } : {}),
      },
    });
    const response = await admin.browser.send<EnrollmentView>(
      'enrollments',
      {
        studentId: value.id,
        academicYearId: a.year.id,
        classId: a.classroom.id,
        type: 'NEW',
        enrolledOn,
      },
      'POST',
    );
    expect(response.status).toBe(201);
    if (confirm)
      expect(
        (await admin.browser.send(`enrollments/${response.body.id}/confirm`, {}, 'POST')).status,
      ).toBe(200);
    return value.id;
  }
  secondStudentId = await student('LOT9-B', '2026-01-01', true, otherPupil.userId);
  thirdStudentId = await student('LOT9-C', '2026-01-01');
  lateStudentId = await student('LOT9-LATE', '2026-07-01');
  pendingStudentId = await student('LOT9-PENDING', '2026-01-01', false);
  guardianId = (
    await h.db.guardian.create({
      data: {
        tenantId: tenant.id,
        userId: parent.userId,
        guardianReference: 'LOT9-PARENT',
        firstName: 'Parent',
        lastName: 'LOT 9',
      },
    })
  ).id;
  await h.db.studentGuardian.create({
    data: { tenantId: tenant.id, studentId: a.student.id, guardianId, relationship: 'PARENT' },
  });
}, 120000);
afterAll(async () => {
  await h?.close();
});

describe('LOT 9 assessments, assignment boundaries and bulk grades', () => {
  it('allows a teacher to create an assessment only in an actual assignment', async () => {
    const response = await create(teacher);
    expect(response.status).toBe(201);
    math = response.body;
    expect(math).toMatchObject({
      classSubjectId: mathId,
      status: 'DRAFT',
      maxScore: '20.00',
      weight: '1.00',
      coefficient: '4.00',
    });
  });
  it('denies a teacher creating another subject in the same class', async () =>
    failure(create(teacher, frenchId), 404));
  it('denies another period even when the class/subject UUID is known', async () =>
    failure(
      create(teacher, mathId, { academicPeriodId: secondPeriodId, assessedOn: '2026-09-15' }),
      404,
    ));
  it('rejects a period belonging to another tenant', async () =>
    failure(create(admin, mathId, { academicPeriodId: foreignPeriodId }), 404));
  it('rejects invalid dates outside the period', async () =>
    failure(create(admin, mathId, { assessedOn: '2026-09-15' }), 409, 'ASSESSMENT_DATE_INVALID'));
  it('rejects another year inside the same tenant', async () => {
    const period = await h.db.academicPeriod.create({
      data: {
        tenantId: a.tenantId,
        academicYearId: otherClass.year.id,
        name: 'Other year',
        ordinal: 1,
        type: 'SEMESTER',
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-06-30'),
      },
    });
    await failure(
      create(admin, mathId, { academicPeriodId: period.id }),
      409,
      'ASSESSMENT_CONTEXT_MISMATCH',
    );
  });
  it('does not allow tenant or status injection', async () => {
    await failure(create(admin, mathId, { tenantId: foreign.tenantId }), 400);
    await failure(create(admin, mathId, { status: 'PUBLISHED' }), 400);
  });
  it('hides foreign assessments including their existence', async () => {
    await failure(foreignAdmin.browser.send(`assessments/${math.id}`), 404);
    expect(
      (
        await foreignAdmin.browser.send<ResultList<AssessmentView>>(
          `assessments?classSubjectId=${mathId}`,
        )
      ).body.total,
    ).toBe(0);
  });
  it('shows the real dated roster, not pending or later enrollments', async () => {
    const sheet = await teacher.browser.send<GradeSheet>(`assessments/${math.id}/grades`);
    expect(sheet.status).toBe(200);
    expect(sheet.body.grades.map((row) => row.studentId).toSorted()).toEqual(
      [a.student.id, secondStudentId, thirdStudentId].toSorted(),
    );
    expect(
      sheet.body.grades.every((row) => row.score === null && row.outcome === 'NOT_GRADED'),
    ).toBe(true);
  });
  it.each(['parent', 'student', 'accountant'] as const)(
    'does not disclose drafts to %s',
    async (role) => {
      const actor = { parent, student: pupil, accountant }[role];
      await failure(
        actor.browser.send(`assessments/${math.id}/grades`),
        role === 'accountant' ? 403 : 404,
      );
    },
  );
  it('rejects out-of-range and duplicate bulk input without partial writes', async () => {
    const input = { expectedVersion: math.version, grades: entries(['12', '21', '14']) };
    await failure(
      teacher.browser.send(`assessments/${math.id}/grades`, input, 'PUT'),
      409,
      'GRADE_OUT_OF_RANGE',
    );
    expect(await h.db.grade.count({ where: { assessmentId: math.id } })).toBe(0);
    await failure(
      teacher.browser.send(
        `assessments/${math.id}/grades`,
        { ...input, grades: [input.grades[0], input.grades[0]] },
        'PUT',
      ),
      400,
    );
  });
  it.each(['late', 'pending', 'other-class', 'foreign'] as const)(
    'rejects ineligible student %s',
    async (kind) => {
      const studentId = {
        late: lateStudentId,
        pending: pendingStudentId,
        'other-class': otherClass.student.id,
        foreign: foreign.student.id,
      }[kind];
      await failure(
        teacher.browser.send(
          `assessments/${math.id}/grades`,
          {
            expectedVersion: math.version,
            grades: [{ studentId, score: '10', outcome: 'SCORED' }],
          },
          'PUT',
        ),
        409,
        'GRADE_STUDENT_INELIGIBLE',
      );
    },
  );
  it('saves grades in one bulk call and audits every real row', async () => {
    const response = await save(teacher, math.id);
    expect(response.status).toBe(200);
    expect(response.body.grades.map((row) => row.score).toSorted()).toEqual([
      '12.00',
      '14.00',
      '14.00',
    ]);
    expect(
      await h.db.auditLog.count({ where: { tenantId: a.tenantId, action: 'grade.created' } }),
    ).toBe(3);
  });
  it('enforces uniqueness in PostgreSQL as well as the API', async () => {
    await expect(
      h.db.grade.create({
        data: { tenantId: a.tenantId, assessmentId: math.id, studentId: a.student.id, score: '10' },
      }),
    ).rejects.toThrow();
    expect(await h.db.grade.count({ where: { assessmentId: math.id } })).toBe(3);
  });
  it('prevents lost updates from simultaneous bulk requests', async () => {
    const current = await detail();
    const body = { expectedVersion: current.version, grades: entries(['12', '14', '14']) };
    const results = await Promise.all([
      teacher.browser.send(`assessments/${math.id}/grades`, body, 'PUT'),
      teacher.browser.send(`assessments/${math.id}/grades`, body, 'PUT'),
    ]);
    expect(results.map((row) => row.status).toSorted()).toEqual([200, 409]);
  });
  it('rejects maxima below an existing score', async () =>
    failure(
      admin.browser.send(
        `assessments/${math.id}`,
        { expectedVersion: (await detail()).version, maxScore: '10' },
        'PATCH',
      ),
      409,
      'GRADE_OUT_OF_RANGE',
    ));
  it('denies accountant grade mutation', async () => failure(save(accountant, math.id), 403));
  it('removes access immediately when assignment is archived', async () => {
    const assignment = await h.db.teachingAssignment.findFirstOrThrow({
      where: { teacherId, classSubjectId: mathId, academicPeriodId: periodId },
    });
    await h.db.teachingAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await failure(teacher.browser.send(`assessments/${math.id}/grades`), 404);
    await h.db.teachingAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACTIVE', archivedAt: null },
    });
  });
});
describe('LOT 9 submission, independent validation and publication', () => {
  it('rejects direct draft publication', async () =>
    failure(action(director, math.id, 'publish'), 409, 'ASSESSMENT_INVALID_TRANSITION'));
  it('submits the assessment and every grade atomically', async () => {
    expect((await action(teacher, math.id, 'submit')).body.status).toBe('SUBMITTED');
    expect(await h.db.grade.count({ where: { assessmentId: math.id, status: 'SUBMITTED' } })).toBe(
      3,
    );
  });
  it('blocks normal modifications after submission', async () =>
    failure(save(teacher, math.id), 409, 'ASSESSMENT_NOT_EDITABLE'));
  it('requires explicit authority and reason to reopen', async () => {
    await failure(action(teacher, math.id, 'reopen', { reason: 'Correction demandée' }), 403);
    await failure(action(director, math.id, 'reopen'), 409, 'RESULT_REASON_REQUIRED');
    expect(
      (await action(director, math.id, 'reopen', { reason: 'Compléter la saisie' })).body.status,
    ).toBe('DRAFT');
    expect((await action(teacher, math.id, 'submit')).status).toBe(200);
  });
  it('does not let the teacher validate or publish', async () => {
    await failure(action(teacher, math.id, 'validate'), 403);
    await failure(action(teacher, math.id, 'publish'), 403);
  });
  it('lets the director validate while keeping grades private', async () => {
    expect((await action(director, math.id, 'validate')).body.status).toBe('VALIDATED');
    await failure(parent.browser.send(`assessments/${math.id}/grades`), 404);
  });
  it('publishes the validated assessment', async () =>
    expect((await action(director, math.id, 'publish')).body.status).toBe('PUBLISHED'));
  it('exposes only the linked child and the own student, never classmates', async () => {
    for (const actor of [parent, pupil]) {
      const sheet = await actor.browser.send<GradeSheet>(`assessments/${math.id}/grades`);
      expect(sheet.status).toBe(200);
      expect(sheet.body.grades.map((row) => row.studentId)).toEqual([a.student.id]);
    }
    const sheet = await otherPupil.browser.send<GradeSheet>(`assessments/${math.id}/grades`);
    expect(sheet.body.grades.map((row) => row.studentId)).toEqual([secondStudentId]);
  });
  it('does not let query filters probe other children sharing the same assessment', async () => {
    expect(
      (
        await parent.browser.send<ResultList<AssessmentView>>(
          `assessments?studentId=${secondStudentId}`,
        )
      ).body.total,
    ).toBe(0);
    expect(
      (
        await pupil.browser.send<ResultList<AssessmentView>>(
          `assessments?studentId=${thirdStudentId}`,
        )
      ).body.total,
    ).toBe(0);
  });
  it('blocks generic published patches and arbitrary reopening', async () => {
    await failure(save(admin, math.id), 409, 'ASSESSMENT_NOT_EDITABLE');
    await failure(
      action(admin, math.id, 'reopen', { reason: 'Bypass' }),
      409,
      'ASSESSMENT_INVALID_TRANSITION',
    );
  });
  it('blocks direct SQL mutation of published grades', async () => {
    await expect(
      h.db.grade.updateMany({
        where: { tenantId: a.tenantId, assessmentId: math.id },
        data: { score: '19' },
      }),
    ).rejects.toThrow();
  });
  it('does not disclose live class averages to parents, students or teachers', async () => {
    for (const actor of [parent, pupil, teacher, accountant])
      await failure(
        actor.browser.send(`results/class?classId=${a.classroom.id}&academicPeriodId=${periodId}`),
        403,
      );
  });
});
describe('LOT 9 rankings, snapshots, corrections and irreversible locks', () => {
  it('refuses publishing an incomplete period', async () =>
    failure(
      director.browser.send(
        'report-cards/publish',
        { classId: a.classroom.id, academicPeriodId: periodId },
        'POST',
      ),
      409,
      'GRADES_INCOMPLETE',
    ));
  it('creates the other subject and prevents validation by its own submitter', async () => {
    const response = await create(staff, frenchId);
    expect(response.status).toBe(201);
    french = response.body;
    expect((await save(staff, french.id, ['15', '13', '13'])).status).toBe(200);
    expect((await action(staff, french.id, 'submit')).status).toBe(200);
    await failure(action(staff, french.id, 'validate'), 403, 'ASSESSMENT_SELF_VALIDATION');
    expect((await action(director, french.id, 'validate')).status).toBe(200);
    expect((await action(director, french.id, 'publish')).status).toBe(200);
  });
  it('computes exact class coefficients and competition ranks for the correct population', async () => {
    const reply = await director.browser.send<ClassResults>(
      `results/class?classId=${a.classroom.id}&academicPeriodId=${periodId}`,
    );
    expect(reply.status).toBe(200);
    expect(reply.body.population).toBe(3);
    expect(reply.body.students.find((row) => row.studentId === a.student.id)).toMatchObject({
      overallAverage: '13.29',
      rank: 3,
    });
    expect(
      reply.body.students
        .filter((row) => row.studentId !== a.student.id)
        .map((row) => [row.overallAverage, row.rank]),
    ).toEqual([
      ['13.57', 1],
      ['13.57', 1],
    ]);
  });
  it('does not mix another class or tenant in result requests', async () => {
    await failure(
      foreignAdmin.browser.send(
        `results/class?classId=${a.classroom.id}&academicPeriodId=${periodId}`,
      ),
      404,
    );
    await failure(
      director.browser.send(
        `results/class?classId=${otherClass.classroom.id}&academicPeriodId=${periodId}`,
      ),
      409,
    );
  });
  it('generates draft bulletins invisible to parents', async () => {
    const response = await director.browser.send<ReportCardView[]>(
      'report-cards/generate',
      { classId: a.classroom.id, academicPeriodId: periodId },
      'POST',
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    report = response.body.find((row) => row.studentId === a.student.id) ?? response.body[0]!;
    expect(report).toBeDefined();
    await failure(parent.browser.send(`report-cards/${report.id}`), 404);
  });
  it('saves general and subject remarks before publication', async () => {
    const subjectId = report.snapshot?.student.subjects[0]?.subjectId;
    const response = await director.browser.send<ReportCardView>(
      `report-cards/${report.id}`,
      {
        generalRemark: 'Bon travail régulier',
        remarks: [{ subjectId, remark: 'Des progrès constants' }],
      },
      'PATCH',
    );
    expect(response.status).toBe(200);
    expect(response.body.snapshot?.generalRemark).toBe('Bon travail régulier');
  });
  it('publishes the entire period atomically with complete historical snapshots', async () => {
    const response = await director.browser.send<ReportCardView[]>(
      'report-cards/publish',
      { classId: a.classroom.id, academicPeriodId: periodId },
      'POST',
    );
    expect(response.status).toBe(200);
    expect(response.body.every((row) => row.status === 'PUBLISHED')).toBe(true);
    report = response.body.find((row) => row.studentId === a.student.id) ?? response.body[0]!;
    expect(report.snapshot).toMatchObject({
      population: 3,
      rankedPopulation: 3,
      generalRemark: 'Bon travail régulier',
      student: { matricule: a.student.matricule, overallAverage: '13.29', rank: 3 },
    });
  });
  it('allows CHILDREN and OWN snapshots but denies other students', async () => {
    expect((await parent.browser.send(`report-cards/${report.id}`)).status).toBe(200);
    expect((await pupil.browser.send(`report-cards/${report.id}`)).status).toBe(200);
    await failure(otherPupil.browser.send(`report-cards/${report.id}`), 404);
    expect(
      (
        await parent.browser.send<ResultList<ReportCardView>>(
          `report-cards?studentId=${secondStudentId}`,
        )
      ).body.total,
    ).toBe(0);
  });
  it('revokes CHILDREN immediately when the actual relationship is removed', async () => {
    await h.db.studentGuardian.deleteMany({
      where: { tenantId: a.tenantId, guardianId, studentId: a.student.id },
    });
    await failure(parent.browser.send(`report-cards/${report.id}`), 404);
    await h.db.studentGuardian.create({
      data: { tenantId: a.tenantId, studentId: a.student.id, guardianId, relationship: 'PARENT' },
    });
  });
  it('requires a reason and elevated permission for a published correction', async () => {
    const grade = await h.db.grade.findFirstOrThrow({
      where: { assessmentId: math.id, studentId: a.student.id },
    });
    const body = { expectedVersion: (await detail()).version, score: '14', outcome: 'SCORED' };
    await failure(director.browser.send(`grades/${grade.id}/correct`, body, 'POST'), 400);
    for (const actor of [teacher, parent, pupil, accountant, staff])
      await failure(
        actor.browser.send(
          `grades/${grade.id}/correct`,
          { ...body, reason: 'Erreur de saisie' },
          'POST',
        ),
        403,
      );
  });
  it('records 12 → 14, actor, reason, requestId and immutable history', async () => {
    const grade = await h.db.grade.findFirstOrThrow({
      where: { assessmentId: math.id, studentId: a.student.id },
    });
    const response = await director.browser.send(
      `grades/${grade.id}/correct`,
      {
        expectedVersion: (await detail()).version,
        score: '14',
        outcome: 'SCORED',
        reason: 'Erreur de saisie vérifiée',
      },
      'POST',
    );
    expect(response.status).toBe(200);
    const changes = await director.browser.send<GradeChangeView[]>(`grades/${grade.id}/changes`);
    expect(changes.body).toHaveLength(1);
    expect(changes.body[0]).toMatchObject({
      previousScore: '12.00',
      newScore: '14.00',
      actorMembershipId: director.membershipId,
    });
    expect(changes.body[0]?.requestId).toBeTruthy();
    expect(
      await h.db.auditLog.count({ where: { entityId: grade.id, action: 'grade.corrected' } }),
    ).toBe(1);
    await expect(
      h.db.gradeChange.updateMany({ where: { gradeId: grade.id }, data: { reason: 'Rewritten' } }),
    ).rejects.toThrow();
    await expect(h.db.gradeChange.deleteMany({ where: { gradeId: grade.id } })).rejects.toThrow();
  });
  it('never silently recalculates a published bulletin after grade correction', async () => {
    const historical = await pupil.browser.send<ReportCardView>(`report-cards/${report.id}`);
    expect(historical.body.snapshot).toEqual(report.snapshot);
    const live = await director.browser.send<ClassResults>(
      `results/class?classId=${a.classroom.id}&academicPeriodId=${periodId}`,
    );
    expect(live.body.students.find((row) => row.studentId === a.student.id)?.overallAverage).toBe(
      '14.43',
    );
  });
  it('preserves snapshots after later subject, coefficient and student edits', async () => {
    const subjectId = (await h.db.classSubject.findUniqueOrThrow({ where: { id: mathId } }))
      .subjectId;
    await h.db.subject.update({
      where: { id: subjectId },
      data: { name: 'Mathématiques — nouveau libellé' },
    });
    await h.db.classSubject.create({
      data: {
        tenantId: a.tenantId,
        schoolClassId: otherClass.classroom.id,
        subjectId,
        coefficient: '7',
      },
    });
    await h.db.student.update({
      where: { id: a.student.id },
      data: { firstName: 'Nouveau prénom' },
    });
    expect(
      (await pupil.browser.send<ReportCardView>(`report-cards/${report.id}`)).body.snapshot,
    ).toEqual(report.snapshot);
  });
  it('rejects updates/deletes/inserts of published bulletin data and lines', async () => {
    await failure(
      director.browser.send(
        `report-cards/${report.id}`,
        { generalRemark: 'Overwrite', remarks: [] },
        'PATCH',
      ),
      409,
      'REPORT_IMMUTABLE',
    );
    await expect(
      h.db.reportCard.update({ where: { id: report.id }, data: { rank: 99 } }),
    ).rejects.toThrow();
    await expect(h.db.reportCard.delete({ where: { id: report.id } })).rejects.toThrow();
    await expect(
      h.db.reportCardLine.updateMany({
        where: { reportCardId: report.id },
        data: { average: '20' },
      }),
    ).rejects.toThrow();
    await expect(
      h.db.reportCardLine.deleteMany({ where: { reportCardId: report.id } }),
    ).rejects.toThrow();
    const extraSubject = await h.db.subject.create({
      data: { tenantId: a.tenantId, code: 'LOT9-INSERT-GUARD', name: 'Matière non historique' },
    });
    await expect(
      h.db.reportCardLine.create({
        data: {
          tenantId: a.tenantId,
          reportCardId: report.id,
          subjectId: extraSubject.id,
          subjectName: extraSubject.name,
          coefficient: '1',
          average: '20',
        },
      }),
    ).rejects.toThrow();
  });
  it('locks a bulletin without changing its immutable PostgreSQL row', async () => {
    const before = await h.db.reportCard.findUniqueOrThrow({ where: { id: report.id } });
    const response = await director.browser.send<ReportCardView>(
      `report-cards/${report.id}/lock`,
      {},
      'POST',
    );
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('LOCKED');
    expect(response.body.lockedAt).not.toBeNull();
    expect(await h.db.reportCard.findUniqueOrThrow({ where: { id: report.id } })).toEqual(before);
    expect((await director.browser.send(`report-cards/${report.id}/lock`, {}, 'POST')).status).toBe(
      200,
    );
    expect(
      await h.db.auditLog.count({ where: { entityId: report.id, action: 'report_card.locked' } }),
    ).toBe(1);
  });
  it('locks the assessment and all grades, refusing even privileged correction', async () => {
    expect((await action(director, math.id, 'lock')).body.status).toBe('LOCKED');
    expect(await h.db.grade.count({ where: { assessmentId: math.id, status: 'LOCKED' } })).toBe(3);
    await failure(save(admin, math.id), 409, 'ASSESSMENT_LOCKED');
    const grade = await h.db.grade.findFirstOrThrow({ where: { assessmentId: math.id } });
    await failure(
      director.browser.send(
        `grades/${grade.id}/correct`,
        {
          expectedVersion: (await detail()).version,
          score: '20',
          outcome: 'SCORED',
          reason: 'Tentative interdite',
        },
        'POST',
      ),
      409,
      'ASSESSMENT_LOCKED',
    );
    await expect(
      h.db.grade.update({ where: { id: grade.id }, data: { score: '20' } }),
    ).rejects.toThrow();
  });
  it('has all mandatory audit transitions without leaking IAM secrets', async () => {
    const rows = await h.db.auditLog.findMany({
      where: { tenantId: a.tenantId, action: { startsWith: 'assessment.' } },
    });
    for (const event of ['created', 'submitted', 'validated', 'published', 'locked'])
      expect(rows.some((row) => row.action === `assessment.${event}`)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('passwordHash');
    expect(h.errors).toEqual([]);
  });
  it('has no orphan result rows', async () => {
    const rows = await h.db.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT count(*)::integer count FROM grades g LEFT JOIN assessments a ON (a.tenant_id,a.id)=(g.tenant_id,g.assessment_id) LEFT JOIN students s ON (s.tenant_id,s.id)=(g.tenant_id,g.student_id) WHERE g.tenant_id=${a.tenantId}::uuid AND (a.id IS NULL OR s.id IS NULL)`,
    );
    expect(rows[0]?.count).toBe(0);
  });
  it('never turns a parent + teacher role union into access to the child’s entire class', async () => {
    const parentRole = await h.db.role.findFirstOrThrow({
      where: { tenantId: null, code: 'PARENT' },
    });
    await h.db.membershipRole.create({
      data: { tenantId: a.tenantId, membershipId: teacher.membershipId, roleId: parentRole.id },
    });
    const guardian = await h.db.guardian.create({
      data: {
        tenantId: a.tenantId,
        userId: teacher.userId,
        guardianReference: 'LOT9-MULTIROLE',
        firstName: 'Enseignant',
        lastName: 'Parent',
      },
    });
    await h.db.studentGuardian.create({
      data: {
        tenantId: a.tenantId,
        studentId: a.student.id,
        guardianId: guardian.id,
        relationship: 'PARENT',
      },
    });
    const sheet = await teacher.browser.send<GradeSheet>(`assessments/${french.id}/grades`);
    expect(sheet.status).toBe(200);
    expect(sheet.body.grades.map((grade) => grade.studentId)).toEqual([a.student.id]);
    const probe = await teacher.browser.send<ResultList<AssessmentView>>(
      `assessments?classSubjectId=${frenchId}&studentId=${secondStudentId}`,
    );
    expect(probe.body.total).toBe(0);
    const grade = await h.db.grade.findFirstOrThrow({
      where: { assessmentId: french.id, studentId: secondStudentId },
    });
    await failure(teacher.browser.send(`grades/${grade.id}/changes`), 404);
    await failure(
      teacher.browser.send(
        `grades/${grade.id}`,
        { expectedVersion: (await detail(french.id)).version, score: '20', outcome: 'SCORED' },
        'PATCH',
      ),
      404,
    );
  });
  it('handles a 301-student class with bulk writes and a bounded class calculation', async () => {
    const graph = await h.graph(foreign.tenantId, foreignAdmin.browser);
    const period = await h.db.academicPeriod.create({
      data: {
        tenantId: graph.tenantId,
        academicYearId: graph.year.id,
        name: 'Période charge',
        type: 'SEMESTER',
        ordinal: 1,
        startsOn: new Date('2026-01-01'),
        endsOn: new Date('2026-06-30'),
      },
    });
    const subject = await h.db.subject.create({
      data: { tenantId: graph.tenantId, code: randomUUID().slice(0, 8), name: 'Matière charge' },
    });
    const link = await h.db.classSubject.create({
      data: {
        tenantId: graph.tenantId,
        schoolClassId: graph.classroom.id,
        subjectId: subject.id,
        coefficient: '4',
      },
    });
    const instructor = await h.db.teacher.create({
      data: {
        tenantId: graph.tenantId,
        employeeNumber: randomUUID(),
        firstName: 'Test',
        lastName: 'Charge',
      },
    });
    await h.db.teachingAssignment.create({
      data: {
        tenantId: graph.tenantId,
        teacherId: instructor.id,
        classSubjectId: link.id,
        academicPeriodId: period.id,
      },
    });
    const ids = Array.from({ length: 300 }, () => randomUUID());
    await h.db.student.createMany({
      data: ids.map((id) => ({
        id,
        tenantId: graph.tenantId,
        matricule: id,
        firstName: 'Élève',
        lastName: id,
      })),
    });
    await h.db.enrollment.createMany({
      data: ids.map((studentId) => ({
        tenantId: graph.tenantId,
        studentId,
        academicYearId: graph.year.id,
        schoolClassId: graph.classroom.id,
        enrolledOn: new Date('2026-01-01'),
      })),
    });
    const created = await foreignAdmin.browser.send<AssessmentView>(
      'assessments',
      {
        title: 'Charge 301',
        classSubjectId: link.id,
        academicPeriodId: period.id,
        assessedOn: '2026-03-15',
        maxScore: '50',
        weight: '2',
      },
      'POST',
    );
    expect(created.status).toBe(201);
    const saved = await foreignAdmin.browser.send<GradeSheet>(
      `assessments/${created.body.id}/grades`,
      {
        expectedVersion: created.body.version,
        grades: [...ids, graph.student.id].map((studentId) => ({
          studentId,
          score: '37.5',
          outcome: 'SCORED',
        })),
      },
      'PUT',
    );
    expect(saved.status).toBe(200);
    expect(saved.body.grades).toHaveLength(301);
    let current = await foreignAdmin.browser.send<AssessmentView>(
      `assessments/${created.body.id}/submit`,
      { expectedVersion: saved.body.assessment.version },
      'POST',
    );
    expect(current.status).toBe(200);
    const independent = await h.account(graph.tenantId, 'DIRECTOR');
    for (const verb of ['validate', 'publish']) {
      current = await independent.browser.send<AssessmentView>(
        `assessments/${created.body.id}/${verb}`,
        { expectedVersion: current.body.version },
        'POST',
      );
      expect(current.status).toBe(200);
    }
    const result = await independent.browser.send<ClassResults>(
      `results/class?classId=${graph.classroom.id}&academicPeriodId=${period.id}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.population).toBe(301);
    expect(
      result.body.students.every(
        (student) => student.overallAverage === '15.00' && student.rank === 1,
      ),
    ).toBe(true);
    expect(await h.db.grade.count({ where: { assessmentId: created.body.id } })).toBe(301);
    const reports = await independent.browser.send<ReportCardView[]>(
      'report-cards/publish',
      { classId: graph.classroom.id, academicPeriodId: period.id },
      'POST',
    );
    expect(reports.status).toBe(200);
    expect(reports.body).toHaveLength(301);
  }, 60000);
});
