import { describe, expect, it } from 'vitest';
import {
  enrollmentCreate,
  roleGrants,
  type SessionView,
  type EnrollmentClassView,
  type EnrollmentView,
} from '@gestschool/contracts';
import { PeopleError } from '../directory/people-client';
import {
  canEnrollment,
  canEnrollmentAction,
  enrollmentErrorKey,
  hasEnrollmentPlace,
} from './enrollment-client';

const session = (role: keyof typeof roleGrants): SessionView => ({
  user: { id: 'user', displayName: 'test' },
  tenant: { id: 'tenant', name: 'test' },
  membershipId: 'membership',
  sessionId: 'session',
  roles: [role],
  grants: [...roleGrants[role]],
});
const row: EnrollmentView = {
  id: 'enrollment',
  studentId: 'student',
  studentName: 'Student',
  matricule: '001',
  academicYearId: 'year',
  academicYearName: 'Year',
  academicYearStatus: 'ACTIVE',
  classId: 'class',
  className: 'Class',
  levelId: 'level',
  levelName: 'Level',
  type: 'NEW',
  status: 'PENDING',
  enrolledOn: '2026-09-01',
  endedOn: null,
  createdAt: '',
  updatedAt: '',
};
const classroom: EnrollmentClassView = {
  id: 'class',
  name: 'Class',
  code: 'C',
  academicYearId: 'year',
  academicYearName: 'Year',
  levelId: 'level',
  levelName: 'Level',
  capacity: 1,
  activeEnrollments: 0,
  pendingEnrollments: 1,
  occupiedPlaces: 1,
  availablePlaces: 0,
};
describe('LOT 7 presentation rules', () => {
  it('distinguishes unavailable services from local field validation', () => {
    expect(enrollmentErrorKey(new TypeError('Failed to fetch'))).toBe('unavailable');
    const input = enrollmentCreate.safeParse({});
    expect(input.success).toBe(false);
    if (!input.success) expect(enrollmentErrorKey(input.error)).toBe('invalid');
  });
  it.each(['SCHOOL_ADMIN', 'DIRECTOR', 'ACADEMIC_STAFF'] as const)(
    '%s receives administrative actions',
    (role) => {
      for (const action of [
        'read',
        'create',
        'update',
        'confirm',
        'transfer',
        'cancel',
        'complete',
      ])
        expect(canEnrollment(session(role), action)).toBe(true);
    },
  );
  it.each(['PARENT', 'STUDENT'] as const)('%s can read but cannot administer', (role) => {
    expect(canEnrollment(session(role))).toBe(true);
    for (const action of ['create', 'update', 'confirm', 'transfer', 'cancel', 'complete'])
      expect(canEnrollment(session(role), action)).toBe(false);
  });
  it.each(['TEACHER', 'ACCOUNTANT'] as const)('%s receives no implicit enrollment grants', (role) =>
    expect(canEnrollment(session(role))).toBe(false),
  );
  it('denies missing sessions and non-super-admin platform grants', () => {
    expect(canEnrollment(undefined)).toBe(false);
    expect(
      canEnrollment(
        {
          ...session('STUDENT'),
          grants: [{ permission: 'enrollments.create', scope: 'PLATFORM' }],
        },
        'create',
      ),
    ).toBe(false);
  });
  it.each(['CLOSED', 'ARCHIVED'] as const)(
    'freezes %s years for every action',
    (academicYearStatus) => {
      for (const action of ['update', 'confirm', 'cancel', 'transfer', 'complete'] as const)
        expect(canEnrollmentAction({ ...row, academicYearStatus }, action)).toBe(false);
    },
  );
  it('allows only the real pending/active workflow and terminal states', () => {
    expect(canEnrollmentAction(row, 'confirm')).toBe(true);
    expect(canEnrollmentAction(row, 'transfer')).toBe(false);
    expect(canEnrollmentAction({ ...row, status: 'ACTIVE' }, 'update')).toBe(false);
    expect(canEnrollmentAction({ ...row, status: 'ACTIVE' }, 'transfer')).toBe(true);
    for (const status of ['WITHDRAWN', 'COMPLETED', 'TRANSFERRED'] as const)
      for (const action of ['update', 'confirm', 'cancel', 'transfer', 'complete'] as const)
        expect(canEnrollmentAction({ ...row, status }, action)).toBe(false);
  });
  it('credits an existing reservation, not another student or class, and supports unlimited capacity', () => {
    expect(hasEnrollmentPlace(classroom)).toBe(false);
    expect(hasEnrollmentPlace(classroom, row)).toBe(true);
    expect(hasEnrollmentPlace(classroom, { ...row, classId: 'other' })).toBe(false);
    expect(hasEnrollmentPlace(classroom, { ...row, status: 'ACTIVE' })).toBe(false);
    expect(hasEnrollmentPlace({ ...classroom, capacity: null, availablePlaces: null })).toBe(true);
  });
  it.each([
    ['ENROLLMENT_DUPLICATE', 'duplicate'],
    ['ENROLLMENT_CLASS_FULL', 'classFull'],
    ['ENROLLMENT_YEAR_CLOSED', 'yearClosed'],
    ['ENROLLMENT_HISTORY_REQUIRED', 'historyRequired'],
    ['ENROLLMENT_INVALID_TRANSITION', 'invalidTransition'],
    ['ENROLLMENT_NOT_FOUND', 'notFound'],
    ['ENROLLMENT_CONFLICT', 'conflict'],
    ['AUTH_FORBIDDEN', 'forbidden'],
    ['UNKNOWN', 'unavailable'],
  ] as const)('translates %s without exposing backend details', (code, key) =>
    expect(enrollmentErrorKey(new PeopleError(code))).toBe(key),
  );
});
