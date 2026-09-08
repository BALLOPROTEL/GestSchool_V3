import { describe, expect, it } from 'vitest';
import {
  academicPeriodCreate,
  academicYearCreate,
  coefficient,
  roleGrants,
  type AcademicStatus,
} from '@gestschool/contracts';
import { academicAccess, validPeriod, writableYear, yearTransition } from './policy.js';
import type { RequestContext } from '../../iam/domain/context.js';

const period = {
  name: 'P1',
  type: 'TRIMESTER' as const,
  ordinal: 1,
  startsOn: '2026-09-01',
  endsOn: '2026-12-18',
};
const year = { startsOn: '2026-09-01', endsOn: '2027-06-30' };
describe('academic domain invariants', () => {
  it.each(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const)(
    'allows only the next transition from %s',
    (status) => {
      const next: Partial<Record<AcademicStatus, string>> = {
        DRAFT: 'activate',
        ACTIVE: 'close',
        CLOSED: 'archive',
      };
      for (const action of ['activate', 'close', 'archive'] as const) {
        if (next[status] === action) expect(yearTransition(status, action)).not.toBe(status);
        else expect(() => yearTransition(status, action)).toThrow('ACADEMIC_INVALID_TRANSITION');
      }
    },
  );
  it.each(['CLOSED', 'ARCHIVED'] as const)('protects structures in %s years', (status) =>
    expect(() => writableYear(status)).toThrow('ACADEMIC_YEAR_CLOSED'),
  );
  it('validates coherent semesters and trimesters', () => {
    expect(() => validPeriod(period, year, [])).not.toThrow();
    expect(() =>
      validPeriod({ ...period, type: 'SEMESTER', endsOn: '2027-01-31' }, year, []),
    ).not.toThrow();
  });
  it.each([
    [{ ...period, startsOn: '2026-08-01' }, [], 'ACADEMIC_PERIOD_DATES'],
    [{ ...period, ordinal: 3, type: 'SEMESTER' }, [], 'ACADEMIC_PERIOD_SEQUENCE'],
    [{ ...period, type: 'SEMESTER' }, [period], 'ACADEMIC_PERIOD_TYPE'],
    [period, [period], 'ACADEMIC_PERIOD_SEQUENCE'],
    [{ ...period, ordinal: 2 }, [period], 'ACADEMIC_PERIOD_OVERLAP'],
    [
      { ...period, ordinal: 2, startsOn: '2026-09-01', endsOn: '2026-10-01' },
      [{ ...period, startsOn: '2026-11-01' }],
      'ACADEMIC_PERIOD_SEQUENCE',
    ],
  ] as const)('rejects inconsistent period %#', (input, siblings, error) =>
    expect(() => validPeriod(input, year, siblings)).toThrow(error),
  );
  it.each([0, -1, 1000, 0.001, '1e2', 'NaN', '1.234', '-1', '0'])(
    'rejects coefficient %s',
    (value) => expect(coefficient.safeParse(value).success).toBe(false),
  );
  it.each([0.01, 0.29, 4, 999.99, '4.25'])('preserves valid decimal coefficient %s', (value) =>
    expect(Number(coefficient.parse(value))).toBe(Number(value)),
  );
  it('rejects unknown tenant fields and impossible civil dates', () => {
    expect(
      academicYearCreate.safeParse({ code: 'YEAR', name: 'Year', ...year, tenantId: 'arbitrary' })
        .success,
    ).toBe(false);
    expect(academicPeriodCreate.safeParse({ ...period, startsOn: '2026-02-30' }).success).toBe(
      false,
    );
  });
  it.each([
    'SCHOOL_ADMIN',
    'DIRECTOR',
    'ACADEMIC_STAFF',
    'TEACHER',
    'ACCOUNTANT',
    'PARENT',
    'STUDENT',
  ] as const)('honors role %s without broadening privileged operations', (role) => {
    const context: RequestContext = {
      userId: 'user',
      sessionId: 'session',
      membershipId: 'membership',
      tenantId: 'tenant',
      requestId: 'request',
      ipAddress: 'local',
      userAgent: 'test',
      roles: [role],
      grants: [...roleGrants[role]],
    };
    if (['SCHOOL_ADMIN', 'DIRECTOR', 'ACADEMIC_STAFF'].includes(role))
      expect(() => academicAccess(context, 'classes', 'create')).not.toThrow();
    else expect(() => academicAccess(context, 'classes', 'create')).toThrow('AUTH_FORBIDDEN');
    if (role === 'TEACHER') expect(() => academicAccess(context, 'classes')).not.toThrow();
  });
});
