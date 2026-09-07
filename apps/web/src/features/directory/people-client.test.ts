import { describe, expect, it } from 'vitest';
import { roleGrants, type SessionView } from '@gestschool/contracts';
import { canRead, canWrite, errorKey, PeopleError } from './people-client';
const session = (role: keyof typeof roleGrants): SessionView => ({
  user: { id: 'user', displayName: 'test' },
  tenant: { id: 'tenant', name: 'test' },
  membershipId: 'membership',
  sessionId: 'session',
  roles: [role],
  grants: [...roleGrants[role]],
});
describe('LOT 5 presentation permissions and errors', () => {
  it('shows administration only for tenant administrators', () => {
    for (const kind of ['students', 'guardians', 'teachers'] as const) {
      expect(canWrite(session('SCHOOL_ADMIN'), kind, 'create')).toBe(true);
      expect(canWrite(session('SCHOOL_ADMIN'), kind, 'archive')).toBe(true);
      for (const role of ['TEACHER', 'PARENT', 'STUDENT'] as const)
        expect(canWrite(session(role), kind, 'create')).toBe(false);
    }
  });
  it('keeps scoped readers and denies unknown/no-permission sessions', () => {
    expect(canRead(session('STUDENT'), 'students')).toBe(true);
    expect(canRead(session('STUDENT'), 'teachers')).toBe(false);
    expect(canRead(session('TEACHER'), 'teachers')).toBe(true);
    expect(canRead(undefined, 'students')).toBe(false);
    expect(
      canWrite(
        { ...session('STUDENT'), grants: [{ permission: 'students.create', scope: 'PLATFORM' }] },
        'students',
        'create',
      ),
    ).toBe(false);
  });
  it.each([
    ['PERSON_NOT_FOUND', 'notFound'],
    ['PERSON_REFERENCE_CONFLICT', 'conflict'],
    ['AUTH_INVALID_REQUEST', 'invalid'],
    ['AUTH_FORBIDDEN', 'forbidden'],
    ['AUTH_SESSION_EXPIRED', 'expired'],
    ['PERSON_ARCHIVED', 'archivedError'],
    ['UNKNOWN', 'unavailable'],
  ])('translates stable API code %s without exposing a raw backend message', (code, expected) => {
    expect(errorKey(new PeopleError(code ?? 'UNKNOWN'))).toBe(expected);
  });
});
