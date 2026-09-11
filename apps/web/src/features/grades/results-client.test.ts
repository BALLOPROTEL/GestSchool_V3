import { describe, expect, it } from 'vitest';
import { roleGrants, type SystemRole, type SessionView } from '@gestschool/contracts';
import { canResults, resultErrorKey, scoreInput, validScore } from './results-client';
import { PeopleError } from '../directory/people-client';
const session = (role: SystemRole): SessionView => ({
  user: { id: 'user', displayName: 'Test' },
  tenant: { id: 'tenant', name: 'Test' },
  sessionId: 'session',
  membershipId: 'member',
  roles: [role],
  grants: [...roleGrants[role]],
});
describe('Results frontend guards and exact score validation', () => {
  it.each(['0', '20', '20.00', '19.99', '1,25'])('accepts valid exact score %s', (value) =>
    expect(validScore(value, 'SCORED', '20.00')).toBe(true),
  );
  it.each(['', '-1', '20.01', '1.001', 'NaN', 'Infinity', '1e1'])(
    'rejects invalid score %s',
    (value) => expect(validScore(value, 'SCORED', '20.00')).toBe(false),
  );
  it('normalizes comma input without floats', () => expect(scoreInput(' 12,50 ')).toBe('12.50'));
  it.each(['ABSENT', 'EXCUSED', 'NOT_GRADED'] as const)('does not force zero for %s', (outcome) =>
    expect(validScore('', outcome, '20.00')).toBe(true),
  );
  it('allows assigned teacher entry but not validation or class population', () => {
    expect(canResults(session('TEACHER'), 'grades.update', 'write')).toBe(true);
    expect(canResults(session('TEACHER'), 'grades.validate', 'write')).toBe(false);
    expect(canResults(session('TEACHER'), 'grades.read', 'tenant')).toBe(false);
  });
  it.each(['PARENT', 'STUDENT'] as const)('allows %s scoped reading only', (role) => {
    expect(canResults(session(role), 'grades.read')).toBe(true);
    expect(canResults(session(role), 'grades.read', 'write')).toBe(false);
    expect(canResults(session(role), 'grades.update', 'write')).toBe(false);
  });
  it('denies accountants and unauthenticated users', () => {
    expect(canResults(session('ACCOUNTANT'), 'grades.read')).toBe(false);
    expect(canResults(undefined, 'grades.read')).toBe(false);
  });
  it('translates structured errors, never raw server text', () => {
    expect(resultErrorKey(new PeopleError('ASSESSMENT_LOCKED'))).toBe('locked');
    expect(resultErrorKey(new Error('Prisma internal details'))).toBe('unavailable');
  });
});
