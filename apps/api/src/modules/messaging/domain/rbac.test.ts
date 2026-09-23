import { describe, expect, it } from 'vitest';
import { roleGrants, type SystemRole } from '@gestschool/contracts';

const grant = (role: SystemRole, permission: string) =>
  roleGrants[role].find((item) => item.permission === permission);

describe('communications RBAC defaults', () => {
  it('grants tenant administration only to approved staff roles', () => {
    expect(grant('SCHOOL_ADMIN', 'communications.retry')?.scope).toBe('TENANT');
    expect(grant('SCHOOL_ADMIN', 'notification-templates.manage')?.scope).toBe('TENANT');
    expect(grant('DIRECTOR', 'communications.send')?.scope).toBe('TENANT');
    expect(grant('ACADEMIC_STAFF', 'communications.send')?.scope).toBe('TENANT');
    expect(grant('ACCOUNTANT', 'communications.send')?.scope).toBe('TENANT');
  });

  it('limits teachers to assigned audiences and denies parent/student administration', () => {
    expect(grant('TEACHER', 'communications.read')?.scope).toBe('ASSIGNED');
    expect(grant('TEACHER', 'communications.send')?.scope).toBe('ASSIGNED');
    expect(grant('PARENT', 'communications.read')).toBeUndefined();
    expect(grant('STUDENT', 'communications.send')).toBeUndefined();
    expect(grant('ACCOUNTANT', 'notification-templates.manage')).toBeUndefined();
  });
});
