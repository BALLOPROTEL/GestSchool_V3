import { describe, expect, it } from 'vitest';
import {
  enrollmentCreate,
  enrollmentEnd,
  enrollmentQuery,
  enrollmentStatuses,
  enrollmentTransfer,
  enrollmentUpdate,
} from '@gestschool/contracts';
import {
  enrollmentAccess,
  enrollmentCapacity,
  enrollmentEffectiveDate,
  enrollmentTransition,
  enrollmentWritableYear,
} from './policy.js';
import type { RequestContext } from '../../iam/domain/context.js';

const id = '11111111-1111-4111-8111-111111111111';
const input = {
  studentId: id,
  classId: id,
  academicYearId: id,
  type: 'NEW',
  enrolledOn: '2026-09-01',
};
const context: RequestContext = {
  userId: id,
  membershipId: id,
  tenantId: id,
  sessionId: id,
  requestId: id,
  ipAddress: '127.0.0.1',
  userAgent: 'test',
  roles: [],
  grants: [],
};
describe('enrollment workflow policies', () => {
  it.each(enrollmentStatuses)('rejects terminal or inappropriate transitions from %s', (status) => {
    for (const action of ['confirm', 'cancel', 'complete', 'transfer', 'update'] as const) {
      const allowed =
        status === 'PENDING'
          ? ['confirm', 'cancel', 'update']
          : status === 'ACTIVE'
            ? ['cancel', 'complete', 'transfer']
            : [];
      if (allowed.includes(action))
        expect(() => enrollmentTransition(status, action)).not.toThrow();
      else
        expect(() => enrollmentTransition(status, action)).toThrow('ENROLLMENT_INVALID_TRANSITION');
    }
  });
  it('uses WITHDRAWN for cancellation and retains ACTIVE for internal transfers', () => {
    expect(enrollmentTransition('PENDING', 'cancel')).toBe('WITHDRAWN');
    expect(enrollmentTransition('ACTIVE', 'transfer')).toBe('ACTIVE');
    expect(enrollmentTransition('ACTIVE', 'complete')).toBe('COMPLETED');
  });
  it.each(['CLOSED', 'ARCHIVED'])('freezes %s academic years', (status) => {
    expect(() => enrollmentWritableYear(status)).toThrow('ENROLLMENT_YEAR_CLOSED');
  });
  it.each(['DRAFT', 'ACTIVE'])('accepts preparation in %s academic years', (status) => {
    expect(() => enrollmentWritableYear(status)).not.toThrow();
  });
  it('reserves the final place but never one beyond it', () => {
    expect(() => enrollmentCapacity(10, 9)).not.toThrow();
    expect(() => enrollmentCapacity(10, 10)).toThrow('ENROLLMENT_CLASS_FULL');
    expect(() => enrollmentCapacity(null, 1000)).not.toThrow();
  });
  it('validates effective dates within the year and chronological history', () => {
    const year = { startsOn: '2026-09-01', endsOn: '2027-06-30' };
    expect(() => enrollmentEffectiveDate('2026-09-15', year, '2026-09-02')).not.toThrow();
    for (const date of ['2026-08-31', '2027-07-01', '2026-09-01'])
      expect(() => enrollmentEffectiveDate(date, year, '2026-09-02')).toThrow(
        'ENROLLMENT_INVALID_DATE',
      );
  });
});
describe('strict enrollment contracts', () => {
  it('requires a type for new API records and rejects direct transfer creation', () => {
    expect(enrollmentCreate.safeParse(input).success).toBe(true);
    expect(enrollmentCreate.safeParse({ ...input, type: 'RE_ENROLLMENT' }).success).toBe(true);
    for (const type of [undefined, null, 'TRANSFER', 'LEGACY'])
      expect(enrollmentCreate.safeParse({ ...input, type }).success).toBe(false);
  });
  it.each(['tenantId', 'status', 'endedOn', 'actorId', 'id'])(
    'blocks mass assignment of %s',
    (field) => {
      expect(enrollmentCreate.safeParse({ ...input, [field]: id }).success).toBe(false);
    },
  );
  it.each(['studentId', 'academicYearId', 'status', 'tenantId'])(
    'keeps %s out of PATCH',
    (field) => {
      expect(enrollmentUpdate.safeParse({ [field]: id }).success).toBe(false);
    },
  );
  it('requires a meaningful PATCH', () => {
    expect(enrollmentUpdate.safeParse({}).success).toBe(false);
    expect(enrollmentUpdate.safeParse({ enrolledOn: '2026-09-02' }).success).toBe(true);
  });
  it.each(['', ' ', 'ab', 'x'.repeat(1001)])(
    'rejects a missing or invalid transition reason %#',
    (reason) => {
      expect(enrollmentEnd.safeParse({ reason, effectiveDate: '2026-09-02' }).success).toBe(false);
    },
  );
  it('rejects malformed UUID and impossible dates', () => {
    expect(
      enrollmentTransfer.safeParse({
        targetClassId: 'tenant-spoof',
        reason: 'Changement',
        effectiveDate: '2026-09-02',
      }).success,
    ).toBe(false);
    expect(enrollmentCreate.safeParse({ ...input, enrolledOn: '2026-02-30' }).success).toBe(false);
  });
  it.each([
    { page: '0' },
    { pageSize: '101' },
    { page: '1.5' },
    { tenantId: id },
    { sort: 'arbitrary' },
  ])('rejects unsafe query %#', (query) => {
    expect(enrollmentQuery.safeParse(query).success).toBe(false);
  });
  it('defaults to bounded pagination', () => {
    expect(enrollmentQuery.parse({})).toMatchObject({ page: 1, pageSize: 25, status: 'ALL' });
  });
});
describe('enrollment permission boundaries', () => {
  it('denies by default and never trusts a PLATFORM grant without SUPER_ADMIN', () => {
    expect(() => enrollmentAccess(context)).toThrow('AUTH_FORBIDDEN');
    expect(() =>
      enrollmentAccess({
        ...context,
        grants: [{ permission: 'enrollments.read', scope: 'PLATFORM' }],
      }),
    ).toThrow('AUTH_FORBIDDEN');
  });
  it.each(['OWN', 'CHILDREN'] as const)('accepts %s only for scoped reads', (scope) => {
    const scoped = { ...context, grants: [{ permission: 'enrollments.read', scope }] };
    expect(() => enrollmentAccess(scoped)).not.toThrow();
    expect(() => enrollmentAccess(scoped, 'create')).toThrow('AUTH_FORBIDDEN');
  });
  it('requires the exact mutation permission', () => {
    const reader = {
      ...context,
      grants: [{ permission: 'enrollments.read', scope: 'TENANT' as const }],
    };
    expect(() => enrollmentAccess(reader, 'transfer')).toThrow('AUTH_FORBIDDEN');
  });
});
