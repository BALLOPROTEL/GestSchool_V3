import { describe, expect, it } from 'vitest';
import { roleGrants, type ReportActor, type SystemRole } from '@gestschool/contracts';
import { assertReportAccess, ReportAccessError } from '@gestschool/infrastructure';
const actor = (role: SystemRole): ReportActor => ({
  tenantId: '00000000-0000-4000-8000-000000000001',
  membershipId: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000003',
  roles: [role],
  grants: [...roleGrants[role]],
});
describe('LOT 12 report deny-by-default policy', () => {
  it.each([
    'SCHOOL_ADMIN',
    'DIRECTOR',
    'ACADEMIC_STAFF',
    'ACCOUNTANT',
    'TEACHER',
    'PARENT',
    'STUDENT',
  ] as const)('grants %s scoped dashboard and report permissions', (role) => {
    expect(() => assertReportAccess(actor(role), 'STUDENTS')).not.toThrow();
  });
  it('does not make reports.read a substitute for a source permission', () => {
    const value = {
      ...actor('PARENT'),
      grants: roleGrants.PARENT.filter((grant) => grant.permission !== 'invoices.read'),
    };
    expect(() => assertReportAccess(value, 'FINANCE')).toThrow(ReportAccessError);
  });
  it('blocks finance and results according to source-role permissions', () => {
    expect(() => assertReportAccess(actor('ACADEMIC_STAFF'), 'FINANCE')).toThrow();
    expect(() => assertReportAccess(actor('ACCOUNTANT'), 'RESULTS')).toThrow();
  });
  it('requires reports.export separately for export operations', () => {
    const value = {
      ...actor('SCHOOL_ADMIN'),
      grants: roleGrants.SCHOOL_ADMIN.filter((grant) => grant.permission !== 'reports.export'),
    };
    expect(() => assertReportAccess(value, 'STUDENTS', 'export')).toThrow();
  });
});
