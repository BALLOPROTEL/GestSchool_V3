import { describe, expect, it } from 'vitest';
import {
  academicEntities,
  roleGrants,
  type SessionView,
  type AcademicView,
} from '@gestschool/contracts';
import { PeopleError } from '../directory/people-client';
import { academicErrorKey, academicWritable, canAcademic } from './academic-client';

const session = (role: keyof typeof roleGrants): SessionView => ({
  user: { id: 'user', displayName: 'test' },
  tenant: { id: 'tenant', name: 'test' },
  membershipId: 'membership',
  sessionId: 'session',
  roles: [role],
  grants: [...roleGrants[role]],
});
describe('LOT 6 presentation permissions and workflow', () => {
  it.each(['SCHOOL_ADMIN', 'DIRECTOR', 'ACADEMIC_STAFF'] as const)(
    '%s administers academic references',
    (role) => {
      for (const entity of academicEntities) {
        expect(canAcademic(session(role), entity)).toBe(true);
        expect(canAcademic(session(role), entity, 'update')).toBe(true);
      }
    },
  );
  it.each(['ACCOUNTANT', 'STUDENT', 'PARENT'] as const)(
    '%s receives no academic grants automatically',
    (role) => {
      for (const entity of academicEntities) expect(canAcademic(session(role), entity)).toBe(false);
    },
  );
  it('allows assigned teachers to read but never mutate academic data', () => {
    for (const entity of academicEntities) {
      expect(canAcademic(session('TEACHER'), entity)).toBe(true);
      for (const action of ['create', 'update', 'archive', 'activate', 'close'])
        expect(canAcademic(session('TEACHER'), entity, action)).toBe(false);
    }
    expect(canAcademic(undefined, 'classes')).toBe(false);
    expect(
      canAcademic(
        { ...session('TEACHER'), grants: [{ permission: 'classes.create', scope: 'PLATFORM' }] },
        'classes',
        'create',
      ),
    ).toBe(false);
  });
  it.each(['CLOSED', 'ARCHIVED'] as const)(
    'keeps %s years and their children read-only',
    (status) => {
      const row: AcademicView = {
        id: 'id',
        name: 'class',
        status: 'ACTIVE',
        createdAt: '',
        archivedAt: null,
      };
      expect(academicWritable(row)).toBe(true);
      expect(academicWritable({ ...row, status })).toBe(false);
      expect(academicWritable({ ...row, academicYearStatus: status })).toBe(false);
    },
  );
  it.each([
    ['ACADEMIC_NOT_FOUND', 'notFound'],
    ['ACADEMIC_CONFLICT', 'conflict'],
    ['ACADEMIC_HISTORY_PROTECTED', 'historyProtected'],
    ['ACADEMIC_ACTIVE_YEAR_EXISTS', 'activeYearExists'],
    ['ACADEMIC_INVALID_TRANSITION', 'invalidTransition'],
    ['ACADEMIC_YEAR_CLOSED', 'yearClosed'],
    ['ACADEMIC_PERIOD_DATES', 'invalidDates'],
    ['ACADEMIC_PERIOD_OVERLAP', 'periodOverlap'],
    ['ACADEMIC_PERIOD_SEQUENCE', 'invalidSequence'],
    ['ACADEMIC_PERIOD_TYPE', 'periodType'],
    ['ACADEMIC_ASSIGNMENT_YEAR', 'assignmentYear'],
    ['AUTH_FORBIDDEN', 'forbidden'],
    ['AUTH_INVALID_REQUEST', 'invalid'],
    ['UNKNOWN', 'unavailable'],
  ] as const)('maps %s to a translated error without raw backend messages', (code, key) =>
    expect(academicErrorKey(new PeopleError(code))).toBe(key),
  );
});
