import { Prisma } from '@gestschool/database';
import type { RequestContext } from '../../iam/domain/context.js';
import { resultTenant } from '../domain/policy.js';

export function hasScope(context: RequestContext, permission: string, scope: string): boolean {
  return context.grants.some((grant) => grant.permission === permission && grant.scope === scope);
}
// SQL aliases a (assessment) and s (student) are constants, never request input.
export function studentResultScope(context: RequestContext, permission: string): Prisma.Sql {
  if (resultTenant(context, permission)) return Prisma.sql`TRUE`;
  return Prisma.sql`(
    (${hasScope(context, permission, 'OWN')} AND s.user_id=${context.userId}::uuid) OR
    (${hasScope(context, permission, 'CHILDREN')} AND EXISTS (
      SELECT 1 FROM student_guardians sg JOIN guardians p ON (p.tenant_id,p.id)=(sg.tenant_id,sg.guardian_id)
      WHERE sg.tenant_id=${context.tenantId}::uuid AND sg.student_id=s.id AND p.user_id=${context.userId}::uuid AND p.status='ACTIVE'
    ))
  )`;
}
export function assessmentResultScope(context: RequestContext, permission: string): Prisma.Sql {
  if (resultTenant(context, permission)) return Prisma.sql`TRUE`;
  return Prisma.sql`(
    (${hasScope(context, permission, 'ASSIGNED')} AND EXISTS (
      SELECT 1 FROM teaching_assignments ta JOIN teachers t ON (t.tenant_id,t.id)=(ta.tenant_id,ta.teacher_id)
      WHERE ta.tenant_id=${context.tenantId}::uuid AND ta.class_subject_id=a.class_subject_id
        AND ta.academic_period_id=a.academic_period_id AND ta.status='ACTIVE'
        AND t.user_id=${context.userId}::uuid AND t.status='ACTIVE'
    )) OR (a.status IN ('PUBLISHED','LOCKED') AND a.archived_at IS NULL AND EXISTS (
      SELECT 1 FROM grades g JOIN students s ON (s.tenant_id,s.id)=(g.tenant_id,g.student_id)
      WHERE g.tenant_id=${context.tenantId}::uuid AND g.assessment_id=a.id AND g.status IN ('PUBLISHED','LOCKED')
        AND ${studentResultScope(context, permission)}
    ))
  )`;
}
export function assignedResultScope(
  context: RequestContext,
  permission: string,
  classSubject: Prisma.Sql,
  period: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`(${hasScope(context, permission, 'ASSIGNED')} AND EXISTS (
    SELECT 1 FROM teaching_assignments ta JOIN teachers t ON (t.tenant_id,t.id)=(ta.tenant_id,ta.teacher_id)
    WHERE ta.tenant_id=${context.tenantId}::uuid AND ta.class_subject_id=${classSubject}
      AND ta.academic_period_id=${period} AND ta.status='ACTIVE' AND t.status='ACTIVE' AND t.user_id=${context.userId}::uuid
  ))`;
}
